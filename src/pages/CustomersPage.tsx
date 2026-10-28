import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTenancy } from '../contexts';
import { useAuth } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Customer, PaymentRecord, Sale } from '../types';
import { 
  Plus, Search, User, Phone, MapPin, X, Loader2, Pencil, Wallet, HandCoins, 
  Trash2, BookOpen, Download, ShoppingCart, Coins, Clock, CreditCard, 
  BarChart2, FileText, MinusCircle, CircleDollarSign, MoreVertical 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useNotifications } from '../notifications';
import { formatCurrency } from '../utils/currency';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import { CustomerLedgerModal } from '../components/CustomerLedgerModal';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';
import { DispenserRecord, DEFAULT_DISPENSERS } from './DispensersPage';

function formatReference(referenceId?: string) {
  if (!referenceId) return '-';
  return `#${referenceId.slice(-6).toUpperCase()}`;
}

function labelForPaymentRecord(record: PaymentRecord) {
  switch (record.direction) {
    case 'payment_received':
      return 'Due Collected';
    case 'balance_added':
      return 'Manual Adjustment';
    case 'write_off':
      return 'Balance Reduction';
    case 'sale_due_added':
      return 'Sale Created';
    case 'sale_due_updated':
      return 'Sale Updated';
    case 'return_refund':
      return 'Return / Refund';
    default:
      return 'Balance Change';
  }
}

const emptyCustomerForm: Partial<Customer> = {
  name: '',
  shopName: '',
  phone: '',
  email: '',
  address: '',
  route: '',
  balance: 0,
  gstin: '',
};

export default function CustomersPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const { customers, loading, sales, items } = useRealtimeData();
  const productCatalogMap = useMemo(() => new Map((items || []).map((i) => [i.id, i])), [items]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.customer-actions-menu')) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeMenuId]);
  const dispStorageKey = `purit_dispensers_${currentOrg?.id || 'default'}`;
  const [dispenserRecords, setDispenserRecords] = useState<DispenserRecord[]>(() => {
    try {
      const saved = localStorage.getItem(dispStorageKey);
      if (saved) return JSON.parse(saved);
      return DEFAULT_DISPENSERS;
    } catch {
      return DEFAULT_DISPENSERS;
    }
  });

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e?.detail) {
        setDispenserRecords(e.detail);
      } else {
        try {
          const saved = localStorage.getItem(dispStorageKey);
          if (saved) setDispenserRecords(JSON.parse(saved));
        } catch {}
      }
    };
    window.addEventListener('purit_dispensers_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('purit_dispensers_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [dispStorageKey]);

  const [dispensers, setDispensers] = useState<Record<string, { td: number; fhb: number }>>(() => {
    try {
      const saved = localStorage.getItem('purit_customer_dispensers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateDispenser = (customerId: string, type: 'td' | 'fhb', delta: number) => {
    const cust = customers.find((c) => c.id === customerId);
    const isKattan = cust?.name?.toLowerCase().includes('kattan') || cust?.shopName?.toLowerCase().includes('kattan');
    
    // Find customer's assigned records in dispenserRecords
    const assigned = dispenserRecords.filter((d) => {
      if (d.customerId && d.customerId === customerId) return true;
      if (!d.customerName || !cust) return false;
      const target = d.customerName.toLowerCase().trim();
      const cName = cust.name.toLowerCase().trim();
      const sName = (cust.shopName || '').toLowerCase().trim();
      return target === cName || (sName && target === sName) || cName.includes(target) || target.includes(cName);
    });

    const custTd = assigned.find((d) => {
      const n = d.itemName.toLowerCase();
      return n.includes('td') || n.includes('tissue');
    });
    const custFhb = assigned.find((d) => {
      const n = d.itemName.toLowerCase();
      return n.includes('fhb') || n.includes('foam');
    });

    const defaultTd = custTd?.quantity ?? (isKattan ? 3 : 0);
    const defaultFhb = custFhb?.quantity ?? (isKattan ? 2 : 0);
    const defaultForCust = { td: defaultTd, fhb: defaultFhb };

    const current = dispensers[customerId] || defaultForCust;
    const currentCount = current[type] ?? 0;
    if (delta < 0 && currentCount <= 0) return;

    const newCount = Math.max(0, currentCount + delta);
    const actualDelta = newCount - currentCount;
    if (actualDelta === 0) return;

    // Pure state updater
    setDispensers((prev) => {
      const prevCustomer = prev[customerId] || defaultForCust;
      return {
        ...prev,
        [customerId]: {
          ...prevCustomer,
          [type]: newCount,
        },
      };
    });

    try {
      const updatedAll = {
        ...dispensers,
        [customerId]: {
          ...current,
          [type]: newCount,
        },
      };
      localStorage.setItem('purit_customer_dispensers', JSON.stringify(updatedAll));
    } catch (e) {
      console.error(e);
    }

    // Sync with purit_dispensers localStorage list
    try {
      const rawDisp = localStorage.getItem(dispStorageKey);
      let dispList: DispenserRecord[] = rawDisp ? JSON.parse(rawDisp) : [...dispenserRecords];

      // Match the customer's dispenser record if it exists
      const targetCustIndex = dispList.findIndex((d) => {
        const matchesCust = (d.customerId && d.customerId === customerId) ||
          (cust && d.customerName && (
            d.customerName.toLowerCase().includes(cust.name.toLowerCase()) ||
            cust.name.toLowerCase().includes(d.customerName.toLowerCase())
          ));
        if (!matchesCust) return false;
        const n = d.itemName.toLowerCase();
        return type === 'td' ? (n.includes('td') || n.includes('tissue')) : (n.includes('fhb') || n.includes('foam'));
      });

      if (targetCustIndex !== -1) {
        const target = dispList[targetCustIndex];
        const unitPrice = target.unitPrice || (type === 'td' ? 2000 : 3000);
        dispList[targetCustIndex] = {
          ...target,
          quantity: newCount,
          totalAmount: newCount * unitPrice,
        };
      } else {
        // If customer doesn't have a specific record yet, create one
        const generalItem = dispList.find((d) => {
          const n = d.itemName.toLowerCase();
          return type === 'td' ? (n.includes('td') || n.includes('tissue')) : (n.includes('fhb') || n.includes('foam'));
        });
        const unitPrice = generalItem?.unitPrice || (type === 'td' ? 2000 : 3000);
        dispList.push({
          id: `disp-${Date.now()}`,
          itemName: type === 'td' ? 'Tissue Dispenser (TD)' : 'Foam Hand Wash Dispenser (FHB)',
          quantity: newCount,
          unitPrice,
          totalAmount: newCount * unitPrice,
          customerId: customerId,
          customerName: cust ? (cust.shopName ? `${cust.name} (${cust.shopName})` : cust.name) : undefined,
          date: new Date().toISOString().split('T')[0],
          createdAt: Date.now(),
        });
      }

      localStorage.setItem(dispStorageKey, JSON.stringify(dispList));
      setDispenserRecords(dispList);
      window.dispatchEvent(new CustomEvent('purit_dispensers_updated', { detail: dispList }));
    } catch (err) {
      console.error('Failed to sync dispenser records:', err);
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>(emptyCustomerForm);
  const [balanceCustomer, setBalanceCustomer] = useState<Customer | null>(null);
  const [balanceAction, setBalanceAction] = useState<'collect-payment' | 'add-due' | 'write-off'>('collect-payment');
  const [balanceAmount, setBalanceAmount] = useState<number | ''>('');
  const [balanceMethod, setBalanceMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [balanceNotes, setBalanceNotes] = useState('');
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Customer Ledger Modal states
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerSales, setLedgerSales] = useState<Sale[]>([]);
  const [ledgerPaymentRecords, setLedgerPaymentRecords] = useState<PaymentRecord[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, string>>(new Map());

  const openLedgerModal = async (customer: Customer) => {
    if (!currentOrg) return;
    setLedgerCustomer(customer);
    setIsLedgerModalOpen(true);
    try {
      const [salesData, paymentsData, itemsData] = await Promise.all([
        saleService.getSales(currentOrg.id),
        saleService.getCustomerPaymentRecords(currentOrg.id, customer.id),
        inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
      ]);
      setLedgerSales(salesData);
      setLedgerPaymentRecords(paymentsData);
      setItemsMap(new Map(itemsData.map((i) => [i.id, i.name])));
    } catch (err) {
      console.error('Error fetching ledger data:', err);
    }
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      shopName: customer.shopName || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      route: customer.route || '',
      balance: customer.balance || 0,
      gstin: customer.gstin || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await saleService.updateCustomer(currentOrg.id, editingCustomer.id, customerForm);
      } else {
        await saleService.createCustomer(currentOrg.id, customerForm);
      }
      setIsModalOpen(false);
      setCustomerForm(emptyCustomerForm);
      setEditingCustomer(null);
      success(editingCustomer ? 'Customer updated successfully' : 'Customer created successfully');
    } catch (error) {
      console.error('Error saving customer:', error);
      notifyError(editingCustomer ? 'Failed to update customer' : 'Failed to create customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers
    .filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.shopName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm) ||
      c.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const balA = a.balance || 0;
      const balB = b.balance || 0;
      if (balA > 0 && balB > 0) {
        return balB - balA; // Show highest due amount first
      }
      if (balA > 0 && balB <= 0) {
        return -1; // Due balance goes to the top
      }
      if (balA <= 0 && balB > 0) {
        return 1; // Due balance goes to the top
      }
      return a.name.localeCompare(b.name); // Alphabetical sort for zero balances
    });
  const totalAmountToReceive = customers.reduce((sum, customer) => sum + (customer.balance || 0), 0);

  const openBalanceModal = (customer: Customer, action: 'collect-payment' | 'add-due' | 'write-off' = 'collect-payment') => {
    setBalanceCustomer(customer);
    setBalanceAction(action);
    setBalanceAmount('');
    setBalanceMethod('cash');
    setBalanceNotes('');
  };

  const closeBalanceModal = () => {
    setBalanceCustomer(null);
    setBalanceAmount('');
    setBalanceNotes('');
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!currentOrg) return;
    if (customer.balance > 0) {
      notifyError('Clear the pending amount before deleting this customer.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saleService.deleteCustomer(currentOrg.id, customer.id);
      success('Customer deleted successfully');
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      notifyError(error.message || 'Failed to delete customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextBalance = balanceCustomer
    ? balanceAction === 'add-due'
      ? balanceCustomer.balance + (typeof balanceAmount === 'number' ? balanceAmount : 0)
      : balanceCustomer.balance - (typeof balanceAmount === 'number' ? balanceAmount : 0)
    : 0;

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !balanceCustomer) return;

    setIsSubmitting(true);
    try {
      await saleService.createCustomerBalanceTransaction(currentOrg.id, user.uid, {
        customerId: balanceCustomer.id,
        amount: typeof balanceAmount === 'number' ? balanceAmount : 0,
        action: balanceAction,
        paymentMethod: balanceMethod,
        notes: balanceNotes,
      });
      closeBalanceModal();
      success(
        balanceAction === 'add-due'
          ? 'Customer due increased successfully'
          : balanceAction === 'write-off'
            ? 'Customer balance reduced successfully'
            : 'Payment collected successfully'
      );
    } catch (error: any) {
      console.error('Error updating customer balance:', error);
      notifyError(error.message || 'Failed to update customer balance');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading customers...</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Customers</h2>
          <p className="text-sm text-zinc-500">Manage your customer database and credit balances.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-medium shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input 
          type="text" 
          placeholder="Search by name, shop, or phone..." 
          className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-green-50 p-5 shadow-sm">
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Total Amount to Receive</p>
        <p className="mt-2 text-3xl font-bold text-orange-600">
          {formatCurrency(totalAmountToReceive, currentOrg?.settings.currency)}
        </p>
        <p className="mt-2 text-sm text-zinc-500">Pending amount from all customers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 bg-white border border-zinc-200 rounded-2xl">
            No customers found.
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const custSales = sales?.filter((s) => s.customerId === customer.id) || [];
            const realTotalSales = custSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
            const realCollected = custSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
            const dueVal = customer.balance || 0;

            const totalSalesVal = realTotalSales;
            const collectedVal = Math.max(realCollected, Math.max(0, totalSalesVal - dueVal));

            // Find all dispenser records assigned to this customer in Dispensers inventory
            const custDispensers = dispenserRecords.filter((d) => {
              if (d.customerId && d.customerId === customer.id) return true;
              if (!d.customerName) return false;
              const target = d.customerName.toLowerCase().trim();
              const cName = customer.name.toLowerCase().trim();
              const sName = (customer.shopName || '').toLowerCase().trim();
              return (
                target === cName ||
                (sName && target === sName) ||
                cName.includes(target) ||
                target.includes(cName) ||
                (sName && (sName.includes(target) || target.includes(sName)))
              );
            });

            // Find specific TD / FHB records for this customer
            const custTdRecord = custDispensers.find((d) => {
              const n = d.itemName.toLowerCase();
              return n.includes('td') || n.includes('tissue');
            });
            const custFhbRecord = custDispensers.find((d) => {
              const n = d.itemName.toLowerCase();
              return n.includes('fhb') || n.includes('foam');
            });

            // General TD / FHB unit prices from dispenser catalog
            const generalTdRecord = dispenserRecords.find((d) => {
              const n = d.itemName.toLowerCase();
              return n.includes('td') || n.includes('tissue');
            });
            const generalFhbRecord = dispenserRecords.find((d) => {
              const n = d.itemName.toLowerCase();
              return n.includes('fhb') || n.includes('foam');
            });

            const tdUnitPrice = custTdRecord?.unitPrice ?? generalTdRecord?.unitPrice ?? 2000;
            const fhbUnitPrice = custFhbRecord?.unitPrice ?? generalFhbRecord?.unitPrice ?? 3000;

            const isKattan = customer.name?.toLowerCase().includes('kattan') || customer.shopName?.toLowerCase().includes('kattan');
            const savedDispensers = dispensers[customer.id];

            // Counts: prioritize card state if manually clicked, otherwise assigned dispenser quantity, otherwise default
            const tdCount = savedDispensers?.td !== undefined
              ? savedDispensers.td
              : (custTdRecord?.quantity ?? (isKattan ? 3 : 0));

            const fhbCount = savedDispensers?.fhb !== undefined
              ? savedDispensers.fhb
              : (custFhbRecord?.quantity ?? (isKattan ? 2 : 0));

            // Any other dispenser items assigned to this customer
            const otherDispensersCost = custDispensers
              .filter((d) => d.id !== custTdRecord?.id && d.id !== custFhbRecord?.id)
              .reduce((sum, d) => sum + (d.totalAmount ?? ((d.quantity || 0) * (d.unitPrice || 0))), 0);

            // Compute exact dispenser cost using customer records or units * price
            const tdCost = custTdRecord && custTdRecord.quantity === tdCount
              ? custTdRecord.totalAmount
              : tdCount * tdUnitPrice;

            const fhbCost = custFhbRecord && custFhbRecord.quantity === fhbCount
              ? custFhbRecord.totalAmount
              : fhbCount * fhbUnitPrice;

            const dispenserCostVal = tdCost + fhbCost + otherDispensersCost;

            let profitVal = 0;
            custSales.forEach((s) => {
              (s.items || []).forEach((line) => {
                const product = productCatalogMap.get(line.itemId);
                const cost = (product?.basePrice ?? 0) * (line.quantity || 0);
                const rev = (line.unitPrice ?? 0) * (line.quantity || 0);
                profitVal += (rev - cost);
              });
            });

            const netProfitVal = profitVal - dispenserCostVal;

            const formatStat = (amount: number) => {
              try {
                return new Intl.NumberFormat(currentOrg?.settings.currency === 'INR' ? 'en-IN' : 'en', {
                  style: 'currency',
                  currency: currentOrg?.settings.currency || 'INR',
                  currencyDisplay: 'narrowSymbol',
                  maximumFractionDigits: 0,
                }).format(amount);
              } catch {
                return `₹${Math.round(amount).toLocaleString()}`;
              }
            };

            return (
              <div
                key={customer.id}
                className="bg-white border border-zinc-200/90 rounded-[28px] p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 group"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shrink-0 shadow-2xs">
                      <User className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900 tracking-tight leading-snug">
                        {customer.name}
                      </h3>
                      <p className="text-sm text-zinc-400 font-medium mt-0.5">
                        {customer.shopName || 'No Shop Name'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">BALANCE</span>
                      <span className={`text-xl font-bold tracking-tight block ${customer.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(customer.balance, currentOrg?.settings.currency)}
                      </span>
                    </div>
                    <div className="relative customer-actions-menu">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === customer.id ? null : customer.id);
                        }}
                        className="w-8 h-8 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition-colors"
                        title="Customer options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {activeMenuId === customer.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            className="absolute right-0 top-full mt-1.5 z-30 w-32 rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-xl"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                openEditModal(customer);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                setCustomerToDelete(customer);
                              }}
                              disabled={customer.balance > 0 || isSubmitting}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title={customer.balance > 0 ? 'Pending amount must be zero to delete' : 'Delete customer'}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>Delete</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Dispensers row */}
                <div className="grid grid-cols-2 gap-3.5">
                  {/* TD - Tissue Dispensers */}
                  <div className="bg-[#f0f6ff] border border-blue-100/90 rounded-3xl p-4 sm:p-4.5 min-h-[108px] flex flex-col justify-between shadow-2xs hover:border-blue-200 transition-all">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <ellipse cx="7.5" cy="12" rx="4" ry="7.5" />
                          <ellipse cx="7.5" cy="12" rx="1.5" ry="3" />
                          <path d="M 7.5 4.5 H 16.5 C 18.7 4.5 20.5 6.3 20.5 8.5 V 17.5 L 18.5 19.5 L 16.5 17.5 L 14.5 19.5 L 12.5 17.5 L 10.5 19.5 L 8.5 17.5 V 10.5" />
                        </svg>
                      </div>
                      <span className="text-sm font-black text-blue-600 tracking-tight">
                        TD
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                      <button
                        type="button"
                        onClick={() => updateDispenser(customer.id, 'td', -1)}
                        disabled={tdCount <= 0}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-100/80 hover:bg-blue-200 text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm sm:text-base font-bold transition-all shadow-2xs shrink-0"
                        title="Decrease Tissue Dispenser"
                      >
                        -
                      </button>
                      <span className="text-2xl sm:text-3xl font-black text-zinc-900 leading-none">
                        {tdCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDispenser(customer.id, 'td', 1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-100/80 hover:bg-blue-200 text-blue-600 flex items-center justify-center text-sm sm:text-base font-bold transition-all shadow-2xs shrink-0"
                        title="Add Tissue Dispenser"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* FHB - Foam Hand Wash Dispensers */}
                  <div className="bg-[#f0fbf4] border border-emerald-100/90 rounded-3xl p-4 sm:p-4.5 min-h-[108px] flex flex-col justify-between shadow-2xs hover:border-emerald-200 transition-all">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 3h4" />
                          <path d="M12 3v4" />
                          <path d="M8 7h8a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2Z" />
                          <path d="M9 13a3 3 0 0 0 6 0" />
                        </svg>
                      </div>
                      <span className="text-sm font-black text-emerald-600 tracking-tight">
                        FHB
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                      <button
                        type="button"
                        onClick={() => updateDispenser(customer.id, 'fhb', -1)}
                        disabled={fhbCount <= 0}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100/80 hover:bg-emerald-200 text-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm sm:text-base font-bold transition-all shadow-2xs shrink-0"
                        title="Decrease Foam Hand Wash Dispenser"
                      >
                        -
                      </button>
                      <span className="text-2xl sm:text-3xl font-black text-zinc-900 leading-none">
                        {fhbCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateDispenser(customer.id, 'fhb', 1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-100/80 hover:bg-emerald-200 text-emerald-600 flex items-center justify-center text-sm sm:text-base font-bold transition-all shadow-2xs shrink-0"
                        title="Add Foam Hand Wash Dispenser"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Financial metrics row */}
                <div>
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                    {/* Total Sales */}
                    <div className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 sm:p-4 min-h-[92px] sm:min-h-[100px] flex flex-col justify-between min-w-0 shadow-2xs hover:border-blue-200 transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-4 h-4 rounded-[5px] bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                          <ShoppingCart className="w-2.5 h-2.5" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 whitespace-nowrap">Total Sales</span>
                      </div>
                      <div className="mt-2.5 text-lg sm:text-xl xl:text-2xl font-bold text-zinc-900 tracking-tight whitespace-nowrap">
                        {formatStat(totalSalesVal)}
                      </div>
                    </div>

                    {/* Collected */}
                    <div className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 sm:p-4 min-h-[92px] sm:min-h-[100px] flex flex-col justify-between min-w-0 shadow-2xs hover:border-emerald-200 transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-4 h-4 rounded-[5px] bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <Coins className="w-2.5 h-2.5" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 whitespace-nowrap">Collected</span>
                      </div>
                      <div className="mt-2.5 text-lg sm:text-xl xl:text-2xl font-bold text-emerald-600 tracking-tight whitespace-nowrap">
                        {formatStat(collectedVal)}
                      </div>
                    </div>

                    {/* Due */}
                    <div className="bg-white border border-zinc-200/90 rounded-2xl p-3.5 sm:p-4 min-h-[92px] sm:min-h-[100px] flex flex-col justify-between min-w-0 shadow-2xs hover:border-rose-200 transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-4 h-4 rounded-[5px] bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 whitespace-nowrap">Due</span>
                      </div>
                      <div className="mt-2.5 text-lg sm:text-xl xl:text-2xl font-bold text-rose-600 tracking-tight whitespace-nowrap">
                        {formatStat(dueVal)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* STATUS Panel */}
                <div className="bg-[#f4faf6] border border-emerald-100/80 rounded-2xl p-3.5 sm:p-4 space-y-2">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase block">STATUS</span>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 items-stretch">
                    {/* Profit */}
                    <div className="flex items-start gap-1.5 min-w-0 h-full">
                      <div className="w-5 h-5 rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <CircleDollarSign className="w-2.5 h-2.5" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                        <div className="min-h-[28px] sm:min-h-[32px] flex flex-col justify-start">
                          <p className="text-[11px] text-zinc-500 font-medium leading-tight">Profit</p>
                        </div>
                        <p className="text-base sm:text-lg md:text-xl font-bold text-zinc-900 tracking-tight mt-1 whitespace-nowrap">
                          {formatStat(profitVal)}
                        </p>
                      </div>
                    </div>

                    {/* Dispenser Cost */}
                    <div className="flex items-start gap-1.5 min-w-0 h-full">
                      <div className="w-5 h-5 rounded-full bg-zinc-200/80 text-zinc-600 flex items-center justify-center shrink-0 mt-0.5">
                        <CreditCard className="w-2.5 h-2.5" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                        <div className="min-h-[28px] sm:min-h-[32px] flex flex-col justify-start">
                          <p className="text-[11px] text-zinc-500 font-medium leading-tight">Dispenser Cost</p>
                        </div>
                        <p className="text-base sm:text-lg md:text-xl font-bold text-zinc-900 tracking-tight mt-1 whitespace-nowrap">
                          {dispenserCostVal > 0 ? `-${formatStat(dispenserCostVal)}` : formatStat(0)}
                        </p>
                      </div>
                    </div>

                    {/* Net Status */}
                    <div className="flex items-start gap-1.5 min-w-0 h-full">
                      <div className="w-5 h-5 rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <BarChart2 className="w-2.5 h-2.5" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                        <div className="min-h-[28px] sm:min-h-[32px] flex flex-col justify-start">
                          <p className="text-[11px] text-zinc-500 font-medium leading-tight whitespace-nowrap">
                            Net Status
                          </p>
                          <p className={`text-[10px] font-semibold ${netProfitVal >= 0 ? 'text-emerald-600' : 'text-rose-600'} leading-tight mt-0.5 whitespace-nowrap`}>
                            {netProfitVal >= 0 ? 'Net Profit' : 'Net Loss'}
                          </p>
                        </div>
                        <p className={`text-base sm:text-lg md:text-xl font-bold ${netProfitVal >= 0 ? 'text-emerald-600' : 'text-rose-600'} tracking-tight mt-1 whitespace-nowrap`}>
                          {formatStat(netProfitVal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="space-y-2 pt-1">
                  {/* Records: Balance History & Customer Ledger */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <Link
                      to={`/customers/${customer.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors text-center"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>Balance History</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => openLedgerModal(customer)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-50 px-3 py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors text-center"
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Customer Ledger</span>
                    </button>
                  </div>

                  {/* Primary Action: Collect Payment */}
                  <button
                    type="button"
                    onClick={() => openBalanceModal(customer, 'collect-payment')}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-700 transition-colors"
                  >
                    <HandCoins className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Collect Payment</span>
                  </button>

                  {/* Balance adjustments: Add Due & Reduce Balance */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => openBalanceModal(customer, 'add-due')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50/90 px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                    >
                      <Wallet className="w-3.5 h-3.5 shrink-0" />
                      <span>Add Due</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openBalanceModal(customer, 'write-off')}
                      disabled={customer.balance <= 0}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                    >
                      <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Reduce Balance</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {balanceCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeBalanceModal}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-6">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Manage Customer Balance</h3>
                  <p className="text-sm text-zinc-500">{balanceCustomer.name}</p>
                </div>
                <button onClick={closeBalanceModal} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveBalance} className="space-y-4 p-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Current Balance</span>
                    <span className={`font-bold ${balanceCustomer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balanceCustomer.balance, currentOrg?.settings.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Balance After Action</span>
                    <span className={`font-bold ${nextBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(nextBalance, currentOrg?.settings.currency)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Action</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBalanceAction('collect-payment')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'collect-payment' ? 'border-green-500 bg-green-50 text-green-700' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Collect
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceAction('add-due')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'add-due' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Add Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceAction('write-off')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'write-off' ? 'border-zinc-900 bg-zinc-100 text-zinc-900' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Reduce
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Amount</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formatNumericInput(typeof balanceAmount === 'number' ? balanceAmount : undefined)}
                    onChange={(e) => setBalanceAmount(parseNumericInput(e.target.value) ?? '')}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'cheque'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setBalanceMethod(method)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase ${balanceMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600'}`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Notes</label>
                  <textarea
                    value={balanceNotes}
                    onChange={(e) => setBalanceNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-24 resize-none"
                    placeholder="Reason, receipt reference, or adjustment details"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || (typeof balanceAmount !== 'number' || balanceAmount <= 0)}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                  Save Balance Action
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Customer Name</label>
                    <input
                      required
                      type="text"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Shop Name</label>
                    <input
                      type="text"
                      value={customerForm.shopName}
                      onChange={(e) => setCustomerForm({ ...customerForm, shopName: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Phone</label>
                    <input
                      type="text"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Route</label>
                    <input
                      type="text"
                      value={customerForm.route}
                      onChange={(e) => setCustomerForm({ ...customerForm, route: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">GSTIN (GST Number)</label>
                    <input
                      type="text"
                      placeholder="e.g. 32ABCDE1234F1Z5"
                      value={customerForm.gstin || ''}
                      onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono uppercase"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Address</label>
                    <textarea
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {editingCustomer ? 'Save Changes' : 'Create Customer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Ledger PDF Modal */}
      <AnimatePresence>
      {/* Customer Ledger Modal */}
      {isLedgerModalOpen && ledgerCustomer && currentOrg && (
        <CustomerLedgerModal
          isOpen={isLedgerModalOpen}
          onClose={() => {
            setIsLedgerModalOpen(false);
            setLedgerCustomer(null);
          }}
          customer={ledgerCustomer}
          currentOrg={currentOrg}
          sales={ledgerSales}
          paymentRecords={ledgerPaymentRecords}
          itemsMap={itemsMap}
        />
      )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={async () => {
          if (customerToDelete) {
            await handleDeleteCustomer(customerToDelete);
            setCustomerToDelete(null);
          }
        }}
        title="Delete Customer Profile?"
        message={`Are you sure you want to permanently delete customer "${customerToDelete?.name}"? All associated transaction histories under this customer will be affected. This action cannot be undone.`}
      />
    </div>
  );
}
