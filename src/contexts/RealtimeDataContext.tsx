import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useTenancy } from '../contexts';
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
} from '../types';

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
  loading: boolean;
  refreshData: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('orgId', orgId)
      .order('name');
    if (data) setItems(data as Item[]);
  }, []);

  const fetchLocations = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('orgId', orgId)
      .order('name');
    if (data) setLocations(data as InventoryLocation[]);
  }, []);

  const fetchCategories = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('orgId', orgId)
      .order('name');
    if (data) setCategories(data as ItemCategory[]);
  }, []);

  const fetchTransactions = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false });
    if (data) setTransactions(data as InventoryTransaction[]);
  }, []);

  const fetchSales = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false });
    if (data) setSales(data as Sale[]);
  }, []);

  const fetchPurchases = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('purchases')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false });
    if (data) setPurchases(data as Purchase[]);
  }, []);

  const fetchExpenses = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('expense_entries')
      .select('*')
      .eq('orgId', orgId)
      .order('entryDate', { ascending: false });
    if (data) setExpenses(data as ExpenseEntry[]);
  }, []);

  const fetchCustomers = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('orgId', orgId)
      .order('name');
    if (data) setCustomers(data as Customer[]);
  }, []);

  const fetchSuppliers = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('orgId', orgId)
      .order('name');
    if (data) setSuppliers(data as Supplier[]);
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
  ]);

  useEffect(() => {
    if (!currentOrg) {
      setItems([]);
      setLocations([]);
      setCategories([]);
      setTransactions([]);
      setSales([]);
      setPurchases([]);
      setExpenses([]);
      setCustomers([]);
      setSuppliers([]);
      setLoading(false);
      return;
    }

    const orgId = currentOrg.id;
    setLoading(true);

    // Initial load
    refreshAll(orgId).finally(() => setLoading(false));

    // Supabase Realtime channel subscription
    const channel = supabase
      .channel(`realtime_org_${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', filter: `orgId=eq.${orgId}` },
        (payload) => {
          const table = payload.table;
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
              break;
            case 'purchases':
              fetchPurchases(orgId);
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
            default:
              refreshAll(orgId);
              break;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOrg, refreshAll, fetchItems, fetchLocations, fetchCategories, fetchTransactions, fetchSales, fetchPurchases, fetchExpenses, fetchCustomers, fetchSuppliers]);

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
        loading,
        refreshData: () => (currentOrg ? refreshAll(currentOrg.id) : Promise.resolve()),
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
