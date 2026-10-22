import {
  collection, 
  doc, 
  deleteDoc,
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  runTransaction,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Customer, Sale, InventoryTransaction, PaymentRecord, CustomerReturn, ReturnLine, CashLedgerTransaction } from '../types';
import { isValidQuantityForUnit } from '../utils/quantity';

function normalizeSaleLines(items: Sale['items']) {
  return items
    .filter((line) => line.itemId)
    .map((line) => {
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unitPrice) || 0;

      return {
        itemId: line.itemId,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      };
    })
    .filter((line) => line.quantity > 0);
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getCashAmountForSale(paymentType: Sale['paymentType'], totalAmount: number, paidAmount: number) {
  if (paymentType !== 'cash') return 0;
  return roundCurrencyAmount(Math.min(Math.max(paidAmount, 0), totalAmount));
}

export const saleService = {
  async getCustomers(orgId: string) {
    const q = query(collection(db, `organizations/${orgId}/customers`), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
  },

  async getCustomer(orgId: string, customerId: string) {
    const customerSnap = await getDoc(doc(db, `organizations/${orgId}/customers`, customerId));
    if (!customerSnap.exists()) return null;
    return { id: customerSnap.id, ...customerSnap.data() } as Customer;
  },

  async getCustomerPaymentRecords(orgId: string, customerId: string) {
    const q = query(
      collection(db, `organizations/${orgId}/payments`),
      where('entityType', '==', 'customer'),
      where('entityId', '==', customerId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() } as PaymentRecord))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async createCustomer(orgId: string, customerData: Partial<Customer>) {
    const customerRef = doc(collection(db, `organizations/${orgId}/customers`));
    const newCustomer = {
      ...customerData,
      id: customerRef.id,
      orgId,
      balance: customerData.balance || 0,
    };
    await setDoc(customerRef, newCustomer);
    return newCustomer;
  },

  async createSale(orgId: string, saleData: Omit<Sale, 'id' | 'timestamp' | 'taxAmount'>) {
    return await runTransaction(db, async (transaction) => {
      const saleRef = doc(collection(db, `organizations/${orgId}/sales`));
      const customerRef = doc(db, `organizations/${orgId}/customers`, saleData.customerId);
      const orgRef = doc(db, `organizations`, orgId);
      
      const [customerSnap, orgSnap] = await Promise.all([
        transaction.get(customerRef),
        transaction.get(orgRef)
      ]);

      if (!customerSnap.exists()) throw new Error('Customer not found');
      if (!orgSnap.exists()) throw new Error('Organization not found');
      
      const orgData = orgSnap.data();
      const isGstBill = saleData.isGstBill || false;
      const saleSubtotal = roundCurrencyAmount(saleData.totalAmount);
      const settingsTaxRate = orgData?.settings?.taxRate ?? 0;
      const taxAmount = isGstBill ? roundCurrencyAmount((saleSubtotal * settingsTaxRate) / 100) : 0;
      const finalTotal = roundCurrencyAmount(saleSubtotal + taxAmount);
      const normalizedPaidAmount = saleData.paymentType === 'cash'
        ? finalTotal
        : roundCurrencyAmount(Math.min(Math.max(0, Number(saleData.paidAmount) || 0), finalTotal));

      const currentBalance = customerSnap.data().balance || 0;
      const outstandingAmount = roundCurrencyAmount(Math.max(finalTotal - normalizedPaidAmount, 0));

      const lineSnapshots = await Promise.all(
        saleData.items.map(async (line) => {
          const itemRef = doc(db, `organizations/${orgId}/items`, line.itemId);
          const summaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${line.itemId}_${saleData.locationId}`);
          const [itemSnap, summarySnap] = await Promise.all([
            transaction.get(itemRef),
            transaction.get(summaryRef)
          ]);

          if (!itemSnap.exists()) {
            throw new Error(`Item ${line.itemId} not found`);
          }

          const currentStock = itemSnap.data().currentStock || 0;
          const currentLocStock = summarySnap.exists() ? summarySnap.data().quantity : 0;

          return {
            line,
            itemRef,
            itemData: itemSnap.data(),
            summaryRef,
            currentStock,
            currentLocStock,
          };
        })
      );

      // 1. Create Sale Record
      const sale: Sale = {
        ...saleData,
        id: saleRef.id,
        previousDueAmount: Math.max(currentBalance, 0),
        taxAmount,
        totalAmount: finalTotal,
        paidAmount: normalizedPaidAmount,
        timestamp: Date.now(),
        isGstBill,
        gstAmount: isGstBill ? taxAmount : 0,
        taxRate: isGstBill ? settingsTaxRate : 0,
      };
      transaction.set(saleRef, sale);

      // Save the latest invoice number sequentially after each completed sale
      if (isGstBill && saleData.gstBillNumber) {
        const nextSettings = {
          ...orgData?.settings,
          lastGstInvoiceNumber: saleData.gstBillNumber,
        };
        transaction.update(orgRef, { settings: nextSettings });
      }

      // 2. Update Customer Balance if credit
      if (outstandingAmount > 0) {
        const nextBalance = roundCurrencyAmount(currentBalance + outstandingAmount);
        transaction.update(customerRef, {
          balance: nextBalance
        });

        const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
        const paymentRecord: PaymentRecord = {
          id: paymentRef.id,
          orgId,
          entityType: 'customer',
          entityId: saleData.customerId,
          amount: outstandingAmount,
          direction: 'sale_due_added',
          balanceAfter: nextBalance,
          paymentMethod: saleData.paymentType === 'cash' ? 'cash' : 'bank',
          referenceId: saleRef.id,
          timestamp: Date.now(),
          userId: saleData.userId,
          notes: saleData.notes || 'Product sale',
        };
        transaction.set(paymentRef, paymentRecord);
      }

      const initialCashAmount = getCashAmountForSale(sale.paymentType, sale.totalAmount, sale.paidAmount);
      if (initialCashAmount > 0) {
        const cashLedgerRef = doc(collection(db, `organizations/${orgId}/cashLedger`));
        const receiptEntry: CashLedgerTransaction = {
          id: cashLedgerRef.id,
          saleId: saleRef.id,
          type: 'receipt',
          amount: initialCashAmount,
          timestamp: sale.timestamp,
          description: `Cash received for sale ${saleRef.id}`,
        };
        transaction.set(cashLedgerRef, receiptEntry);
      }

      // 3. Update Stock for each item
      for (const { line, itemRef, itemData, summaryRef, currentStock, currentLocStock } of lineSnapshots) {
        if (!isValidQuantityForUnit(line.quantity, itemData.unit)) {
          throw new Error(`Quantity for ${itemData.name || line.itemId} must be a valid ${itemData.unit || 'item'} amount`);
        }
        if (line.quantity > currentLocStock) {
          throw new Error(`Insufficient stock for ${itemData.name || line.itemId} at the selected location`);
        }

        transaction.update(itemRef, {
          currentStock: currentStock - line.quantity
        });

        transaction.set(summaryRef, {
          itemId: line.itemId,
          locationId: saleData.locationId,
          quantity: currentLocStock - line.quantity
        }, { merge: true });

        // 4. Create Inventory Transaction
        const invTransRef = doc(collection(db, `organizations/${orgId}/transactions`));
        const invTrans: InventoryTransaction = {
          id: invTransRef.id,
          orgId,
          itemId: line.itemId,
          type: 'SALE_OUT',
          sourceLocationId: saleData.locationId,
          quantity: line.quantity,
          unitSellPrice: line.unitPrice,
          referenceId: saleRef.id,
          userId: saleData.userId,
          timestamp: Date.now(),
          status: 'completed'
        };
        transaction.set(invTransRef, invTrans);
      }

      return sale;
    });
  },

  async getSale(orgId: string, saleId: string) {
    const saleSnap = await getDoc(doc(db, `organizations/${orgId}/sales`, saleId));
    if (!saleSnap.exists()) return null;
    return { id: saleSnap.id, ...saleSnap.data() } as Sale;
  },

  async getSales(orgId: string) {
    const q = query(collection(db, `organizations/${orgId}/sales`), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
  },

  async getCustomerSales(orgId: string, customerId: string) {
    const q = query(
      collection(db, `organizations/${orgId}/sales`),
      where('customerId', '==', customerId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Sale))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async getSalePaymentRecords(orgId: string, saleId: string) {
    const q = query(
      collection(db, `organizations/${orgId}/payments`),
      where('referenceId', '==', saleId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async updateCustomer(orgId: string, customerId: string, data: Partial<Customer>) {
    const customerRef = doc(db, `organizations/${orgId}/customers`, customerId);
    await updateDoc(customerRef, data);
  },

  async deleteCustomer(orgId: string, customerId: string) {
    const customerRef = doc(db, `organizations/${orgId}/customers`, customerId);
    const customerSnap = await getDoc(customerRef);
    if (!customerSnap.exists()) throw new Error('Customer not found');

    const customer = customerSnap.data() as Customer;
    if ((customer.balance || 0) > 0) {
      throw new Error('Customer cannot be deleted while a pending amount exists');
    }

    await deleteDoc(customerRef);
  },

  async getCustomerReturnEligibility(orgId: string, customerId: string) {
    const salesQuery = query(collection(db, `organizations/${orgId}/sales`), where('customerId', '==', customerId));
    const returnsQuery = query(collection(db, `organizations/${orgId}/customerReturns`), where('customerId', '==', customerId));

    const [salesSnapshot, returnsSnapshot] = await Promise.all([
      getDocs(salesQuery),
      getDocs(returnsQuery),
    ]);

    const soldByItem: Record<string, number> = {};
    const returnedByItem: Record<string, number> = {};

    salesSnapshot.docs.forEach((saleDoc) => {
      const sale = saleDoc.data() as Sale;
      sale.items.forEach((line) => {
        soldByItem[line.itemId] = (soldByItem[line.itemId] || 0) + line.quantity;
      });
    });

    returnsSnapshot.docs.forEach((returnDoc) => {
      const customerReturn = returnDoc.data() as CustomerReturn;
      customerReturn.items.forEach((line) => {
        returnedByItem[line.itemId] = (returnedByItem[line.itemId] || 0) + line.quantity;
      });
    });

    const eligibility: Record<string, { sold: number; returned: number; remaining: number }> = {};

    Object.entries(soldByItem).forEach(([itemId, sold]) => {
      const returned = returnedByItem[itemId] || 0;
      eligibility[itemId] = {
        sold,
        returned,
        remaining: Math.max(sold - returned, 0),
      };
    });

    return eligibility;
  },

  async getCustomerReturns(orgId: string, customerId: string) {
    const q = query(
      collection(db, `organizations/${orgId}/customerReturns`),
      where('customerId', '==', customerId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() } as CustomerReturn))
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  async createCustomerReturn(
    orgId: string,
    userId: string,
    data: {
      customerId: string;
      locationId: string;
      items: ReturnLine[];
      reason: string;
    }
  ) {
    const eligibility = await this.getCustomerReturnEligibility(orgId, data.customerId);

    data.items.forEach((line) => {
      const remaining = eligibility[line.itemId]?.remaining || 0;
      if (line.quantity > remaining) {
        throw new Error('Return quantity cannot exceed the quantity purchased by this customer');
      }
    });

    return await runTransaction(db, async (transaction) => {
      const returnRef = doc(collection(db, `organizations/${orgId}/customerReturns`));
      const customerRef = doc(db, `organizations/${orgId}/customers`, data.customerId);
      const customerSnap = await transaction.get(customerRef);
      if (!customerSnap.exists()) {
        throw new Error('Customer not found');
      }

      const customer = customerSnap.data() as Customer;
      const returnRecord: CustomerReturn = {
        id: returnRef.id,
        orgId,
        customerId: data.customerId,
        locationId: data.locationId,
        items: data.items,
        totalAmount: data.items.reduce((sum, line) => sum + line.subtotal, 0),
        reason: data.reason,
        timestamp: Date.now(),
        userId,
      };

      for (const line of data.items) {
        const itemRef = doc(db, `organizations/${orgId}/items`, line.itemId);
        const summaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${line.itemId}_${data.locationId}`);
        const [itemSnap, summarySnap] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(summaryRef),
        ]);

        if (!itemSnap.exists()) {
          throw new Error(`Item ${line.itemId} not found`);
        }

        const currentStock = itemSnap.data().currentStock || 0;
        const currentLocStock = summarySnap.exists() ? summarySnap.data().quantity : 0;

        transaction.update(itemRef, {
          currentStock: currentStock + line.quantity,
        });

        transaction.set(summaryRef, {
          itemId: line.itemId,
          locationId: data.locationId,
          quantity: currentLocStock + line.quantity,
        }, { merge: true });

        const invTransRef = doc(collection(db, `organizations/${orgId}/transactions`));
        const invTrans: InventoryTransaction = {
          id: invTransRef.id,
          orgId,
          itemId: line.itemId,
          type: 'CUSTOMER_RETURN',
          destinationLocationId: data.locationId,
          quantity: line.quantity,
          unitSellPrice: line.unitPrice,
          referenceId: returnRef.id,
          userId,
          timestamp: Date.now(),
          notes: `Customer Return: ${data.reason}`,
          status: 'completed',
        };
        transaction.set(invTransRef, invTrans);
      }

      const nextBalance = Math.max((customer.balance || 0) - returnRecord.totalAmount, 0);
      const refundedAmount = Math.max((customer.balance || 0) - nextBalance, 0);
      transaction.update(customerRef, {
        balance: nextBalance,
      });

      if (refundedAmount > 0) {
        const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
        const paymentRecord: PaymentRecord = {
          id: paymentRef.id,
          orgId,
          entityType: 'customer',
          entityId: data.customerId,
          amount: refundedAmount,
          direction: 'return_refund',
          balanceAfter: nextBalance,
          paymentMethod: 'cash',
          referenceId: returnRef.id,
          timestamp: Date.now(),
          userId,
          notes: data.reason || 'Customer return refund',
        };
        transaction.set(paymentRef, paymentRecord);
      }

      transaction.set(returnRef, returnRecord);
      return returnRecord;
    });
  },

  async createCustomerBalanceTransaction(
    orgId: string,
    userId: string,
    data: {
      customerId: string;
      amount: number;
      action: 'collect-payment' | 'add-due' | 'write-off';
      paymentMethod?: 'cash' | 'bank' | 'cheque';
      notes?: string;
    }
  ) {
    return await runTransaction(db, async (transaction) => {
      const customerRef = doc(db, `organizations/${orgId}/customers`, data.customerId);
      const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
      const customerSnap = await transaction.get(customerRef);

      if (!customerSnap.exists()) throw new Error('Customer not found');
      if (!Number.isFinite(data.amount) || data.amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      const customer = customerSnap.data() as Customer;
      const currentBalance = customer.balance || 0;

      let balanceDelta = 0;
      let direction: PaymentRecord['direction'] = 'payment_received';

      if (data.action === 'add-due') {
        balanceDelta = data.amount;
        direction = 'balance_added';
      } else if (data.action === 'write-off') {
        if (data.amount > currentBalance) {
          throw new Error('Write-off amount cannot exceed the current customer balance');
        }
        balanceDelta = -data.amount;
        direction = 'write_off';
      } else {
        balanceDelta = -data.amount;
        direction = 'payment_received';
      }

      const nextBalance = currentBalance + balanceDelta;

      transaction.update(customerRef, {
        balance: nextBalance,
      });

      const paymentRecord: PaymentRecord = {
        id: paymentRef.id,
        orgId,
        entityType: 'customer',
        entityId: data.customerId,
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

  async updateSale(
    orgId: string,
    saleId: string,
    data: {
      customerId: string;
      locationId: string;
      items: Sale['items'];
      paidAmount: number;
      paymentType: 'cash' | 'credit';
      notes?: string;
      timestamp?: number;
      isGstBill?: boolean;
      taxRate?: number;
      gstBillNumber?: string;
    }
  ) {
    const transactionSnapshot = await getDocs(
      query(collection(db, `organizations/${orgId}/transactions`), where('referenceId', '==', saleId))
    );
    const paymentSnapshot = await getDocs(
      query(collection(db, `organizations/${orgId}/payments`), where('referenceId', '==', saleId))
    );

    return await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, `organizations/${orgId}/sales`, saleId);
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists()) throw new Error('Sale not found');

      const sale = saleSnap.data() as Sale;
      const items = normalizeSaleLines(data.items);
      if (!data.customerId) throw new Error('Customer is required');
      if (!data.locationId) throw new Error('Location is required');
      if (items.length === 0) throw new Error('Add at least one item to the sale');

      const previousOutstanding = Math.max(sale.totalAmount - sale.paidAmount, 0);
      const customerRef = doc(db, `organizations/${orgId}/customers`, sale.customerId);
      const nextCustomerRef = doc(db, `organizations/${orgId}/customers`, data.customerId);
      const orgRef = doc(db, `organizations`, orgId);

      const [customerSnap, nextCustomerSnap, orgSnap] = await Promise.all([
        transaction.get(customerRef),
        transaction.get(nextCustomerRef),
        transaction.get(orgRef),
      ]);
      if (!customerSnap.exists()) throw new Error('Existing customer not found');
      if (!nextCustomerSnap.exists()) throw new Error('Customer not found');
      if (!orgSnap.exists()) throw new Error('Organization not found');

      const orgData = orgSnap.data();
      const isGstBill = typeof data.isGstBill === 'boolean' ? data.isGstBill : (sale.isGstBill || false);
      const subtotalAmount = roundCurrencyAmount(items.reduce((sum, line) => sum + line.subtotal, 0));
      const saleTaxRate = data.taxRate ?? sale.taxRate ?? (orgData?.settings?.taxRate ?? 18);
      const taxAmount = isGstBill ? roundCurrencyAmount((subtotalAmount * saleTaxRate) / 100) : 0;
      const finalTotal = roundCurrencyAmount(subtotalAmount + taxAmount);
      const nextPaidAmount = data.paymentType === 'cash'
        ? finalTotal
        : roundCurrencyAmount(Math.max(0, Number(data.paidAmount) || 0));
      if (nextPaidAmount > finalTotal) {
        throw new Error('Paid amount cannot exceed total amount');
      }
      const nextOutstanding = roundCurrencyAmount(Math.max(finalTotal - nextPaidAmount, 0));
      const nextTimestamp = data.timestamp ?? sale.timestamp;
      const previousPaidAmount = roundCurrencyAmount(sale.paidAmount || 0);
      const previousCashAmount = getCashAmountForSale(sale.paymentType, roundCurrencyAmount(sale.totalAmount || 0), previousPaidAmount);
      const nextCashAmount = getCashAmountForSale(data.paymentType, finalTotal, nextPaidAmount);
      const cashDelta = roundCurrencyAmount(nextCashAmount - previousCashAmount);

      const itemIds = new Set<string>();
      sale.items.forEach((line) => itemIds.add(line.itemId));
      items.forEach((line) => itemIds.add(line.itemId));

      const stockDeltaByKey = new Map<string, { itemId: string; locationId: string; delta: number }>();
      const stockDeltaByItem = new Map<string, number>();
      const applyLineDelta = (itemId: string, locationId: string, delta: number) => {
        const key = `${itemId}_${locationId}`;
        const existing = stockDeltaByKey.get(key);
        stockDeltaByKey.set(key, {
          itemId,
          locationId,
          delta: (existing?.delta || 0) + delta,
        });
        stockDeltaByItem.set(itemId, (stockDeltaByItem.get(itemId) || 0) + delta);
      };

      sale.items.forEach((line) => applyLineDelta(line.itemId, sale.locationId, line.quantity));
      items.forEach((line) => applyLineDelta(line.itemId, data.locationId, -line.quantity));

      const itemSnapshots = await Promise.all(
        Array.from(itemIds).map(async (itemId) => {
          const itemRef = doc(db, `organizations/${orgId}/items`, itemId);
          const itemSnap = await transaction.get(itemRef);
          if (!itemSnap.exists()) {
            throw new Error(`Item ${itemId} not found`);
          }
          return { itemId, itemRef, itemSnap };
        })
      );

      const summarySnapshots = await Promise.all(
        Array.from(stockDeltaByKey.entries()).map(async ([key, value]) => {
          const summaryRef = doc(db, 'organizations', orgId, 'stockSummaries', key);
          const summarySnap = await transaction.get(summaryRef);
          return { key, summaryRef, summarySnap, value };
        })
      );

      itemSnapshots.forEach(({ itemId, itemRef, itemSnap }) => {
        const unit = itemSnap.data().unit;
        const lineToValidate = items.find((line) => line.itemId === itemId);
        if (lineToValidate && !isValidQuantityForUnit(lineToValidate.quantity, unit)) {
          throw new Error(`Quantity for ${itemSnap.data().name || itemId} must be a valid ${unit || 'item'} amount`);
        }

        const nextStock = (itemSnap.data().currentStock || 0) + (stockDeltaByItem.get(itemId) || 0);
        if (nextStock < 0) {
          throw new Error(`Insufficient total stock for item ${itemId}`);
        }
        transaction.update(itemRef, { currentStock: nextStock });
      });

      summarySnapshots.forEach(({ summaryRef, summarySnap, value }) => {
        const nextQuantity = (summarySnap.exists() ? summarySnap.data().quantity || 0 : 0) + value.delta;
        if (nextQuantity < 0) {
          throw new Error('Insufficient stock at the selected location');
        }
        transaction.set(summaryRef, {
          itemId: value.itemId,
          locationId: value.locationId,
          quantity: nextQuantity,
        }, { merge: true });
      });

      const currentBalance = customerSnap.data().balance || 0;
      const nextCustomerBalance = nextCustomerSnap.data().balance || 0;

      if (sale.customerId === data.customerId) {
        transaction.update(customerRef, {
          balance: roundCurrencyAmount(Math.max(currentBalance - previousOutstanding + nextOutstanding, 0)),
        });
      } else {
        transaction.update(customerRef, {
          balance: roundCurrencyAmount(Math.max(currentBalance - previousOutstanding, 0)),
        });
        transaction.update(nextCustomerRef, {
          balance: roundCurrencyAmount(Math.max(nextCustomerBalance + nextOutstanding, 0)),
        });
      }

      transaction.update(saleRef, {
        customerId: data.customerId,
        locationId: data.locationId,
        items,
        previousDueAmount: sale.customerId === data.customerId
          ? Math.max(sale.previousDueAmount ?? (currentBalance - previousOutstanding), 0)
          : Math.max(nextCustomerBalance, 0),
        totalAmount: finalTotal,
        taxAmount,
        paidAmount: nextPaidAmount,
        paymentType: data.paymentType,
        notes: data.notes || '',
        timestamp: nextTimestamp,
        isGstBill,
        ...(isGstBill ? { gstAmount: taxAmount, taxRate: saleTaxRate, gstBillNumber: data.gstBillNumber || '' } : { gstAmount: 0, taxRate: 0, gstBillNumber: '' }),
      });

      transactionSnapshot.docs
        .filter((entry) => (entry.data() as InventoryTransaction).type === 'SALE_OUT')
        .forEach((entry) => transaction.delete(entry.ref));

      items.forEach((line) => {
        const invTransRef = doc(collection(db, `organizations/${orgId}/transactions`));
        const invTrans: InventoryTransaction = {
          id: invTransRef.id,
          orgId,
          itemId: line.itemId,
          type: 'SALE_OUT',
          sourceLocationId: data.locationId,
          quantity: line.quantity,
          unitSellPrice: line.unitPrice,
          referenceId: saleId,
          userId: sale.userId,
          timestamp: nextTimestamp,
          status: 'completed',
        };
        transaction.set(invTransRef, invTrans);
      });

      paymentSnapshot.docs.forEach((entry) => transaction.delete(entry.ref));

      if (nextOutstanding > 0) {
        const paymentRef = doc(collection(db, `organizations/${orgId}/payments`));
        const paymentRecord: PaymentRecord = {
          id: paymentRef.id,
          orgId,
          entityType: 'customer',
          entityId: data.customerId,
          amount: nextOutstanding,
          direction: 'sale_due_updated',
          balanceAfter: sale.customerId === data.customerId
            ? roundCurrencyAmount(Math.max(currentBalance - previousOutstanding + nextOutstanding, 0))
            : roundCurrencyAmount(Math.max(nextCustomerBalance + nextOutstanding, 0)),
          paymentMethod: data.paymentType === 'cash' ? 'cash' : 'bank',
          referenceId: saleId,
          timestamp: nextTimestamp,
          userId: sale.userId,
          notes: data.notes || 'Sale updated',
        };
        transaction.set(paymentRef, paymentRecord);
      }

      if (cashDelta !== 0) {
        const cashLedgerRef = doc(collection(db, `organizations/${orgId}/cashLedger`));
        const cashLedgerEntry: CashLedgerTransaction = {
          id: cashLedgerRef.id,
          saleId,
          type: cashDelta > 0 ? 'receipt' : 'reversal',
          amount: Math.abs(cashDelta),
          timestamp: nextTimestamp,
          description: cashDelta > 0
            ? `Additional cash received after sale ${saleId} was updated`
            : `Cash reversed after sale ${saleId} was updated`,
        };
        transaction.set(cashLedgerRef, cashLedgerEntry);
      }
    });
  },

  async deleteSale(orgId: string, saleId: string) {
    const transactionSnapshot = await getDocs(
      query(collection(db, `organizations/${orgId}/transactions`), where('referenceId', '==', saleId))
    );
    const paymentSnapshot = await getDocs(
      query(collection(db, `organizations/${orgId}/payments`), where('referenceId', '==', saleId))
    );

    return await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, `organizations/${orgId}/sales`, saleId);
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists()) throw new Error('Sale not found');

      const sale = saleSnap.data() as Sale;
      const outstandingAmount = Math.max(sale.totalAmount - sale.paidAmount, 0);
      const customerRef = doc(db, `organizations/${orgId}/customers`, sale.customerId);
      const customerSnap = await transaction.get(customerRef);
      if (!customerSnap.exists()) throw new Error('Customer not found');

      const itemIds = Array.from(new Set(sale.items.map((line) => line.itemId)));
      const itemSnapshots = await Promise.all(
        itemIds.map(async (itemId) => {
          const itemRef = doc(db, `organizations/${orgId}/items`, itemId);
          const itemSnap = await transaction.get(itemRef);
          if (!itemSnap.exists()) {
            throw new Error(`Item ${itemId} not found`);
          }
          return { itemId, itemRef, itemSnap };
        })
      );

      const summarySnapshots = await Promise.all(
        itemIds.map(async (itemId) => {
          const summaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${itemId}_${sale.locationId}`);
          const summarySnap = await transaction.get(summaryRef);
          return { itemId, summaryRef, summarySnap };
        })
      );

      const quantityByItem = sale.items.reduce<Record<string, number>>((acc, line) => {
        acc[line.itemId] = (acc[line.itemId] || 0) + line.quantity;
        return acc;
      }, {});

      itemSnapshots.forEach(({ itemId, itemRef, itemSnap }) => {
        transaction.update(itemRef, {
          currentStock: (itemSnap.data().currentStock || 0) + (quantityByItem[itemId] || 0),
        });
      });

      summarySnapshots.forEach(({ itemId, summaryRef, summarySnap }) => {
        transaction.set(summaryRef, {
          itemId,
          locationId: sale.locationId,
          quantity: (summarySnap.exists() ? summarySnap.data().quantity || 0 : 0) + (quantityByItem[itemId] || 0),
        }, { merge: true });
      });

      transaction.update(customerRef, {
        balance: Math.max((customerSnap.data().balance || 0) - outstandingAmount, 0),
      });

      transaction.delete(saleRef);
      transactionSnapshot.docs.forEach((entry) => transaction.delete(entry.ref));
      paymentSnapshot.docs.forEach((entry) => transaction.delete(entry.ref));
    });
  },

  async recalculateCustomerBalanceAndHistory(orgId: string, customerId: string) {
    const customerRef = doc(db, `organizations/${orgId}/customers`, customerId);
    const customerSnap = await getDoc(customerRef);
    if (!customerSnap.exists()) throw new Error('Customer not found');

    const salesQuery = query(collection(db, `organizations/${orgId}/sales`), where('customerId', '==', customerId));
    const returnsQuery = query(collection(db, `organizations/${orgId}/customerReturns`), where('customerId', '==', customerId));
    const paymentsQuery = query(
      collection(db, `organizations/${orgId}/payments`),
      where('entityType', '==', 'customer'),
      where('entityId', '==', customerId)
    );

    const [salesSnap, returnsSnap, paymentsSnap] = await Promise.all([
      getDocs(salesQuery),
      getDocs(returnsQuery),
      getDocs(paymentsQuery),
    ]);

    const salesData = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
    const returnsData = returnsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerReturn));
    const paymentsData = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));

    const existingPaymentRefs = new Set(paymentsData.filter(p => p.referenceId).map(p => p.referenceId as string));

    const paymentEntries = paymentsData.map(p => ({
      id: p.id,
      isPayment: true,
      timestamp: p.timestamp,
      amount: p.amount,
      tone: p.direction === 'payment_received' || p.direction === 'write_off' || p.direction === 'return_refund' ? 'decrease' : 'increase'
    }));

    const inferredSales = salesData
      .filter(sale => sale.totalAmount > sale.paidAmount && !existingPaymentRefs.has(sale.id))
      .map(sale => ({
        id: sale.id,
        isPayment: false,
        timestamp: sale.timestamp,
        amount: sale.totalAmount - sale.paidAmount,
        tone: 'increase'
      }));

    const inferredReturns = returnsData
      .filter(entry => !existingPaymentRefs.has(entry.id))
      .map(entry => ({
        id: entry.id,
        isPayment: false,
        timestamp: entry.timestamp,
        amount: entry.totalAmount,
        tone: 'decrease'
      }));

    const merged = [...paymentEntries, ...inferredSales, ...inferredReturns].sort((a, b) => a.timestamp - b.timestamp);

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
      transaction.update(customerRef, { balance: runningBalance });
      paymentUpdates.forEach(update => {
        const ref = doc(db, `organizations/${orgId}/payments`, update.id);
        transaction.update(ref, { balanceAfter: update.balanceAfter });
      });
    });
  },

  async updateCustomerPaymentRecord(orgId: string, paymentId: string, updates: {
    amount: number;
    notes: string;
    timestamp: number;
    paymentMethod: PaymentRecord['paymentMethod'];
    direction: PaymentRecord['direction'];
  }) {
    const paymentRef = doc(db, `organizations/${orgId}/payments`, paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) throw new Error('Transaction not found');
    const paymentData = paymentSnap.data() as PaymentRecord;
    const customerId = paymentData.entityId;

    await runTransaction(db, async (transaction) => {
      if (paymentData.referenceId && (paymentData.direction === 'sale_due_added' || paymentData.direction === 'sale_due_updated')) {
        const saleRef = doc(db, `organizations/${orgId}/sales`, paymentData.referenceId);
        const saleSnap = await transaction.get(saleRef);
        if (saleSnap.exists()) {
          const sale = saleSnap.data() as Sale;
          const newPaidAmount = Math.max(0, sale.totalAmount - updates.amount);
          transaction.update(saleRef, {
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

    await this.recalculateCustomerBalanceAndHistory(orgId, customerId);
  },

  async deleteCustomerPaymentRecord(orgId: string, paymentId: string) {
    const paymentRef = doc(db, `organizations/${orgId}/payments`, paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) throw new Error('Transaction not found');
    const paymentData = paymentSnap.data() as PaymentRecord;
    const customerId = paymentData.entityId;

    await runTransaction(db, async (transaction) => {
      if (paymentData.referenceId && (paymentData.direction === 'sale_due_added' || paymentData.direction === 'sale_due_updated')) {
        const saleRef = doc(db, `organizations/${orgId}/sales`, paymentData.referenceId);
        const saleSnap = await transaction.get(saleRef);
        if (saleSnap.exists()) {
          const sale = saleSnap.data() as Sale;
          transaction.update(saleRef, {
            paidAmount: sale.totalAmount
          });
        }
      }

      transaction.delete(paymentRef);
    });

    await this.recalculateCustomerBalanceAndHistory(orgId, customerId);
  },
};
