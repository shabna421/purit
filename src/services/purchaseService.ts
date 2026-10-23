import { supabase } from '../supabaseClient';
import { Supplier, Purchase, InventoryTransaction, PaymentRecord } from '../types';
import { generateId, stripUndefined } from './dbUtils';

export const purchaseService = {
  async getSuppliers(orgId: string): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('orgId', orgId)
      .order('name');

    if (error) {
      console.error('Error fetching suppliers:', error);
      throw new Error(error.message);
    }
    return (data || []) as Supplier[];
  },

  async createSupplier(orgId: string, supplierData: Partial<Supplier>): Promise<Supplier> {
    const newId = generateId();
    const newSupplier: Supplier = stripUndefined({
      ...supplierData,
      id: newId,
      orgId,
      balance: supplierData.balance || 0,
    }) as Supplier;

    const { error } = await supabase
      .from('suppliers')
      .insert(newSupplier);

    if (error) {
      console.error('Error creating supplier:', error);
      throw new Error(error.message);
    }
    return newSupplier;
  },

  async updateSupplier(orgId: string, supplierId: string, supplierData: Partial<Supplier>): Promise<void> {
    const { error } = await supabase
      .from('suppliers')
      .update(stripUndefined(supplierData))
      .eq('id', supplierId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error updating supplier:', error);
      throw new Error(error.message);
    }
  },

  async deleteSupplier(orgId: string, supplierId: string): Promise<void> {
    const { data: supplier, error: fetchError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchError || !supplier) {
      throw new Error('Supplier not found');
    }

    if ((supplier.balance || 0) > 0) {
      throw new Error('Supplier cannot be deleted while a pending amount exists');
    }

    const { error: deleteError } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', supplierId)
      .eq('orgId', orgId);

    if (deleteError) {
      console.error('Error deleting supplier:', deleteError);
      throw new Error(deleteError.message);
    }
  },

  async createPurchase(orgId: string, purchaseData: Omit<Purchase, 'id' | 'timestamp'>): Promise<Purchase> {
    // 1. Fetch supplier
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', purchaseData.supplierId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (supplierError || !supplier) {
      throw new Error('Supplier not found');
    }

    const currentBalance = supplier.balance || 0;
    const outstandingAmount = purchaseData.totalAmount - purchaseData.paidAmount;

    // 2. Fetch all items and their location stock
    const lineDetails = await Promise.all(
      purchaseData.items.map(async (line) => {
        const { data: item, error: itemErr } = await supabase
          .from('items')
          .select('*')
          .eq('id', line.itemId)
          .eq('orgId', orgId)
          .maybeSingle();

        if (itemErr || !item) {
          throw new Error(`Item ${line.itemId} not found`);
        }

        const summaryId = `${line.itemId}_${purchaseData.locationId}`;
        const { data: summary } = await supabase
          .from('stock_summaries')
          .select('*')
          .eq('id', summaryId)
          .maybeSingle();

        return {
          line,
          item,
          summaryId,
          currentStock: item.currentStock || 0,
          currentLocStock: summary?.quantity || 0,
        };
      })
    );

    // 3. Create Purchase record
    const purchaseId = generateId();
    const purchase: Purchase = {
      ...purchaseData,
      id: purchaseId,
      previousDueAmount: Math.max(currentBalance, 0),
      timestamp: Date.now(),
    };

    const { error: purchaseError } = await supabase
      .from('purchases')
      .insert(purchase);

    if (purchaseError) {
      console.error('Error creating purchase:', purchaseError);
      throw new Error(purchaseError.message);
    }

    // 4. Update Supplier balance if credit
    if (outstandingAmount > 0) {
      const nextBalance = currentBalance + outstandingAmount;
      await supabase
        .from('suppliers')
        .update({ balance: nextBalance })
        .eq('id', purchaseData.supplierId)
        .eq('orgId', orgId);

      const paymentRecord: PaymentRecord = {
        id: generateId(),
        orgId,
        entityType: 'supplier',
        entityId: purchaseData.supplierId,
        amount: outstandingAmount,
        direction: 'purchase_due_added',
        balanceAfter: nextBalance,
        paymentMethod: purchaseData.paymentType === 'cash' ? 'cash' : 'bank',
        referenceId: purchase.id,
        timestamp: Date.now(),
        userId: purchaseData.userId,
        notes: purchaseData.notes || 'Product purchase',
      };

      await supabase.from('payments').insert(paymentRecord);
    }

    // 5. Update Stock and generate Inventory Transactions for each item
    for (const { line, item, summaryId, currentStock, currentLocStock } of lineDetails) {
      // Update item current stock and base price
      await supabase
        .from('items')
        .update({
          currentStock: currentStock + line.quantity,
          basePrice: line.unitCost,
        })
        .eq('id', line.itemId)
        .eq('orgId', orgId);

      // Upsert location-wise stock
      await supabase.from('stock_summaries').upsert({
        id: summaryId,
        orgId,
        itemId: line.itemId,
        locationId: purchaseData.locationId,
        quantity: currentLocStock + line.quantity,
      });

      // Insert transaction audit
      const invTrans: InventoryTransaction = {
        id: generateId(),
        orgId,
        itemId: line.itemId,
        type: 'PURCHASE_IN',
        destinationLocationId: purchaseData.locationId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        referenceId: purchase.id,
        userId: purchaseData.userId,
        timestamp: Date.now(),
        status: 'completed',
      };
      await supabase.from('transactions').insert(invTrans);
    }

    return purchase;
  },

  async getPurchases(orgId: string): Promise<Purchase[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching purchases:', error);
      throw new Error(error.message);
    }
    return (data || []) as Purchase[];
  },

  async getSupplierPaymentRecords(orgId: string, supplierId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('orgId', orgId)
      .eq('entityType', 'supplier')
      .eq('entityId', supplierId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching supplier payment records:', error);
      throw new Error(error.message);
    }
    return (data || []) as PaymentRecord[];
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
  ): Promise<PaymentRecord> {
    const { data: supplier, error: fetchError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', data.supplierId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchError || !supplier) {
      throw new Error('Supplier not found');
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

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
      if (data.amount > currentBalance) {
        throw new Error('Payment amount cannot exceed the current supplier balance');
      }
      balanceDelta = -data.amount;
      direction = 'payment_made';
    }

    const nextBalance = currentBalance + balanceDelta;

    await supabase
      .from('suppliers')
      .update({ balance: nextBalance })
      .eq('id', data.supplierId)
      .eq('orgId', orgId);

    const paymentRecord: PaymentRecord = {
      id: generateId(),
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

    const { error: insertError } = await supabase
      .from('payments')
      .insert(paymentRecord);

    if (insertError) {
      console.error('Error creating supplier payment record:', insertError);
      throw new Error(insertError.message);
    }

    return paymentRecord;
  },

  async recalculateSupplierBalanceAndHistory(orgId: string, supplierId: string): Promise<void> {
    const { data: supplier, error: supErr } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (supErr || !supplier) {
      throw new Error('Supplier not found');
    }

    const [purchasesRes, paymentsRes] = await Promise.all([
      supabase.from('purchases').select('*').eq('orgId', orgId).eq('supplierId', supplierId),
      supabase.from('payments').select('*').eq('orgId', orgId).eq('entityType', 'supplier').eq('entityId', supplierId),
    ]);

    const purchasesData = (purchasesRes.data || []) as Purchase[];
    const paymentsData = (paymentsRes.data || []) as PaymentRecord[];

    const existingPaymentRefs = new Set(
      paymentsData.filter((p) => p.referenceId).map((p) => p.referenceId as string)
    );

    const paymentEntries = paymentsData.map((p) => ({
      id: p.id,
      isPayment: true,
      timestamp: p.timestamp,
      amount: p.amount,
      tone: p.direction === 'payment_made' || p.direction === 'write_off' ? 'decrease' : 'increase',
    }));

    const inferredPurchases = purchasesData
      .filter((p) => p.totalAmount > p.paidAmount && !existingPaymentRefs.has(p.id))
      .map((p) => ({
        id: p.id,
        isPayment: false,
        timestamp: p.timestamp,
        amount: p.totalAmount - p.paidAmount,
        tone: 'increase',
      }));

    const merged = [...paymentEntries, ...inferredPurchases].sort((a, b) => a.timestamp - b.timestamp);

    let runningBalance = 0;
    const paymentUpdates: Array<{ id: string; balanceAfter: number }> = [];

    merged.forEach((entry) => {
      const diff = entry.amount;
      runningBalance += entry.tone === 'increase' ? diff : -diff;
      runningBalance = Math.max(runningBalance, 0);

      if (entry.isPayment) {
        paymentUpdates.push({ id: entry.id, balanceAfter: runningBalance });
      }
    });

    await supabase
      .from('suppliers')
      .update({ balance: runningBalance })
      .eq('id', supplierId)
      .eq('orgId', orgId);

    for (const update of paymentUpdates) {
      await supabase
        .from('payments')
        .update({ balanceAfter: update.balanceAfter })
        .eq('id', update.id)
        .eq('orgId', orgId);
    }
  },

  async updateSupplierPaymentRecord(
    orgId: string,
    paymentId: string,
    updates: {
      amount: number;
      notes: string;
      timestamp: number;
      paymentMethod: PaymentRecord['paymentMethod'];
      direction: PaymentRecord['direction'];
    }
  ): Promise<void> {
    if (paymentId.startsWith('mock-purchase-')) {
      const purchaseId = paymentId.replace('mock-purchase-', '');
      const { data: purchase, error: pErr } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', purchaseId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (pErr || !purchase) throw new Error('Purchase not found');
      const supplierId = purchase.supplierId;
      const newPaidAmount = Math.max(0, purchase.totalAmount - updates.amount);

      await supabase
        .from('purchases')
        .update({
          paidAmount: newPaidAmount,
          notes: updates.notes,
          timestamp: updates.timestamp,
          paymentType: updates.paymentMethod === 'cash' ? 'cash' : 'bank',
        })
        .eq('id', purchaseId)
        .eq('orgId', orgId);

      await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
      return;
    }

    const { data: paymentData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (payErr || !paymentData) throw new Error('Transaction not found');
    const supplierId = paymentData.entityId;

    if (paymentData.referenceId && paymentData.direction === 'purchase_due_added') {
      const { data: purchase } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', paymentData.referenceId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (purchase) {
        const newPaidAmount = Math.max(0, purchase.totalAmount - updates.amount);
        await supabase
          .from('purchases')
          .update({ paidAmount: newPaidAmount })
          .eq('id', paymentData.referenceId)
          .eq('orgId', orgId);
      }
    }

    await supabase
      .from('payments')
      .update({
        amount: updates.amount,
        notes: updates.notes,
        timestamp: updates.timestamp,
        paymentMethod: updates.paymentMethod,
        direction: updates.direction,
      })
      .eq('id', paymentId)
      .eq('orgId', orgId);

    await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
  },

  async deleteSupplierPaymentRecord(orgId: string, paymentId: string): Promise<void> {
    if (paymentId.startsWith('mock-purchase-')) {
      const purchaseId = paymentId.replace('mock-purchase-', '');
      const { data: purchase, error: pErr } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', purchaseId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (pErr || !purchase) throw new Error('Purchase not found');
      const supplierId = purchase.supplierId;

      await supabase
        .from('purchases')
        .update({ paidAmount: purchase.totalAmount })
        .eq('id', purchaseId)
        .eq('orgId', orgId);

      await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
      return;
    }

    const { data: paymentData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (payErr || !paymentData) throw new Error('Transaction not found');
    const supplierId = paymentData.entityId;

    if (paymentData.referenceId && paymentData.direction === 'purchase_due_added') {
      const { data: purchase } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', paymentData.referenceId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (purchase) {
        await supabase
          .from('purchases')
          .update({ paidAmount: purchase.totalAmount })
          .eq('id', paymentData.referenceId)
          .eq('orgId', orgId);
      }
    }

    await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
      .eq('orgId', orgId);

    await this.recalculateSupplierBalanceAndHistory(orgId, supplierId);
  },
};
