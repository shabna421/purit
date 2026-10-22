import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
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

    setLoading(true);

    const orgId = currentOrg.id;
    const unsubscribes: (() => void)[] = [];

    const handleError = (collectionName: string, error: any) => {
      console.error(`Error in subscription to ${collectionName}:`, error);
    };

    // 1. Items
    const itemsQuery = query(collection(db, 'organizations', orgId, 'items'), orderBy('name'));
    const unsubItems = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Item)));
    }, (err) => handleError('items', err));
    unsubscribes.push(unsubItems);

    // 2. Locations
    const locationsQuery = query(collection(db, 'organizations', orgId, 'locations'), orderBy('name'));
    const unsubLocations = onSnapshot(locationsQuery, (snapshot) => {
      setLocations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as InventoryLocation)));
    }, (err) => handleError('locations', err));
    unsubscribes.push(unsubLocations);

    // 3. Categories
    const categoriesQuery = query(collection(db, 'organizations', orgId, 'categories'), orderBy('name'));
    const unsubCategories = onSnapshot(categoriesQuery, (snapshot) => {
      setCategories(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ItemCategory)));
    }, (err) => handleError('categories', err));
    unsubscribes.push(unsubCategories);

    // 4. Transactions
    const transactionsQuery = query(collection(db, 'organizations', orgId, 'transactions'), orderBy('timestamp', 'desc'));
    const unsubTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      setTransactions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as InventoryTransaction)));
    }, (err) => handleError('transactions', err));
    unsubscribes.push(unsubTransactions);

    // 5. Sales
    const salesQuery = query(collection(db, 'organizations', orgId, 'sales'), orderBy('timestamp', 'desc'));
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      setSales(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Sale)));
    }, (err) => handleError('sales', err));
    unsubscribes.push(unsubSales);

    // 6. Purchases
    const purchasesQuery = query(collection(db, 'organizations', orgId, 'purchases'), orderBy('timestamp', 'desc'));
    const unsubPurchases = onSnapshot(purchasesQuery, (snapshot) => {
      setPurchases(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Purchase)));
    }, (err) => handleError('purchases', err));
    unsubscribes.push(unsubPurchases);

    // 7. Expenses
    const expensesQuery = query(collection(db, 'organizations', orgId, 'expenseEntries'), orderBy('entryDate', 'desc'));
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ExpenseEntry)));
    }, (err) => handleError('expenses', err));
    unsubscribes.push(unsubExpenses);

    // 8. Customers
    const customersQuery = query(collection(db, 'organizations', orgId, 'customers'), orderBy('name'));
    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      setCustomers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => handleError('customers', err));
    unsubscribes.push(unsubCustomers);

    // 9. Suppliers
    const suppliersQuery = query(collection(db, 'organizations', orgId, 'suppliers'), orderBy('name'));
    const unsubSuppliers = onSnapshot(suppliersQuery, (snapshot) => {
      setSuppliers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Supplier)));
    }, (err) => handleError('suppliers', err));
    unsubscribes.push(unsubSuppliers);

    setLoading(false);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [currentOrg]);

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
