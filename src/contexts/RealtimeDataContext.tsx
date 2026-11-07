import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useTenancy } from '../contexts';
import { subscribeToDataChanges, notifyDataChanged } from '../services/dbUtils';
import {
  Item,
  InventoryLocation,
  ItemCategory,
  InventoryTransaction,
  Sale,
  Purchase,
  ExpenseEntry,
  Customer,
  Supplier,
  PaymentRecord,
} from '../types';

export { notifyDataChanged };

interface RealtimeDataContextType {
  items: Item[];
  locations: InventoryLocation[];
  categories: ItemCategory[];
  transactions: InventoryTransaction[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: ExpenseEntry[];
  customers: Customer[];
  suppliers: Supplier[];
  payments: PaymentRecord[];
  loading: boolean;
  refreshData: () => Promise<void>;
  refreshItems: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshSales: () => Promise<void>;
  refreshPurchases: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  refreshSuppliers: () => Promise<void>;
  refreshPayments: () => Promise<void>;
  refreshExpenses: () => Promise<void>;
}

const RealtimeDataContext = createContext<RealtimeDataContextType | undefined>(undefined);

export function RealtimeDataProvider({ children }: { children: React.ReactNode }) {
  const { currentOrg } = useTenancy();
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const activeOrgIdRef = useRef<string | null>(null);

  const fetchItems = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('orgId', orgId)
        .order('name');
      if (!error && data) setItems(data as Item[]);
    } catch (e) {
      console.error('Error fetching items:', e);
    }
  }, []);

  const fetchLocations = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('orgId', orgId)
        .order('name');
      if (!error && data) setLocations(data as InventoryLocation[]);
    } catch (e) {
      console.error('Error fetching locations:', e);
    }
  }, []);

  const fetchCategories = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('orgId', orgId)
        .order('name');
      if (!error && data) setCategories(data as ItemCategory[]);
    } catch (e) {
      console.error('Error fetching categories:', e);
    }
  }, []);

  const fetchTransactions = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('orgId', orgId)
        .order('timestamp', { ascending: false });
      if (!error && data) setTransactions(data as InventoryTransaction[]);
    } catch (e) {
      console.error('Error fetching transactions:', e);
    }
  }, []);

  const fetchSales = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('orgId', orgId)
        .order('timestamp', { ascending: false });
      if (!error && data) setSales(data as Sale[]);
    } catch (e) {
      console.error('Error fetching sales:', e);
    }
  }, []);

  const fetchPurchases = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('orgId', orgId)
        .order('timestamp', { ascending: false });
      if (!error && data) setPurchases(data as Purchase[]);
    } catch (e) {
      console.error('Error fetching purchases:', e);
    }
  }, []);

  const fetchExpenses = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('expense_entries')
        .select('*')
        .eq('orgId', orgId)
        .order('entryDate', { ascending: false });
      if (!error && data) setExpenses(data as ExpenseEntry[]);
    } catch (e) {
      console.error('Error fetching expenses:', e);
    }
  }, []);

  const fetchCustomers = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('orgId', orgId)
        .order('name');
      if (!error && data) setCustomers(data as Customer[]);
    } catch (e) {
      console.error('Error fetching customers:', e);
    }
  }, []);

  const fetchSuppliers = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('orgId', orgId)
        .order('name');
      if (!error && data) setSuppliers(data as Supplier[]);
    } catch (e) {
      console.error('Error fetching suppliers:', e);
    }
  }, []);

  const fetchPayments = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('orgId', orgId)
        .order('timestamp', { ascending: false });
      if (!error && data) setPayments(data as PaymentRecord[]);
    } catch (e) {
      console.error('Error fetching payments:', e);
    }
  }, []);

  const refreshAll = useCallback(async (orgId: string) => {
    try {
      await Promise.allSettled([
        fetchItems(orgId),
        fetchLocations(orgId),
        fetchCategories(orgId),
        fetchTransactions(orgId),
        fetchSales(orgId),
        fetchPurchases(orgId),
        fetchExpenses(orgId),
        fetchCustomers(orgId),
        fetchSuppliers(orgId),
        fetchPayments(orgId),
      ]);
    } catch (err) {
      console.error('Error fetching realtime data:', err);
    }
  }, [
    fetchItems,
    fetchLocations,
    fetchCategories,
    fetchTransactions,
    fetchSales,
    fetchPurchases,
    fetchExpenses,
    fetchCustomers,
    fetchSuppliers,
    fetchPayments,
  ]);

  useEffect(() => {
    if (!currentOrg) {
      activeOrgIdRef.current = null;
      setItems([]);
      setLocations([]);
      setCategories([]);
      setTransactions([]);
      setSales([]);
      setPurchases([]);
      setExpenses([]);
      setCustomers([]);
      setSuppliers([]);
      setPayments([]);
      setLoading(false);
      return;
    }

    const orgId = currentOrg.id;
    activeOrgIdRef.current = orgId;
    setLoading(true);

    // Initial load
    refreshAll(orgId).finally(() => setLoading(false));

    // 1. Subscribe to active state triggers (local and cross-tab window events)
    const unsubscribeLocal = subscribeToDataChanges((event) => {
      if (event.orgId && event.orgId !== orgId) return;
      const table = event.table;
      switch (table) {
        case 'items':
          fetchItems(orgId);
          break;
        case 'locations':
          fetchLocations(orgId);
          break;
        case 'categories':
          fetchCategories(orgId);
          break;
        case 'transactions':
          fetchTransactions(orgId);
          break;
        case 'sales':
          fetchSales(orgId);
          fetchCustomers(orgId);
          fetchTransactions(orgId);
          fetchItems(orgId);
          fetchPayments(orgId);
          break;
        case 'purchases':
          fetchPurchases(orgId);
          fetchSuppliers(orgId);
          fetchTransactions(orgId);
          fetchItems(orgId);
          fetchPayments(orgId);
          break;
        case 'expense_entries':
          fetchExpenses(orgId);
          break;
        case 'customers':
          fetchCustomers(orgId);
          break;
        case 'suppliers':
          fetchSuppliers(orgId);
          break;
        case 'payments':
          fetchPayments(orgId);
          fetchCustomers(orgId);
          fetchSuppliers(orgId);
          break;
        case 'stock_summaries':
          fetchItems(orgId);
          fetchTransactions(orgId);
          break;
        default:
          refreshAll(orgId);
          break;
      }
    });

    // 2. Window focus trigger: re-fetch fresh state whenever user returns to the tab
    const handleWindowFocus = () => {
      refreshAll(orgId);
    };
    window.addEventListener('focus', handleWindowFocus);

    // 3. Periodic polling fallback (every 25s) as a safety net
    const pollingInterval = setInterval(() => {
      refreshAll(orgId);
    }, 25000);

    // 4. Supabase Realtime channel subscription with table listeners
    const isMatchingOrg = (payload: any) => {
      const rowOrgId =
        payload?.new?.orgId ??
        payload?.new?.orgid ??
        payload?.old?.orgId ??
        payload?.old?.orgid;
      return !rowOrgId || rowOrgId === orgId;
    };

    const channel = supabase
      .channel(`realtime_pub_${orgId}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (p) => {
        if (isMatchingOrg(p)) fetchItems(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, (p) => {
        if (isMatchingOrg(p)) fetchLocations(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (p) => {
        if (isMatchingOrg(p)) fetchCategories(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (p) => {
        if (isMatchingOrg(p)) fetchTransactions(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (p) => {
        if (isMatchingOrg(p)) {
          fetchSales(orgId);
          fetchCustomers(orgId);
          fetchTransactions(orgId);
          fetchItems(orgId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, (p) => {
        if (isMatchingOrg(p)) {
          fetchPurchases(orgId);
          fetchSuppliers(orgId);
          fetchTransactions(orgId);
          fetchItems(orgId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_entries' }, (p) => {
        if (isMatchingOrg(p)) fetchExpenses(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (p) => {
        if (isMatchingOrg(p)) fetchCustomers(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, (p) => {
        if (isMatchingOrg(p)) fetchSuppliers(orgId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (p) => {
        if (isMatchingOrg(p)) {
          fetchPayments(orgId);
          fetchCustomers(orgId);
          fetchSuppliers(orgId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_summaries' }, (p) => {
        if (isMatchingOrg(p)) {
          fetchItems(orgId);
          fetchTransactions(orgId);
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to org tables (${orgId})`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Subscription error:', err);
        }
      });

    return () => {
      unsubscribeLocal();
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [
    currentOrg,
    refreshAll,
    fetchItems,
    fetchLocations,
    fetchCategories,
    fetchTransactions,
    fetchSales,
    fetchPurchases,
    fetchExpenses,
    fetchCustomers,
    fetchSuppliers,
    fetchPayments,
  ]);

  return (
    <RealtimeDataContext.Provider
      value={{
        items,
        locations,
        categories,
        transactions,
        sales,
        purchases,
        expenses,
        customers,
        suppliers,
        payments,
        loading,
        refreshData: () => (currentOrg ? refreshAll(currentOrg.id) : Promise.resolve()),
        refreshItems: () => (currentOrg ? fetchItems(currentOrg.id) : Promise.resolve()),
        refreshTransactions: () => (currentOrg ? fetchTransactions(currentOrg.id) : Promise.resolve()),
        refreshSales: () => (currentOrg ? fetchSales(currentOrg.id) : Promise.resolve()),
        refreshPurchases: () => (currentOrg ? fetchPurchases(currentOrg.id) : Promise.resolve()),
        refreshCustomers: () => (currentOrg ? fetchCustomers(currentOrg.id) : Promise.resolve()),
        refreshSuppliers: () => (currentOrg ? fetchSuppliers(currentOrg.id) : Promise.resolve()),
        refreshPayments: () => (currentOrg ? fetchPayments(currentOrg.id) : Promise.resolve()),
        refreshExpenses: () => (currentOrg ? fetchExpenses(currentOrg.id) : Promise.resolve()),
      }}
    >
      {children}
    </RealtimeDataContext.Provider>
  );
}

export function useRealtimeData() {
  const context = useContext(RealtimeDataContext);
  if (context === undefined) {
    throw new Error('useRealtimeData must be used within a RealtimeDataProvider');
  }
  return context;
}

