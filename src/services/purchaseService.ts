import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  runTransaction,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Supplier, Purchase, InventoryTransaction, PaymentRecord } from '../types';

export const purchaseService = {
  async getSuppliers(orgId: string) {
    const q = query(collection(db, `organizations/${orgId}/suppliers`), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
  },

  async createSupplier(orgId: string, supplierData: Partial<Supplier>) {
    const supplierRef = doc(collection(db, `organizations/${orgId}/suppliers`));
    const newSupplier = {
      ...supplierData,
      id: supplierRef.id,
      orgId,
      balance: supplierData.balance || 0,
    };
    await setDoc(supplierRef, newSupplier);
    return newSupplier;
  },

  async updateSupplier(orgId: string, supplierId: string, supplierData: Partial<Supplier>) {
    const supplierRef = doc(db, `organizations/${orgId}/suppliers`, supplierId);
    await updateDoc(supplierRef, supplierData);
  },

  async deleteSupplier(orgId: string, supplierId: string) {
    const supplierRef = doc(db, `organizations/${orgId}/suppliers`, supplierId);
    const supplierSnap = await getDoc(supplierRef);
    if (!supplierSnap.exists()) throw new Error('Supplier not found');

    const supplier = supplierSnap.data() as Supplier;
    if ((supplier.balance || 0) > 0) {
      throw new Error('Supplier cannot be deleted while a pending amount exists');
    }

    await deleteDoc(supplierRef);
  },

  async createPurchase(orgId: string, purchaseData: Omit<Purchase, 'id' | 'timestamp'>) {
    return await runTransaction(db, async (transaction) => {
      const purchaseRef = doc(collection(db, `organizations/${orgId}/purchases`));
      const supplierRef = doc(db, `organizations/${orgId}/suppliers`, purchaseData.supplierId);
      
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists()) throw new Error('Supplier not found');
      
      const currentBalance = supplierSnap.data().balance || 0;
      const outstandingAmount = purchaseData.totalAmount - purchaseData.paidAmount;

      const lineSnapshots = await Promise.all(
        purchaseData.items.map(async (line) => {
          const itemRef = doc(db, `organizations/${orgId}/items`, line.itemId);
          const summaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${line.itemId}_${purchaseData.locationId}`);

          const [itemSnap, summarySnap] = await Promise.all([
            transaction.get(itemRef),
            transaction.get(summaryRef)
          ]);

          if (!itemSnap.exists()) throw new Error(`Item ${line.itemId} not found`);

          return {
            line,
            itemRef,
            summaryRef,
            currentStock: itemSnap.data().currentStock || 0,
            currentLocStock: summarySnap.exists() ? summarySnap.data().quantity : 0
          };
        })
      );

      // 1. Create Purchase Record
      const purchase: Purchase = {
        ...purchaseData,
        id: purchaseRef.id,
        previousDueAmount: Math.max(currentBalance, 0),
        timestamp: Date.now(),
      };
      transaction.set(purchaseRef, purchase);

      // 2. Update Supplier Balance if credit
      if (outstandingAmount > 0) {
        const nextBalance = currentBalance + outstandingAmount;
        transaction.update(supplierRef, {
          balance: nextBalance
        });

        const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
        const paymentRecord: PaymentRecord = {
          id: paymentRef.id,
          orgId,
          entityType: 'supplier',
          entityId: purchaseData.supplierId,
          amount: outstandingAmount,
          direction: 'purchase_due_added',
          balanceAfter: nextBalance,
          paymentMethod: purchaseData.paymentType === 'cash' ? 'cash' : 'bank',
          referenceId: purchaseRef.id,
          timestamp: Date.now(),
          userId: purchaseData.userId,
          notes: purchaseData.notes || 'Product purchase',
        };
        transaction.set(paymentRef, paymentRecord);
      }

      // 3. Update Stock for each item
      for (const { line, itemRef, summaryRef, currentStock, currentLocStock } of lineSnapshots) {
        transaction.update(itemRef, {
          currentStock: currentStock + line.quantity,
          basePrice: line.unitCost // Update buying price
        });

        transaction.set(summaryRef, {
          itemId: line.itemId,
          locationId: purchaseData.locationId,
          quantity: currentLocStock + line.quantity
        }, { merge: true });

        // 4. Create Inventory Transaction
        const invTransRef = doc(collection(db, `organizations/${orgId}/transactions`));
        const invTrans: InventoryTransaction = {
          id: invTransRef.id,
          orgId,
          itemId: line.itemId,
          type: 'PURCHASE_IN',
          destinationLocationId: purchaseData.locationId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          referenceId: purchaseRef.id,
          userId: purchaseData.userId,
          timestamp: Date.now(),
          status: 'completed'
        };
        transaction.set(invTransRef, invTrans);
      }

      return purchase;
    });
  },

  async getPurchases(orgId: string) {
    const q = query(collection(db, `organizations/${orgId}/purchases`), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
  },

  async getSupplierPaymentRecords(orgId: string, supplierId: string) {
    const q = query(
      collection(db, `organizations/${orgId}/payments`),
      where('entityType', '==', 'supplier'),
      where('entityId', '==', supplierId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() } as PaymentRecord))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async createSupplierBalanceTransaction(
    orgId: string,
    userId: string,
    data: {
      supplierId: string;
      amount: number;
      action: 'pay-supplier' | 'add-due' | 'write-off';
      paymentMethod?: 'cash' | 'bank' | 'cheque';
      notes?: string;
    }
  ) {
    return await runTransaction(db, async (transaction) => {
      const supplierRef = doc(db, `organizations/${orgId}/suppliers`, data.supplierId);
      const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
      const supplierSnap = await transaction.get(supplierRef);

      if (!supplierSnap.exists()) throw new Error('Supplier not found');
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      const supplier = supplierSnap.data() as Supplier;
      const currentBalance = supplier.balance || 0;

      let balanceDelta = 0;
      let direction: PaymentRecord['direction'] = 'payment_made';

      if (data.action === 'add-due') {
        balanceDelta = data.amount;
        direction = 'balance_added';
      } else if (data.action === 'write-off') {
        if (data.amount > currentBalance) {
          throw new Error('Write-off amount cannot exceed the current supplier balance');
        }
        balanceDelta = -data.amount;
        direction = 'write_off';
      } else {
        // 'pay-supplier'
        if (data.amount > currentBalance) {
          throw new Error('Payment amount cannot exceed the current supplier balance');
        }
        balanceDelta = -data.amount;
        direction = 'payment_made';
      }

      const nextBalance = currentBalance + balanceDelta;

      transaction.update(supplierRef, {
        balance: nextBalance,
      });

      const paymentRecord: PaymentRecord = {
        id: paymentRef.id,
        orgId,
        entityType: 'supplier',
        entityId: data.supplierId,
        amount: data.amount,
        direction,
        balanceAfter: nextBalance,
        paymentMethod: data.paymentMethod || 'cash',
        timestamp: Date.now(),
        userId,
        notes: data.notes || '',
      };

      transaction.set(paymentRef, paymentRecord);

      return paymentRecord;
    });
  },

  async recalculateSupplierBalanceAndHistory(orgId: string, supplierId: string) {
    const supplierRef = doc(db, `organizations/${orgId}/suppliers`, supplierId);
    const supplierSnap = await getDoc(supplierRef);
    if (!supplierSnap.exists()) throw new Error('Supplier not found');

    const purchasesQuery = query(collection(db, `organizations/${orgId}/purchases`), where('supplierId', '==', supplierId));
    const paymentsQuery = query(
      collection(db, `organizations/${orgId}/payments`),
      where('entityType', '==', 'supplier'),
      where('entityId', '==', supplierId)
    );

    const [purchasesSnap, paymentsSnap] = await Promise.all([
      getDocs(purchasesQuery),
      getDocs(paymentsQuery),
    ]);

    const purchasesData = purchasesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
    const paymentsData = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));

    const existingPaymentRefs = new Set(paymentsData.filter(p => p.referenceId).map(p => p.referenceId as string));

    const paymentEntries = paymentsData.map(p => ({
      id: p.id,
      isPayment: true,
      timestamp: p.timestamp,
      amount: p.amount,
      tone: p.direction === 'payment_made' || p.direction === 'write_off' ? 'decrease' : 'increase'
    }));

    const inferredPurchases = purchasesData
      .filter(purchase => purchase.totalAmount > purchase.paidAmount && !existingPaymentRefs.has(purchase.id))
      .map(purchase => ({
        id: purchase.id,
        isPayment: false,
        timestamp: purchase.timestamp,
        amount: purchase.totalAmount - purchase.paidAmount,
        tone: 'increase'
      }));

    const merged = [...paymentEntries, ...inferredPurchases].sort((a, b) => a.timestamp - b.timestamp);

    let runningBalance = 0;
    const paymentUpdates: Array<{ id: string; balanceAfter: number }> = [];

    merged.forEach(entry => {
      const diff = entry.amount;
      runningBalance += entry.tone === 'increase' ? diff : -diff;
      runningBalance = Math.max(runningBalance, 0);

      if (entry.isPayment) {
        paymentUpdates.push({ id: entry.id, balanceAfter: runningBalance });
      }
    });

    await runTransaction(db, async (transaction) => {
      transaction.update(supplierRef, { balance: runningBalance });
      paymentUpdates.forEach(update => {
        const ref = doc(db, `organizations/${orgId}/payments`, update.id);
        transaction.update(ref, { balanceAfter: update.balanceAfter });
      });
    });
  },

  async updateSupplierPaymentRecord(orgId: string, paymentId: string, updates: {
    amount: number;
    notes: string;
    timestamp: number;
    paymentMethod: PaymentRecord['paymentMethod'];
    direction: PaymentRecord['direction'];
  }) {
    if (paymentId.startsWith('mock-purchase-')) {
      const purchaseId = paymentId.replace('mock-purchase-', '');
      const purchaseRef = doc(db, `organizations/${orgId}/purchases`, purchaseId);
      const purchaseSnap = await getDoc(purchaseRef);
      if (!purchaseSnap.exists()) throw new Error('Purchase not found');
      const purchase = purchaseSnap.data() as Purchase;
      const supplierId = purchase.supplierId;

      await runTransaction(db, async (transaction) => {
        const newPaidAmount = Math.max(0, purchase.totalAmount - updates.amount);
        transaction.update(purchaseRef, {
          paidAmount: newPaidAmount,
          notes: updates.notes,
          timestamp: updates.timestamp,
          paymentType: updates.paymentMethod === 'cash' ? 'cash' : 'bank'
        });
      });

      await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
      return;
    }

    const paymentRef = doc(db, `organizations/${orgId}/payments`, paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) throw new Error('Transaction not found');
    const paymentData = paymentSnap.data() as PaymentRecord;
    const supplierId = paymentData.entityId;

    await runTransaction(db, async (transaction) => {
      if (paymentData.referenceId && paymentData.direction === 'purchase_due_added') {
        const purchaseRef = doc(db, `organizations/${orgId}/purchases`, paymentData.referenceId);
        const purchaseSnap = await transaction.get(purchaseRef);
        if (purchaseSnap.exists()) {
          const purchase = purchaseSnap.data() as Purchase;
          const newPaidAmount = Math.max(0, purchase.totalAmount - updates.amount);
          transaction.update(purchaseRef, {
            paidAmount: newPaidAmount
          });
        }
      }

      transaction.update(paymentRef, {
        amount: updates.amount,
        notes: updates.notes,
        timestamp: updates.timestamp,
        paymentMethod: updates.paymentMethod,
        direction: updates.direction
      });
    });

    await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
  },

  async deleteSupplierPaymentRecord(orgId: string, paymentId: string) {
    if (paymentId.startsWith('mock-purchase-')) {
      const purchaseId = paymentId.replace('mock-purchase-', '');
      const purchaseRef = doc(db, `organizations/${orgId}/purchases`, purchaseId);
      const purchaseSnap = await getDoc(purchaseRef);
      if (!purchaseSnap.exists()) throw new Error('Purchase not found');
      const purchase = purchaseSnap.data() as Purchase;
      const supplierId = purchase.supplierId;

      await runTransaction(db, async (transaction) => {
        transaction.update(purchaseRef, {
          paidAmount: purchase.totalAmount
        });
      });

      await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
      return;
    }

    const paymentRef = doc(db, `organizations/${orgId}/payments`, paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) throw new Error('Transaction not found');
    const paymentData = paymentSnap.data() as PaymentRecord;
    const supplierId = paymentData.entityId;

    await runTransaction(db, async (transaction) => {
      if (paymentData.referenceId && paymentData.direction === 'purchase_due_added') {
        const purchaseRef = doc(db, `organizations/${orgId}/purchases`, paymentData.referenceId);
        const purchaseSnap = await transaction.get(purchaseRef);
        if (purchaseSnap.exists()) {
          const purchase = purchaseSnap.data() as Purchase;
          transaction.update(purchaseRef, {
            paidAmount: purchase.totalAmount
          });
        }
      }

      transaction.delete(paymentRef);
    });

    await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
  },
};
