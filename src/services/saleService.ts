import { supabase } from '../supabaseClient';
import {
  Customer,
  Sale,
  InventoryTransaction,
  PaymentRecord,
  CustomerReturn,
  ReturnLine,
  CashLedgerTransaction,
  Item,
  InventoryLocation,
} from '../types';
import { isValidQuantityForUnit } from '../utils/quantity';
import { generateId, stripUndefined } from './dbUtils';

export interface RealtimeInvoiceSnapshot {
  sale: Sale;
  customer: Customer | null;
  items: Item[];
  locations: InventoryLocation[];
  location: InventoryLocation | null;
  paymentRecords: PaymentRecord[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  oldDueAmount: number;
  grandTotalPayable: number;
  paidStatus: 'PAID' | 'PARTIALLY PAID' | 'UNPAID';
}

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
  async getCustomers(orgId: string): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('orgId', orgId)
      .order('name');

    if (error) {
      console.error('Error fetching customers:', error);
      throw new Error(error.message);
    }
    return (data || []) as Customer[];
  },

  async getCustomer(orgId: string, customerId: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching customer:', error);
      throw new Error(error.message);
    }
    return data as Customer | null;
  },

  async getCustomerPaymentRecords(orgId: string, customerId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('orgId', orgId)
      .eq('entityType', 'customer')
      .eq('entityId', customerId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching customer payment records:', error);
      throw new Error(error.message);
    }
    return (data || []) as PaymentRecord[];
  },

  async createCustomer(orgId: string, customerData: Partial<Customer>): Promise<Customer> {
    const newId = generateId();
    const newCustomer: Customer = stripUndefined({
      ...customerData,
      id: newId,
      orgId,
      balance: customerData.balance || 0,
    }) as Customer;

    const { error } = await supabase
      .from('customers')
      .insert(newCustomer);

    if (error) {
      console.error('Error creating customer:', error);
      throw new Error(error.message);
    }
    return newCustomer;
  },

  async createSale(orgId: string, saleData: Omit<Sale, 'id' | 'timestamp' | 'taxAmount'>): Promise<Sale> {
    // 1. Fetch customer and org
    const [customerRes, orgRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', saleData.customerId).eq('orgId', orgId).maybeSingle(),
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    ]);

    if (customerRes.error || !customerRes.data) throw new Error('Customer not found');
    if (orgRes.error || !orgRes.data) throw new Error('Organization not found');

    const customer = customerRes.data;
    const orgData = orgRes.data;

    const isGstBill = saleData.isGstBill || false;
    const saleSubtotal = roundCurrencyAmount(saleData.totalAmount);
    const settingsTaxRate = orgData?.settings?.taxRate ?? 0;
    const taxAmount = isGstBill ? roundCurrencyAmount((saleSubtotal * settingsTaxRate) / 100) : 0;
    const finalTotal = roundCurrencyAmount(saleSubtotal + taxAmount);
    const normalizedPaidAmount =
      saleData.paymentType === 'cash'
        ? finalTotal
        : roundCurrencyAmount(Math.min(Math.max(0, Number(saleData.paidAmount) || 0), finalTotal));

    const currentBalance = customer.balance || 0;
    const outstandingAmount = roundCurrencyAmount(Math.max(finalTotal - normalizedPaidAmount, 0));

    // 2. Fetch line items and their stock summaries
    const lineDetails = await Promise.all(
      saleData.items.map(async (line) => {
        const [itemRes, summaryRes] = await Promise.all([
          supabase.from('items').select('*').eq('id', line.itemId).eq('orgId', orgId).maybeSingle(),
          supabase
            .from('stock_summaries')
            .select('*')
            .eq('id', `${line.itemId}_${saleData.locationId}`)
            .maybeSingle(),
        ]);

        if (itemRes.error || !itemRes.data) {
          throw new Error(`Item ${line.itemId} not found`);
        }

        const item = itemRes.data;
        const currentStock = item.currentStock || 0;
        const currentLocStock = summaryRes.data?.quantity || 0;

        return {
          line,
          item,
          summaryId: `${line.itemId}_${saleData.locationId}`,
          currentStock,
          currentLocStock,
        };
      })
    );

    // 3. Create Sale record
    const saleId = generateId();
    const sale: Sale = {
      ...saleData,
      id: saleId,
      previousDueAmount: Math.max(currentBalance, 0),
      taxAmount,
      totalAmount: finalTotal,
      paidAmount: normalizedPaidAmount,
      timestamp: Date.now(),
      isGstBill,
      gstAmount: isGstBill ? taxAmount : 0,
      taxRate: isGstBill ? settingsTaxRate : 0,
    };

    const { error: saleError } = await supabase.from('sales').insert(sale);
    if (saleError) {
      console.error('Error inserting sale:', saleError);
      throw new Error(saleError.message);
    }

    // Save sequential GST bill number in org settings
    if (isGstBill && saleData.gstBillNumber) {
      const nextSettings = {
        ...orgData?.settings,
        lastGstInvoiceNumber: saleData.gstBillNumber,
      };
      await supabase
        .from('organizations')
        .update({ settings: nextSettings })
        .eq('id', orgId);
    }

    // 4. Update Customer Balance if credit
    if (outstandingAmount > 0) {
      const nextBalance = roundCurrencyAmount(currentBalance + outstandingAmount);
      await supabase
        .from('customers')
        .update({ balance: nextBalance })
        .eq('id', saleData.customerId)
        .eq('orgId', orgId);

      const paymentRecord: PaymentRecord = {
        id: generateId(),
        orgId,
        entityType: 'customer',
        entityId: saleData.customerId,
        amount: outstandingAmount,
        direction: 'sale_due_added',
        balanceAfter: nextBalance,
        paymentMethod: saleData.paymentType === 'cash' ? 'cash' : 'bank',
        referenceId: sale.id,
        timestamp: Date.now(),
        userId: saleData.userId,
        notes: saleData.notes || 'Product sale',
      };
      await supabase.from('payments').insert(paymentRecord);
    }

    // 5. Cash ledger entry
    const initialCashAmount = getCashAmountForSale(sale.paymentType, sale.totalAmount, sale.paidAmount);
    if (initialCashAmount > 0) {
      const receiptEntry: CashLedgerTransaction = {
        id: generateId(),
        saleId: sale.id,
        type: 'receipt',
        amount: initialCashAmount,
        timestamp: sale.timestamp,
        description: `Cash received for sale ${sale.id}`,
      };
      await supabase.from('cash_ledger').insert({
        ...receiptEntry,
        orgId,
      });
    }

    // 6. Update Stock for each item & create inventory transactions
    for (const { line, item, summaryId, currentStock, currentLocStock } of lineDetails) {
      if (!isValidQuantityForUnit(line.quantity, item.unit)) {
        throw new Error(
          `Quantity for ${item.name || line.itemId} must be a valid ${item.unit || 'item'} amount`
        );
      }
      if (line.quantity > currentLocStock) {
        throw new Error(`Insufficient stock for ${item.name || line.itemId} at the selected location`);
      }

      // Update total item stock
      await supabase
        .from('items')
        .update({ currentStock: currentStock - line.quantity })
        .eq('id', line.itemId)
        .eq('orgId', orgId);

      // Update location stock
      await supabase.from('stock_summaries').upsert({
        id: summaryId,
        orgId,
        itemId: line.itemId,
        locationId: saleData.locationId,
        quantity: currentLocStock - line.quantity,
      });

      // Insert inventory transaction
      const invTrans: InventoryTransaction = {
        id: generateId(),
        orgId,
        itemId: line.itemId,
        type: 'SALE_OUT',
        sourceLocationId: saleData.locationId,
        quantity: line.quantity,
        unitSellPrice: line.unitPrice,
        referenceId: sale.id,
        userId: saleData.userId,
        timestamp: Date.now(),
        status: 'completed',
      };
      await supabase.from('transactions').insert(invTrans);
    }

    return sale;
  },

  async getSale(orgId: string, saleId: string): Promise<Sale | null> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching sale:', error);
      throw new Error(error.message);
    }
    return data as Sale | null;
  },

  async getSales(orgId: string): Promise<Sale[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error);
      throw new Error(error.message);
    }
    return (data || []) as Sale[];
  },

  async getCustomerSales(orgId: string, customerId: string): Promise<Sale[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('orgId', orgId)
      .eq('customerId', customerId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching customer sales:', error);
      throw new Error(error.message);
    }
    return (data || []) as Sale[];
  },

  async getSalePaymentRecords(orgId: string, saleId: string): Promise<PaymentRecord[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('orgId', orgId)
      .eq('referenceId', saleId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching sale payment records:', error);
      throw new Error(error.message);
    }
    return (data || []) as PaymentRecord[];
  },

  async updateCustomer(orgId: string, customerId: string, data: Partial<Customer>): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .update(stripUndefined(data))
      .eq('id', customerId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error updating customer:', error);
      throw new Error(error.message);
    }
  },

  async deleteCustomer(orgId: string, customerId: string): Promise<void> {
    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchErr || !customer) throw new Error('Customer not found');

    if ((customer.balance || 0) > 0) {
      throw new Error('Customer cannot be deleted while a pending amount exists');
    }

    const { error: deleteErr } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('orgId', orgId);

    if (deleteErr) {
      console.error('Error deleting customer:', deleteErr);
      throw new Error(deleteErr.message);
    }
  },

  async getCustomerReturnEligibility(
    orgId: string,
    customerId: string
  ): Promise<Record<string, { sold: number; returned: number; remaining: number }>> {
    const [salesRes, returnsRes] = await Promise.all([
      supabase.from('sales').select('*').eq('orgId', orgId).eq('customerId', customerId),
      supabase.from('customer_returns').select('*').eq('orgId', orgId).eq('customerId', customerId),
    ]);

    const sales = (salesRes.data || []) as Sale[];
    const returns = (returnsRes.data || []) as CustomerReturn[];

    const soldByItem: Record<string, number> = {};
    const returnedByItem: Record<string, number> = {};

    sales.forEach((sale) => {
      (sale.items || []).forEach((line) => {
        soldByItem[line.itemId] = (soldByItem[line.itemId] || 0) + line.quantity;
      });
    });

    returns.forEach((customerReturn) => {
      (customerReturn.items || []).forEach((line) => {
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

  async getCustomerReturns(orgId: string, customerId: string): Promise<CustomerReturn[]> {
    const { data, error } = await supabase
      .from('customer_returns')
      .select('*')
      .eq('orgId', orgId)
      .eq('customerId', customerId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching customer returns:', error);
      throw new Error(error.message);
    }
    return (data || []) as CustomerReturn[];
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
  ): Promise<CustomerReturn> {
    const eligibility = await this.getCustomerReturnEligibility(orgId, data.customerId);

    data.items.forEach((line) => {
      const remaining = eligibility[line.itemId]?.remaining || 0;
      if (line.quantity > remaining) {
        throw new Error('Return quantity cannot exceed the quantity purchased by this customer');
      }
    });

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', data.customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (custErr || !customer) {
      throw new Error('Customer not found');
    }

    const returnId = generateId();
    const returnRecord: CustomerReturn = {
      id: returnId,
      orgId,
      customerId: data.customerId,
      locationId: data.locationId,
      items: data.items,
      totalAmount: data.items.reduce((sum, line) => sum + line.subtotal, 0),
      reason: data.reason,
      timestamp: Date.now(),
      userId,
    };

    // Update item and location stocks
    for (const line of data.items) {
      const { data: item } = await supabase
        .from('items')
        .select('*')
        .eq('id', line.itemId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (!item) throw new Error(`Item ${line.itemId} not found`);

      const summaryId = `${line.itemId}_${data.locationId}`;
      const { data: summary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', summaryId)
        .maybeSingle();

      const currentStock = item.currentStock || 0;
      const currentLocStock = summary?.quantity || 0;

      await supabase
        .from('items')
        .update({ currentStock: currentStock + line.quantity })
        .eq('id', line.itemId)
        .eq('orgId', orgId);

      await supabase.from('stock_summaries').upsert({
        id: summaryId,
        orgId,
        itemId: line.itemId,
        locationId: data.locationId,
        quantity: currentLocStock + line.quantity,
      });

      const invTrans: InventoryTransaction = {
        id: generateId(),
        orgId,
        itemId: line.itemId,
        type: 'CUSTOMER_RETURN',
        destinationLocationId: data.locationId,
        quantity: line.quantity,
        unitSellPrice: line.unitPrice,
        referenceId: returnRecord.id,
        userId,
        timestamp: Date.now(),
        notes: `Customer Return: ${data.reason}`,
        status: 'completed',
      };
      await supabase.from('transactions').insert(invTrans);
    }

    const nextBalance = Math.max((customer.balance || 0) - returnRecord.totalAmount, 0);
    const refundedAmount = Math.max((customer.balance || 0) - nextBalance, 0);

    await supabase
      .from('customers')
      .update({ balance: nextBalance })
      .eq('id', data.customerId)
      .eq('orgId', orgId);

    if (refundedAmount > 0) {
      const paymentRecord: PaymentRecord = {
        id: generateId(),
        orgId,
        entityType: 'customer',
        entityId: data.customerId,
        amount: refundedAmount,
        direction: 'return_refund',
        balanceAfter: nextBalance,
        paymentMethod: 'cash',
        referenceId: returnRecord.id,
        timestamp: Date.now(),
        userId,
        notes: data.reason || 'Customer return refund',
      };
      await supabase.from('payments').insert(paymentRecord);
    }

    const { error: returnInsertErr } = await supabase
      .from('customer_returns')
      .insert(returnRecord);

    if (returnInsertErr) {
      console.error('Error inserting customer return:', returnInsertErr);
      throw new Error(returnInsertErr.message);
    }

    return returnRecord;
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
  ): Promise<PaymentRecord> {
    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', data.customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchErr || !customer) throw new Error('Customer not found');
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

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

    await supabase
      .from('customers')
      .update({ balance: nextBalance })
      .eq('id', data.customerId)
      .eq('orgId', orgId);

    const paymentRecord: PaymentRecord = {
      id: generateId(),
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

    const { error: insertErr } = await supabase
      .from('payments')
      .insert(paymentRecord);

    if (insertErr) {
      console.error('Error creating customer balance payment:', insertErr);
      throw new Error(insertErr.message);
    }

    return paymentRecord;
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
  ): Promise<void> {
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (saleErr || !sale) throw new Error('Sale not found');

    const items = normalizeSaleLines(data.items);
    if (!data.customerId) throw new Error('Customer is required');
    if (!data.locationId) throw new Error('Location is required');
    if (items.length === 0) throw new Error('Add at least one item to the sale');

    const previousOutstanding = Math.max(sale.totalAmount - sale.paidAmount, 0);

    const [customerRes, nextCustomerRes, orgRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', sale.customerId).eq('orgId', orgId).maybeSingle(),
      supabase.from('customers').select('*').eq('id', data.customerId).eq('orgId', orgId).maybeSingle(),
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    ]);

    if (!customerRes.data) throw new Error('Existing customer not found');
    if (!nextCustomerRes.data) throw new Error('Customer not found');
    if (!orgRes.data) throw new Error('Organization not found');

    const currentCustomer = customerRes.data;
    const nextCustomer = nextCustomerRes.data;
    const orgData = orgRes.data;

    const isGstBill = typeof data.isGstBill === 'boolean' ? data.isGstBill : (sale.isGstBill || false);
    const subtotalAmount = roundCurrencyAmount(items.reduce((sum, line) => sum + line.subtotal, 0));
    const saleTaxRate = data.taxRate ?? sale.taxRate ?? (orgData?.settings?.taxRate ?? 18);
    const taxAmount = isGstBill ? roundCurrencyAmount((subtotalAmount * saleTaxRate) / 100) : 0;
    const finalTotal = roundCurrencyAmount(subtotalAmount + taxAmount);
    const nextPaidAmount =
      data.paymentType === 'cash'
        ? finalTotal
        : roundCurrencyAmount(Math.max(0, Number(data.paidAmount) || 0));

    if (nextPaidAmount > finalTotal) {
      throw new Error('Paid amount cannot exceed total amount');
    }
    const nextOutstanding = roundCurrencyAmount(Math.max(finalTotal - nextPaidAmount, 0));
    const nextTimestamp = data.timestamp ?? sale.timestamp;
    const previousPaidAmount = roundCurrencyAmount(sale.paidAmount || 0);
    const previousCashAmount = getCashAmountForSale(
      sale.paymentType,
      roundCurrencyAmount(sale.totalAmount || 0),
      previousPaidAmount
    );
    const nextCashAmount = getCashAmountForSale(data.paymentType, finalTotal, nextPaidAmount);
    const cashDelta = roundCurrencyAmount(nextCashAmount - previousCashAmount);

    // Compute stock differences
    const itemIds = new Set<string>();
    sale.items.forEach((line: any) => itemIds.add(line.itemId));
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

    sale.items.forEach((line: any) => applyLineDelta(line.itemId, sale.locationId, line.quantity));
    items.forEach((line) => applyLineDelta(line.itemId, data.locationId, -line.quantity));

    // Update items stock
    for (const itemId of Array.from(itemIds)) {
      const { data: item } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (!item) throw new Error(`Item ${itemId} not found`);

      const lineToValidate = items.find((line) => line.itemId === itemId);
      if (lineToValidate && !isValidQuantityForUnit(lineToValidate.quantity, item.unit)) {
        throw new Error(
          `Quantity for ${item.name || itemId} must be a valid ${item.unit || 'item'} amount`
        );
      }

      const nextStock = (item.currentStock || 0) + (stockDeltaByItem.get(itemId) || 0);
      if (nextStock < 0) {
        throw new Error(`Insufficient total stock for item ${itemId}`);
      }
      await supabase
        .from('items')
        .update({ currentStock: nextStock })
        .eq('id', itemId)
        .eq('orgId', orgId);
    }

    // Update stock summaries
    for (const [key, value] of Array.from(stockDeltaByKey.entries())) {
      const { data: summary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', key)
        .maybeSingle();

      const nextQuantity = (summary?.quantity || 0) + value.delta;
      if (nextQuantity < 0) {
        throw new Error('Insufficient stock at the selected location');
      }
      await supabase.from('stock_summaries').upsert({
        id: key,
        orgId,
        itemId: value.itemId,
        locationId: value.locationId,
        quantity: nextQuantity,
      });
    }

    // Customer balances
    const currentBalance = currentCustomer.balance || 0;
    const nextCustomerBalance = nextCustomer.balance || 0;

    if (sale.customerId === data.customerId) {
      await supabase
        .from('customers')
        .update({
          balance: roundCurrencyAmount(Math.max(currentBalance - previousOutstanding + nextOutstanding, 0)),
        })
        .eq('id', data.customerId)
        .eq('orgId', orgId);
    } else {
      await supabase
        .from('customers')
        .update({
          balance: roundCurrencyAmount(Math.max(currentBalance - previousOutstanding, 0)),
        })
        .eq('id', sale.customerId)
        .eq('orgId', orgId);

      await supabase
        .from('customers')
        .update({
          balance: roundCurrencyAmount(Math.max(nextCustomerBalance + nextOutstanding, 0)),
        })
        .eq('id', data.customerId)
        .eq('orgId', orgId);
    }

    // Update sale
    await supabase
      .from('sales')
      .update({
        customerId: data.customerId,
        locationId: data.locationId,
        items,
        previousDueAmount:
          sale.customerId === data.customerId
            ? Math.max(sale.previousDueAmount ?? currentBalance - previousOutstanding, 0)
            : Math.max(nextCustomerBalance, 0),
        totalAmount: finalTotal,
        taxAmount,
        paidAmount: nextPaidAmount,
        paymentType: data.paymentType,
        notes: data.notes || '',
        timestamp: nextTimestamp,
        isGstBill,
        ...(isGstBill
          ? { gstAmount: taxAmount, taxRate: saleTaxRate, gstBillNumber: data.gstBillNumber || '' }
          : { gstAmount: 0, taxRate: 0, gstBillNumber: '' }),
      })
      .eq('id', saleId)
      .eq('orgId', orgId);

    // Delete previous SALE_OUT transactions for this sale
    await supabase
      .from('transactions')
      .delete()
      .eq('referenceId', saleId)
      .eq('type', 'SALE_OUT')
      .eq('orgId', orgId);

    // Insert new transactions
    for (const line of items) {
      const invTrans: InventoryTransaction = {
        id: generateId(),
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
      await supabase.from('transactions').insert(invTrans);
    }

    // Delete previous payments for this sale
    await supabase
      .from('payments')
      .delete()
      .eq('referenceId', saleId)
      .eq('orgId', orgId);

    if (nextOutstanding > 0) {
      const paymentRecord: PaymentRecord = {
        id: generateId(),
        orgId,
        entityType: 'customer',
        entityId: data.customerId,
        amount: nextOutstanding,
        direction: 'sale_due_updated',
        balanceAfter:
          sale.customerId === data.customerId
            ? roundCurrencyAmount(Math.max(currentBalance - previousOutstanding + nextOutstanding, 0))
            : roundCurrencyAmount(Math.max(nextCustomerBalance + nextOutstanding, 0)),
        paymentMethod: data.paymentType === 'cash' ? 'cash' : 'bank',
        referenceId: saleId,
        timestamp: nextTimestamp,
        userId: sale.userId,
        notes: data.notes || 'Sale updated',
      };
      await supabase.from('payments').insert(paymentRecord);
    }

    if (cashDelta !== 0) {
      const cashLedgerEntry: CashLedgerTransaction = {
        id: generateId(),
        saleId,
        type: cashDelta > 0 ? 'receipt' : 'reversal',
        amount: Math.abs(cashDelta),
        timestamp: nextTimestamp,
        description:
          cashDelta > 0
            ? `Additional cash received after sale ${saleId} was updated`
            : `Cash reversed after sale ${saleId} was updated`,
      };
      await supabase.from('cash_ledger').insert({
        ...cashLedgerEntry,
        orgId,
      });
    }
  },

  async deleteSale(orgId: string, saleId: string): Promise<void> {
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (saleErr || !sale) throw new Error('Sale not found');

    const outstandingAmount = Math.max(sale.totalAmount - sale.paidAmount, 0);

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', sale.customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (custErr || !customer) throw new Error('Customer not found');

    const quantityByItem: Record<string, number> = {};
    for (const line of ((sale.items || []) as Array<{ itemId: string; quantity: number }>)) {
      quantityByItem[line.itemId] = (quantityByItem[line.itemId] || 0) + line.quantity;
    }

    for (const [itemId, qty] of Object.entries(quantityByItem)) {
      const { data: item } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (item) {
        await supabase
          .from('items')
          .update({ currentStock: (item.currentStock || 0) + qty })
          .eq('id', itemId)
          .eq('orgId', orgId);
      }

      const summaryId = `${itemId}_${sale.locationId}`;
      const { data: summary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', summaryId)
        .maybeSingle();

      await supabase.from('stock_summaries').upsert({
        id: summaryId,
        orgId,
        itemId,
        locationId: sale.locationId,
        quantity: (summary?.quantity || 0) + qty,
      });
    }

    // Revert customer balance
    await supabase
      .from('customers')
      .update({
        balance: Math.max((customer.balance || 0) - outstandingAmount, 0),
      })
      .eq('id', sale.customerId)
      .eq('orgId', orgId);

    // Delete sale, transactions, payments
    await supabase.from('sales').delete().eq('id', saleId).eq('orgId', orgId);
    await supabase.from('transactions').delete().eq('referenceId', saleId).eq('orgId', orgId);
    await supabase.from('payments').delete().eq('referenceId', saleId).eq('orgId', orgId);
  },

  async recalculateCustomerBalanceAndHistory(orgId: string, customerId: string): Promise<void> {
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (custErr || !customer) throw new Error('Customer not found');

    const [salesRes, returnsRes, paymentsRes] = await Promise.all([
      supabase.from('sales').select('*').eq('orgId', orgId).eq('customerId', customerId),
      supabase.from('customer_returns').select('*').eq('orgId', orgId).eq('customerId', customerId),
      supabase.from('payments').select('*').eq('orgId', orgId).eq('entityType', 'customer').eq('entityId', customerId),
    ]);

    const salesData = (salesRes.data || []) as Sale[];
    const returnsData = (returnsRes.data || []) as CustomerReturn[];
    const paymentsData = (paymentsRes.data || []) as PaymentRecord[];

    const existingPaymentRefs = new Set(
      paymentsData.filter((p) => p.referenceId).map((p) => p.referenceId as string)
    );

    const paymentEntries = paymentsData.map((p) => ({
      id: p.id,
      isPayment: true,
      timestamp: p.timestamp,
      amount: p.amount,
      tone:
        p.direction === 'payment_received' ||
        p.direction === 'write_off' ||
        p.direction === 'return_refund'
          ? 'decrease'
          : 'increase',
    }));

    const inferredSales = salesData
      .filter((s) => s.totalAmount > s.paidAmount && !existingPaymentRefs.has(s.id))
      .map((s) => ({
        id: s.id,
        isPayment: false,
        timestamp: s.timestamp,
        amount: s.totalAmount - s.paidAmount,
        tone: 'increase',
      }));

    const inferredReturns = returnsData
      .filter((entry) => !existingPaymentRefs.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        isPayment: false,
        timestamp: entry.timestamp,
        amount: entry.totalAmount,
        tone: 'decrease',
      }));

    const merged = [...paymentEntries, ...inferredSales, ...inferredReturns].sort((a, b) => a.timestamp - b.timestamp);

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
      .from('customers')
      .update({ balance: runningBalance })
      .eq('id', customerId)
      .eq('orgId', orgId);

    for (const update of paymentUpdates) {
      await supabase
        .from('payments')
        .update({ balanceAfter: update.balanceAfter })
        .eq('id', update.id)
        .eq('orgId', orgId);
    }
  },

  async updateCustomerPaymentRecord(
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
    const { data: paymentData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (payErr || !paymentData) throw new Error('Transaction not found');
    const customerId = paymentData.entityId;

    if (
      paymentData.referenceId &&
      (paymentData.direction === 'sale_due_added' || paymentData.direction === 'sale_due_updated')
    ) {
      const { data: sale } = await supabase
        .from('sales')
        .select('*')
        .eq('id', paymentData.referenceId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (sale) {
        const newPaidAmount = Math.max(0, sale.totalAmount - updates.amount);
        await supabase
          .from('sales')
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

    await this.recalculateCustomerBalanceAndHistory(orgId, customerId);
  },

  async deleteCustomerPaymentRecord(orgId: string, paymentId: string): Promise<void> {
    const { data: paymentData, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (payErr || !paymentData) throw new Error('Transaction not found');
    const customerId = paymentData.entityId;

    if (
      paymentData.referenceId &&
      (paymentData.direction === 'sale_due_added' || paymentData.direction === 'sale_due_updated')
    ) {
      const { data: sale } = await supabase
        .from('sales')
        .select('*')
        .eq('id', paymentData.referenceId)
        .eq('orgId', orgId)
        .maybeSingle();

      if (sale) {
        await supabase
          .from('sales')
          .update({ paidAmount: sale.totalAmount })
          .eq('id', paymentData.referenceId)
          .eq('orgId', orgId);
      }
    }

    await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
      .eq('orgId', orgId);

    await this.recalculateCustomerBalanceAndHistory(orgId, customerId);
  },

  async getRealtimeInvoiceData(
    orgId: string,
    saleId: string
  ): Promise<RealtimeInvoiceSnapshot | null> {
    // 1. Fetch fresh sale directly from database
    const { data: saleData, error: saleErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (saleErr || !saleData) return null;
    const freshSale = saleData as Sale;

    // 2. Fetch fresh customer, payments, items, locations, sales and returns in parallel
    const [custRes, custPaymentsRes, salePaymentsRes, itemsRes, locsRes, salesRes, returnsRes] = await Promise.all([
      freshSale.customerId
        ? supabase.from('customers').select('*').eq('id', freshSale.customerId).eq('orgId', orgId).maybeSingle()
        : Promise.resolve({ data: null }),
      freshSale.customerId
        ? supabase.from('payments').select('*').eq('orgId', orgId).eq('entityType', 'customer').eq('entityId', freshSale.customerId)
        : Promise.resolve({ data: [] }),
      supabase.from('payments').select('*').eq('orgId', orgId).eq('referenceId', freshSale.id),
      supabase.from('items').select('*').eq('orgId', orgId),
      supabase.from('locations').select('*').eq('orgId', orgId),
      freshSale.customerId
        ? supabase.from('sales').select('*').eq('orgId', orgId).eq('customerId', freshSale.customerId)
        : Promise.resolve({ data: [] }),
      freshSale.customerId
        ? supabase.from('customer_returns').select('*').eq('orgId', orgId).eq('customerId', freshSale.customerId)
        : Promise.resolve({ data: [] }),
    ]);

    const freshCustomer = custRes.data as Customer | null;
    const freshItems = (itemsRes.data || []) as Item[];
    const freshLocations = (locsRes.data || []) as InventoryLocation[];
    const customerPayments = (custPaymentsRes.data || []) as PaymentRecord[];
    const salePayments = (salePaymentsRes.data || []) as PaymentRecord[];
    const customerSales = (salesRes.data || []) as Sale[];
    const customerReturns = (returnsRes.data || []) as CustomerReturn[];

    const paymentMap = new Map<string, PaymentRecord>();
    customerPayments.forEach((p) => paymentMap.set(p.id, p));
    salePayments.forEach((p) => paymentMap.set(p.id, p));
    const allRelevantPayments = Array.from(paymentMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    const freshLocation = freshLocations.find((l) => l.id === freshSale.locationId) || null;
    const totalAmount = roundCurrencyAmount(freshSale.totalAmount);

    // Direct payments specifically made towards this sale
    const directPaymentsReceived = allRelevantPayments
      .filter((p) => p.referenceId === freshSale.id && p.direction === 'payment_received')
      .reduce((sum, p) => sum + p.amount, 0);

    let paidAmount = 0;
    let dueAmount = 0;
    let oldDueAmount = 0;

    if (!freshCustomer) {
      // Walk-in customer without ledger profile
      const basePaid = freshSale.paymentType === 'cash' ? totalAmount : roundCurrencyAmount(freshSale.paidAmount || 0);
      paidAmount = roundCurrencyAmount(
        freshSale.paymentType === 'cash'
          ? totalAmount
          : Math.min(totalAmount, Math.max(basePaid, basePaid + directPaymentsReceived, directPaymentsReceived))
      );
      dueAmount = roundCurrencyAmount(Math.max(0, totalAmount - paidAmount));
      oldDueAmount = 0;
    } else {
      const currentCustomerBalance = roundCurrencyAmount(Math.max(0, freshCustomer.balance || 0));

      if (freshSale.paymentType === 'cash') {
        paidAmount = totalAmount;
        dueAmount = 0;
        oldDueAmount = currentCustomerBalance;
      } else {
        // Credit sale: Always recalculate in real-time from database payment data
        if (currentCustomerBalance <= 0) {
          // If customer has no outstanding balance at all, everything is settled!
          paidAmount = totalAmount;
          dueAmount = 0;
          oldDueAmount = 0;
        } else {
          // Map direct payments on other sales
          const otherSaleDirectPayments = new Map<string, number>();
          allRelevantPayments
            .filter((p) => p.referenceId && p.referenceId !== freshSale.id && p.direction === 'payment_received')
            .forEach((p) => {
              otherSaleDirectPayments.set(p.referenceId!, (otherSaleDirectPayments.get(p.referenceId!) || 0) + p.amount);
            });

          // Debts from earlier sales or manual due additions prior to this sale
          const priorSales = customerSales.filter(
            (s) => s.id !== freshSale.id && (s.timestamp < freshSale.timestamp || (s.timestamp === freshSale.timestamp && s.id < freshSale.id))
          );
          let priorDebts = 0;
          priorSales.forEach((s) => {
            if (s.paymentType !== 'cash') {
              const initialPaid = s.paidAmount || 0;
              const directPaid = otherSaleDirectPayments.get(s.id) || 0;
              const netOwed = Math.max(0, s.totalAmount - Math.max(initialPaid, directPaid));
              priorDebts += netOwed;
            }
          });

          allRelevantPayments
            .filter((p) => p.direction === 'balance_added' && p.timestamp < freshSale.timestamp)
            .forEach((p) => {
              priorDebts += p.amount;
            });

          // Initial debt of this sale
          const basePaid = Math.max(0, freshSale.paidAmount || 0);
          const thisSaleInitialDebt = Math.max(0, totalAmount - Math.max(basePaid, directPaymentsReceived));

          // General customer payments and credits available to clear debt
          let availableGeneralPayments = allRelevantPayments
            .filter((p) => (
              (p.direction === 'payment_received' && (!p.referenceId || p.referenceId === freshCustomer.id)) ||
              p.direction === 'write_off' ||
              p.direction === 'return_refund'
            ))
            .reduce((sum, p) => sum + p.amount, 0);

          customerReturns.forEach((r) => {
            availableGeneralPayments += r.totalAmount;
          });

          // Apply general payments FIFO
          const generalToPrior = Math.min(priorDebts, availableGeneralPayments);
          const remainingPriorDebt = priorDebts - generalToPrior;
          const generalRemaining = availableGeneralPayments - generalToPrior;

          const generalToThisSale = Math.min(thisSaleInitialDebt, generalRemaining);
          const remainingThisSaleDebt = thisSaleInitialDebt - generalToThisSale;

          dueAmount = roundCurrencyAmount(remainingThisSaleDebt);
          paidAmount = roundCurrencyAmount(Math.min(totalAmount, totalAmount - dueAmount));
          oldDueAmount = roundCurrencyAmount(remainingPriorDebt);

          // Reconcile with latest customer balance from DB
          if (dueAmount > currentCustomerBalance) {
            dueAmount = currentCustomerBalance;
            paidAmount = roundCurrencyAmount(Math.max(0, totalAmount - dueAmount));
            oldDueAmount = 0;
          } else if (oldDueAmount + dueAmount > currentCustomerBalance) {
            oldDueAmount = roundCurrencyAmount(Math.max(0, currentCustomerBalance - dueAmount));
          }
        }
      }
    }

    const grandTotalPayable = roundCurrencyAmount(oldDueAmount + totalAmount);
    const paidStatus = dueAmount <= 0.001 ? 'PAID' : (paidAmount > 0.001 ? 'PARTIALLY PAID' : 'UNPAID');

    // Keep sales table paidAmount synced with real-time payment calculations
    if (freshSale.paidAmount !== paidAmount) {
      try {
        await supabase
          .from('sales')
          .update({ paidAmount })
          .eq('id', freshSale.id)
          .eq('orgId', orgId);
      } catch (err) {
        console.warn('Could not sync sale paidAmount in DB:', err);
      }
    }

    return {
      sale: { ...freshSale, paidAmount },
      customer: freshCustomer,
      items: freshItems,
      locations: freshLocations,
      location: freshLocation,
      paymentRecords: allRelevantPayments,
      totalAmount,
      paidAmount,
      dueAmount,
      oldDueAmount,
      grandTotalPayable,
      paidStatus,
    };
  },
};
