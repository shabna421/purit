import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  Download,
  FileText,
  HandCoins,
  Receipt,
  Search,
  Wallet,
  Pencil,
  Trash2,
  X,
  Loader2,
  BookOpen,
  Plus,
  MinusCircle,
  Clock,
  ShoppingCart,
  Coins,
  BarChart2,
  Eye,
  CreditCard,
  CircleDollarSign,
  AlertTriangle,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useTenancy, useAuth } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Customer, PaymentRecord, Sale, CustomerReturn, Item } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import {
  downloadExcelWorkbook,
  downloadTablePdf,
  printHtml,
} from '../utils/reporting';
import { CustomerLedgerModal } from '../components/CustomerLedgerModal';
import { PremiumDateRangePicker } from '../components/PremiumDateRangePicker';
import { DispenserRecord, DEFAULT_DISPENSERS } from './DispensersPage';
import { useNotifications } from '../notifications';
import { motion, AnimatePresence } from 'motion/react';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';
type ActivityTypeFilter = 'all' | 'sales' | 'payments' | 'dues' | 'reductions';

export interface CustomerActivity {
  id: string;
  rawId: string;
  timestamp: number;
  type: 'sale' | 'payment_received' | 'balance_added' | 'write_off' | 'return_refund';
  badgeLabel: string;
  badgeClass: string;
  amount: number;
  tone: 'increase' | 'decrease'; // increase = customer debt increases (red), decrease = customer debt decreases (green)
  displaySign: '+' | '-' | '';
  amountClass: string;
  note: string;
  reference: string;
  paymentMethod?: PaymentRecord['paymentMethod'];
  balanceAfter: number | null;
  isManualEntry: boolean;
  rawPayment?: PaymentRecord;
  rawSale?: Sale;
  itemsSummary?: string;
  paidAmount?: number;
  dueAmount?: number;
  searchText: string;
}

function formatReference(referenceId?: string) {
  if (!referenceId) return '-';
  return `#${referenceId.slice(-6).toUpperCase()}`;
}

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { refreshData } = useRealtimeData();
  const { success, error: notifyError } = useNotifications();

  // Core Data States
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, string>>(new Map());
  const [productCatalogMap, setProductCatalogMap] = useState<Map<string, Item>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityTypeFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Modals
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Entry Creation Modal (Collect Payment / Add Due / Reduce Balance)
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionModalType, setActionModalType] = useState<'collect-payment' | 'add-due' | 'write-off'>('collect-payment');
  const [actionAmount, setActionAmount] = useState<number | ''>('');
  const [actionMethod, setActionMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [actionDate, setActionDate] = useState<string>('');
  const [actionNotes, setActionNotes] = useState<string>('');

  // Edit Modal State
  const [editingTx, setEditingTx] = useState<PaymentRecord | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMethod, setEditMethod] = useState<PaymentRecord['paymentMethod']>('cash');
  const [editDate, setEditDate] = useState<string>('');
  const [editDirection, setEditDirection] = useState<PaymentRecord['direction']>('payment_received');

  // Delete Confirm Modal State
  const [deletingTx, setDeletingTx] = useState<PaymentRecord | null>(null);

  // Dispensers Data (for dispenser cost and net profit calculations)
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

  const [dispensers, setDispensers] = useState<Record<string, { td: number; fhb: number }>>(() => {
    try {
      const saved = localStorage.getItem('purit_customer_dispensers');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Listen to dispenser storage updates
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

  // Load All Customer Data
  const loadData = useCallback(async () => {
    if (!currentOrg || !id) return;
    try {
      const [customerData, salesData, paymentsData, returnsData, itemsData] = await Promise.all([
        saleService.getCustomer(currentOrg.id, id),
        saleService.getSales(currentOrg.id),
        saleService.getCustomerPaymentRecords(currentOrg.id, id),
        saleService.getCustomerReturns(currentOrg.id, id),
        inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
      ]);

      setCustomer(customerData);
      setSales(salesData.filter((entry) => entry.customerId === id));
      setPaymentRecords(paymentsData);
      setReturns(returnsData);
      setItemsMap(new Map(itemsData.map((i) => [i.id, i.name])));
      setProductCatalogMap(new Map(itemsData.map((i) => [i.id, i])));
    } catch (error) {
      console.error('Error loading customer details:', error);
      notifyError('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  }, [currentOrg, id, notifyError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time listener for customer, payment, and sale changes
  useEffect(() => {
    const handleDataChanged = (e: any) => {
      const table = e?.detail?.table;
      if (!table || table === 'customers' || table === 'payments' || table === 'sales') {
        loadData();
      }
    };
    window.addEventListener('purit_data_changed', handleDataChanged);
    return () => window.removeEventListener('purit_data_changed', handleDataChanged);
  }, [loadData]);

  // -------------------------------------------------------------
  // Summary Calculations (Live & Real-Time)
  // -------------------------------------------------------------
  const summaryMetrics = useMemo(() => {
    if (!customer) {
      return {
        totalSales: 0,
        collected: 0,
        due: 0,
        profit: 0,
        dispenserCost: 0,
        netProfit: 0,
      };
    }

    const activeSales = sales.filter((s) => s.status !== 'cancelled');
    const realTotalSales = activeSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const upfrontCollected = activeSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0);
    const manualCollected = paymentRecords
      .filter((p) => p.direction === 'payment_received')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const dueVal = customer.balance || 0;
    const totalSalesVal = realTotalSales;
    const collectedVal = Math.max(upfrontCollected + manualCollected, Math.max(0, totalSalesVal - dueVal));

    // Calculate customer dispenser costs
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

    const custTdRecord = custDispensers.find((d) => {
      const n = d.itemName.toLowerCase();
      return n.includes('td') || n.includes('tissue');
    });
    const custFhbRecord = custDispensers.find((d) => {
      const n = d.itemName.toLowerCase();
      return n.includes('fhb') || n.includes('foam');
    });

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
    const isKattan =
      customer.name?.toLowerCase().includes('kattan') ||
      customer.shopName?.toLowerCase().includes('kattan');
    const savedDispensers = dispensers[customer.id];

    const tdCount =
      savedDispensers?.td !== undefined
        ? savedDispensers.td
        : custTdRecord?.quantity ?? (isKattan ? 3 : 0);

    const fhbCount =
      savedDispensers?.fhb !== undefined
        ? savedDispensers.fhb
        : custFhbRecord?.quantity ?? (isKattan ? 2 : 0);

    const otherDispensersCost = custDispensers
      .filter((d) => d.id !== custTdRecord?.id && d.id !== custFhbRecord?.id)
      .reduce((sum, d) => sum + (d.totalAmount ?? (d.quantity || 0) * (d.unitPrice || 0)), 0);

    const tdCost =
      custTdRecord && custTdRecord.quantity === tdCount
        ? custTdRecord.totalAmount
        : tdCount * tdUnitPrice;

    const fhbCost =
      custFhbRecord && custFhbRecord.quantity === fhbCount
        ? custFhbRecord.totalAmount
        : fhbCount * fhbUnitPrice;

    const dispenserCostVal = tdCost + fhbCost + otherDispensersCost;

    let profitVal = 0;
    activeSales.forEach((s) => {
      (s.items || []).forEach((line) => {
        const product = productCatalogMap.get(line.itemId);
        const cost = (product?.basePrice ?? 0) * (line.quantity || 0);
        const rev = (line.unitPrice ?? 0) * (line.quantity || 0);
        profitVal += rev - cost;
      });
    });

    const netProfitVal = profitVal - dispenserCostVal;

    return {
      totalSales: totalSalesVal,
      collected: collectedVal,
      due: dueVal,
      profit: profitVal,
      dispenserCost: dispenserCostVal,
      netProfit: netProfitVal,
    };
  }, [customer, sales, paymentRecords, dispenserRecords, dispensers, productCatalogMap]);

  // -------------------------------------------------------------
  // Chronological Activity Feed Construction
  // -------------------------------------------------------------
  const allActivities = useMemo(() => {
    const activities: CustomerActivity[] = [];

    // 1. Sales / Invoices
    sales.forEach((sale) => {
      if (sale.status === 'cancelled') return;

      const itemsSummary = (sale.items || [])
        .map((line) => {
          const rawName = itemsMap.get(line.itemId) || 'Product';
          const cleanName = rawName.replace(/\\/g, '').trim();
          return `${line.quantity}x ${cleanName}`;
        })
        .join(', ');

      const invoiceRef =
        sale.isGstBill && sale.gstBillNumber
          ? sale.gstBillNumber
          : sale.invoiceNumber
            ? `INV-${sale.invoiceNumber}`
            : `#${sale.id.slice(-6).toUpperCase()}`;

      const dueAmount = Math.max(0, sale.totalAmount - (sale.paidAmount || 0));
      const isPaidInFull = dueAmount === 0;

      activities.push({
        id: `sale-${sale.id}`,
        rawId: sale.id,
        timestamp: sale.timestamp,
        type: 'sale',
        badgeLabel: isPaidInFull ? 'Purchase (Paid)' : 'Purchase / Due Added',
        badgeClass: isPaidInFull ? 'bg-blue-50 text-blue-700 border-blue-200/80' : 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
        amount: sale.totalAmount,
        tone: isPaidInFull ? 'decrease' : 'increase',
        displaySign: isPaidInFull ? '' : '+',
        amountClass: isPaidInFull ? 'text-zinc-700' : 'text-rose-600',
        note: sale.notes?.trim() || itemsSummary || 'Purchase / Product Invoice',
        reference: invoiceRef,
        paymentMethod: sale.paymentType === 'cash' ? 'cash' : 'bank',
        balanceAfter: null,
        isManualEntry: false,
        rawSale: sale,
        itemsSummary,
        paidAmount: sale.paidAmount || 0,
        dueAmount,
        searchText: `purchase sale invoice ${invoiceRef} ${itemsSummary} ${sale.notes || ''} ${sale.paymentType}`.toLowerCase(),
      });
    });

    // 2. Payment Records (Manual Collections, Dues, Reductions)
    paymentRecords.forEach((record) => {
      // Avoid duplicate sale shadow records
      if (record.direction === 'sale_due_added' || record.direction === 'sale_due_updated') {
        const saleExists = sales.some((s) => s.id === record.referenceId);
        if (saleExists) return;
      }

      let type: CustomerActivity['type'] = 'payment_received';
      let badgeLabel = 'Collect Payment';
      let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      let tone: CustomerActivity['tone'] = 'decrease';
      let displaySign: '+' | '-' = '+';
      let amountClass = 'text-emerald-600';
      let isManualEntry = true;

      switch (record.direction) {
        case 'payment_received':
          type = 'payment_received';
          badgeLabel = 'Collect Payment';
          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
          tone = 'decrease';
          displaySign = '+';
          amountClass = 'text-emerald-600';
          isManualEntry = true;
          break;
        case 'balance_added':
          type = 'balance_added';
          badgeLabel = 'Add Due';
          badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80';
          tone = 'increase';
          displaySign = '-';
          amountClass = 'text-rose-600';
          isManualEntry = true;
          break;
        case 'write_off':
          type = 'write_off';
          badgeLabel = 'Reduce Balance';
          badgeClass = 'bg-purple-50 text-purple-700 border-purple-200/80';
          tone = 'decrease';
          displaySign = '+';
          amountClass = 'text-emerald-600';
          isManualEntry = true;
          break;
        case 'return_refund':
          type = 'return_refund';
          badgeLabel = 'Return / Refund';
          badgeClass = 'bg-teal-50 text-teal-700 border-teal-200/80';
          tone = 'decrease';
          displaySign = '+';
          amountClass = 'text-emerald-600';
          isManualEntry = false;
          break;
        default:
          type = 'balance_added';
          badgeLabel = 'Balance Adjustment';
          badgeClass = 'bg-zinc-100 text-zinc-700 border-zinc-200';
          tone = 'increase';
          displaySign = '-';
          amountClass = 'text-zinc-700';
          isManualEntry = true;
          break;
      }

      const refLabel = record.referenceId
        ? formatReference(record.referenceId)
        : `#${record.id.slice(-6).toUpperCase()}`;

      activities.push({
        id: `payment-${record.id}`,
        rawId: record.id,
        timestamp: record.timestamp,
        type,
        badgeLabel,
        badgeClass,
        amount: record.amount,
        tone,
        displaySign,
        amountClass,
        note: record.notes?.trim() || `${badgeLabel} record`,
        reference: refLabel,
        paymentMethod: record.paymentMethod,
        balanceAfter: record.balanceAfter ?? null,
        isManualEntry,
        rawPayment: record,
        searchText: `${badgeLabel} ${refLabel} ${record.notes || ''} ${record.paymentMethod || ''}`.toLowerCase(),
      });
    });

    // 3. Customer Returns (if not already represented in payments)
    const existingReturnRefs = new Set(
      paymentRecords
        .filter((r) => r.direction === 'return_refund' && r.referenceId)
        .map((r) => r.referenceId as string)
    );

    returns.forEach((ret) => {
      if (existingReturnRefs.has(ret.id)) return;

      activities.push({
        id: `return-${ret.id}`,
        rawId: ret.id,
        timestamp: ret.timestamp,
        type: 'return_refund',
        badgeLabel: 'Return / Refund',
        badgeClass: 'bg-teal-50 text-teal-700 border-teal-200/80',
        amount: ret.totalAmount,
        tone: 'decrease',
        displaySign: '+',
        amountClass: 'text-emerald-600',
        note: ret.reason || 'Customer return',
        reference: `#RET-${ret.id.slice(-6).toUpperCase()}`,
        balanceAfter: null,
        isManualEntry: false,
        searchText: `return refund ${ret.reason || ''} ${ret.id}`.toLowerCase(),
      });
    });

    // Chronological reconstruction of running balance
    const chronoSorted = [...activities].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    let runningBalance = 0;
    const resolvedActivities = chronoSorted.map((act) => {
      if (act.type === 'sale') {
        const netDue = act.dueAmount ?? Math.max(0, act.amount - (act.paidAmount || 0));
        runningBalance += netDue;
      } else if (act.type === 'balance_added') {
        runningBalance += act.amount;
      } else if (act.type === 'payment_received' || act.type === 'write_off' || act.type === 'return_refund') {
        runningBalance -= act.amount;
      } else {
        if (act.tone === 'increase') {
          runningBalance += act.amount;
        } else {
          runningBalance -= act.amount;
        }
      }
      runningBalance = Math.max(0, runningBalance);

      return {
        ...act,
        balanceAfter: act.balanceAfter ?? runningBalance,
      };
    });

    // Sort descending by timestamp (latest first)
    return resolvedActivities.sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
  }, [sales, paymentRecords, returns, itemsMap]);

  // -------------------------------------------------------------
  // Filtered Activities
  // -------------------------------------------------------------
  const filteredActivities = useMemo(() => {
    let list = [...allActivities];
    const now = new Date();

    // 1. Date Filter
    if (dateFilter !== 'all') {
      let start = startOfDay(now);
      let end = endOfDay(now);

      if (dateFilter === 'week') {
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
      } else if (dateFilter === 'month') {
        start = startOfMonth(now);
        end = endOfMonth(now);
      } else if (dateFilter === 'custom' && customFrom && customTo) {
        start = startOfDay(parseISO(customFrom));
        end = endOfDay(parseISO(customTo));
      }

      list = list.filter((item) =>
        isWithinInterval(new Date(item.timestamp), { start, end })
      );
    }

    // 2. Activity Type Filter
    if (activityTypeFilter !== 'all') {
      if (activityTypeFilter === 'sales') {
        list = list.filter((item) => item.type === 'sale');
      } else if (activityTypeFilter === 'payments') {
        list = list.filter((item) => item.type === 'payment_received');
      } else if (activityTypeFilter === 'dues') {
        list = list.filter((item) => item.type === 'balance_added');
      } else if (activityTypeFilter === 'reductions') {
        list = list.filter((item) => item.type === 'write_off');
      }
    }

    // 3. Search Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((item) => item.searchText.includes(q));
    }

    return list;
  }, [allActivities, dateFilter, customFrom, customTo, activityTypeFilter, searchTerm]);

  // -------------------------------------------------------------
  // Action Modal Handlers (Collect Payment / Add Due / Reduce Balance)
  // -------------------------------------------------------------
  const openActionModal = (action: 'collect-payment' | 'add-due' | 'write-off') => {
    if (!customer) return;
    setActionModalType(action);
    // Pre-fill amount for collect payment or write-off if due balance exists
    if (action === 'collect-payment' && customer.balance > 0) {
      setActionAmount(customer.balance);
    } else {
      setActionAmount('');
    }
    setActionMethod('cash');
    setActionNotes('');
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setActionDate(nowLocal);
    setIsActionModalOpen(true);
  };

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !customer) return;

    const numAmount = typeof actionAmount === 'number' ? actionAmount : 0;
    if (numAmount <= 0) {
      notifyError('Please enter a valid amount greater than zero');
      return;
    }

    if (actionModalType === 'write-off' && numAmount > (customer.balance || 0)) {
      notifyError('Reduce balance amount cannot exceed current customer balance');
      return;
    }

    setIsSubmitting(true);
    const parsedTimestamp = actionDate ? new Date(actionDate).getTime() : Date.now();
    const tempPaymentId = `temp-${Date.now()}`;
    const prevCustomerBalance = customer.balance || 0;

    // Optimistic balance delta calculation
    let optimisticDelta = 0;
    let optimisticDirection: PaymentRecord['direction'] = 'payment_received';
    if (actionModalType === 'add-due') {
      optimisticDelta = numAmount;
      optimisticDirection = 'balance_added';
    } else if (actionModalType === 'write-off') {
      optimisticDelta = -numAmount;
      optimisticDirection = 'write_off';
    } else {
      optimisticDelta = -numAmount;
      optimisticDirection = 'payment_received';
    }

    const optimisticBalance = Math.max(0, prevCustomerBalance + optimisticDelta);

    // Optimistic state update
    const optimisticRecord: PaymentRecord = {
      id: tempPaymentId,
      orgId: currentOrg.id,
      entityType: 'customer',
      entityId: customer.id,
      amount: numAmount,
      direction: optimisticDirection,
      balanceAfter: optimisticBalance,
      paymentMethod: actionMethod,
      timestamp: parsedTimestamp,
      userId: user.uid,
      notes: actionNotes.trim(),
    };

    setCustomer((prev) => (prev ? { ...prev, balance: optimisticBalance } : null));
    setPaymentRecords((prev) => [optimisticRecord, ...prev]);
    setIsActionModalOpen(false);

    try {
      await saleService.createCustomerBalanceTransaction(currentOrg.id, user.uid, {
        customerId: customer.id,
        amount: numAmount,
        action: actionModalType,
        paymentMethod: actionMethod,
        notes: actionNotes.trim(),
        timestamp: parsedTimestamp,
      });

      await loadData();
      await refreshData();

      success(
        actionModalType === 'add-due'
          ? 'Due balance added successfully'
          : actionModalType === 'write-off'
            ? 'Customer balance reduced successfully'
            : 'Payment collected successfully'
      );
    } catch (err: any) {
      console.error('Error saving customer balance action:', err);
      // Revert optimistic update on error
      setCustomer((prev) => (prev ? { ...prev, balance: prevCustomerBalance } : null));
      setPaymentRecords((prev) => prev.filter((p) => p.id !== tempPaymentId));
      notifyError(err.message || 'Failed to record balance transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Edit Handlers
  // -------------------------------------------------------------
  const handleOpenEditModal = (activity: CustomerActivity) => {
    if (!activity.rawPayment) {
      const payId = activity.rawId;
      const record = paymentRecords.find((p) => p.id === payId);
      if (!record) return;
      openEditModalWithRecord(record);
      return;
    }
    openEditModalWithRecord(activity.rawPayment);
  };

  const openEditModalWithRecord = (record: PaymentRecord) => {
    setEditingTx(record);
    setEditAmount(record.amount);
    setEditNotes(record.notes || '');
    setEditMethod(record.paymentMethod || 'cash');
    setEditDirection(record.direction || 'payment_received');

    const date = new Date(record.timestamp);
    const localIsoString = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditDate(localIsoString);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !editingTx) return;

    if (!editAmount || editAmount <= 0) {
      notifyError('Please enter a valid amount greater than zero');
      return;
    }

    setIsSubmitting(true);
    const parsedTimestamp = editDate ? new Date(editDate).getTime() : Date.now();
    const previousRecords = [...paymentRecords];

    // Optimistically update the record in state immediately
    setPaymentRecords((prev) =>
      prev.map((p) =>
        p.id === editingTx.id
          ? {
              ...p,
              amount: editAmount,
              notes: editNotes.trim(),
              timestamp: parsedTimestamp,
              paymentMethod: editMethod,
              direction: editDirection,
            }
          : p
      )
    );
    setEditingTx(null);

    try {
      await saleService.updateCustomerPaymentRecord(currentOrg.id, editingTx.id, {
        amount: editAmount,
        notes: editNotes.trim(),
        timestamp: parsedTimestamp,
        paymentMethod: editMethod,
        direction: editDirection,
      });

      await loadData();
      await refreshData();
      success('Transaction updated and totals recalculated successfully');
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      // Revert on error
      setPaymentRecords(previousRecords);
      notifyError(error.message || 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Delete Handlers
  // -------------------------------------------------------------
  const handleConfirmDelete = (activity: CustomerActivity) => {
    if (activity.rawPayment) {
      setDeletingTx(activity.rawPayment);
      return;
    }
    const record = paymentRecords.find((p) => p.id === activity.rawId);
    if (record) {
      setDeletingTx(record);
    }
  };

  const handleDelete = async () => {
    if (!currentOrg || !deletingTx) return;

    setIsSubmitting(true);
    const deletedId = deletingTx.id;
    const previousRecords = [...paymentRecords];

    // Optimistically remove from state immediately
    setPaymentRecords((prev) => prev.filter((p) => p.id !== deletedId));
    setDeletingTx(null);

    try {
      await saleService.deleteCustomerPaymentRecord(currentOrg.id, deletedId);
      await loadData();
      await refreshData();
      success('Transaction deleted and totals recalculated successfully');
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      // Revert on error
      setPaymentRecords(previousRecords);
      notifyError(error.message || 'Failed to delete transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Reporting & Exports
  // -------------------------------------------------------------
  const exportRows = filteredActivities.map((entry) => [
    format(entry.timestamp, 'dd MMM yyyy HH:mm'),
    entry.badgeLabel,
    entry.tone === 'increase' ? 'Due Added / Sale' : 'Collected / Reduced',
    entry.amount,
    entry.balanceAfter ?? 0,
    entry.note,
    entry.reference,
  ]);

  const handleExportExcel = () => {
    if (!customer) return;
    downloadExcelWorkbook(
      `customer-transactions-${customer.name.replace(/\s+/g, '-').toLowerCase()}.xls`,
      'Transaction History',
      ['Date & Time', 'Event Type', 'Direction', 'Amount', 'Balance After', 'Note / Remark', 'Reference'],
      exportRows
    );
  };

  const handleExportPdf = () => {
    if (!customer || !currentOrg) return;
    downloadTablePdf(
      `customer-transactions-${customer.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      'Customer Transaction History Feed',
      [
        `Customer: ${customer.name}`,
        `Current Outstanding Due: ${formatCurrency(customer.balance, currentOrg.settings.currency)}`,
        `Total Activities: ${filteredActivities.length}`,
      ],
      ['Date & Time', 'Event Type', 'Direction', 'Amount', 'Balance After', 'Note', 'Reference'],
      filteredActivities.map((entry) => [
        format(entry.timestamp, 'dd MMM yyyy HH:mm'),
        entry.badgeLabel,
        entry.tone === 'increase' ? 'Added' : 'Reduced',
        formatCurrency(entry.amount, currentOrg.settings.currency),
        formatCurrency(entry.balanceAfter || 0, currentOrg.settings.currency),
        entry.note,
        entry.reference,
      ])
    );
  };

  const handlePrint = () => {
    if (!customer || !currentOrg) return;
    const rows = filteredActivities
      .map(
        (entry) => `
          <tr>
            <td>${format(entry.timestamp, 'dd MMM yyyy HH:mm')}</td>
            <td>${entry.badgeLabel}</td>
            <td>${entry.tone === 'increase' ? 'Added' : 'Reduced'}</td>
            <td>${formatCurrency(entry.amount, currentOrg.settings.currency)}</td>
            <td>${formatCurrency(entry.balanceAfter || 0, currentOrg.settings.currency)}</td>
            <td>${entry.note}</td>
            <td>${entry.reference}</td>
          </tr>
        `
      )
      .join('');

    printHtml(
      `Transaction History - ${customer.name}`,
      `
        <h1>${customer.name} - Transaction History Feed</h1>
        <p>Outstanding Due: ${formatCurrency(customer.balance, currentOrg.settings.currency)}</p>
        <div class="summary">
          <div class="card"><strong>${filteredActivities.length}</strong><br />Activities</div>
          <div class="card"><strong>${formatCurrency(summaryMetrics.totalSales, currentOrg.settings.currency)}</strong><br />Total Sales</div>
          <div class="card"><strong>${formatCurrency(summaryMetrics.collected, currentOrg.settings.currency)}</strong><br />Collected</div>
          <div class="card"><strong>${formatCurrency(summaryMetrics.due, currentOrg.settings.currency)}</strong><br />Current Due</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Event Type</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Balance After</th>
              <th>Note</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
    );
  };

  // -------------------------------------------------------------
  // Render Loading & Not Found
  // -------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm font-medium text-zinc-500">Loading customer profile & transaction feed...</p>
      </div>
    );
  }

  if (!customer || !currentOrg) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center max-w-md mx-auto space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h3 className="text-lg font-bold text-zinc-900">Customer Not Found</h3>
        <p className="text-sm text-zinc-500">The customer profile you are looking for could not be located.</p>
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* ------------------------------------------------------------- */}
      {/* Header & Navigation */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="rounded-2xl border border-zinc-200/80 bg-white p-2.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-2xs"
            title="Back to Customers"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{customer.name}</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200/80">
                Customer Balance History / Ledger
              </span>
              {customer.gstin && (
                <span className="inline-flex items-center px-2.5 py-0.5 bg-orange-50 text-orange-700 text-xs font-mono font-semibold rounded-md border border-orange-200/60">
                  GSTIN: {customer.gstin}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-zinc-500">
              <span className="font-medium text-zinc-600">{customer.shopName || 'Customer Account'}</span>
              {customer.phone && (
                <>
                  <span className="text-zinc-300">•</span>
                  <span>{customer.phone}</span>
                </>
              )}
              {customer.route && (
                <>
                  <span className="text-zinc-300">•</span>
                  <span>Route: {customer.route}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Utility Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
          >
            <FileText className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Customer Summary Metric Totals Cards (Live Recalculation)     */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Due / Balance */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-xs hover:border-zinc-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Due / Balance</span>
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                summaryMetrics.due > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p
              className={`text-xl sm:text-2xl font-bold tracking-tight font-mono ${
                summaryMetrics.due > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {formatCurrency(summaryMetrics.due, currentOrg.settings.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {summaryMetrics.due > 0 ? 'Live outstanding credit' : 'All balance cleared'}
            </p>
          </div>
        </div>

        {/* 2. Total Sales */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-xs hover:border-zinc-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Sales</span>
            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 font-mono">
              {formatCurrency(summaryMetrics.totalSales, currentOrg.settings.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {sales.length} total invoice{sales.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* 3. Collected */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-xs hover:border-zinc-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Collected</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 font-mono">
              {formatCurrency(summaryMetrics.collected, currentOrg.settings.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Payments & collections received</p>
          </div>
        </div>

        {/* 4. Net Profit */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-xs hover:border-zinc-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Net Status</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  summaryMetrics.netProfit >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {summaryMetrics.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
              </span>
            </div>
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                summaryMetrics.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p
              className={`text-xl sm:text-2xl font-bold tracking-tight font-mono ${
                summaryMetrics.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatCurrency(summaryMetrics.netProfit, currentOrg.settings.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-400 truncate">
              Profit {formatCurrency(summaryMetrics.profit, currentOrg.settings.currency)}
              {summaryMetrics.dispenserCost > 0 &&
                ` • Disp -${formatCurrency(summaryMetrics.dispenserCost, currentOrg.settings.currency)}`}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Dedicated Customer Action Buttons Bar                         */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 sm:p-4 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Primary Action: Collect Payment */}
          <button
            type="button"
            onClick={() => openActionModal('collect-payment')}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-sm shadow-emerald-600/20 transition-all active:scale-[0.98]"
          >
            <HandCoins className="w-4 h-4 shrink-0" />
            <span>Collect Payment</span>
          </button>

          {/* Add Due */}
          <button
            type="button"
            onClick={() => openActionModal('add-due')}
            className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 text-amber-800 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98]"
          >
            <Wallet className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Add Due</span>
          </button>

          {/* Reduce Balance */}
          <button
            type="button"
            onClick={() => openActionModal('write-off')}
            disabled={customer.balance <= 0}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200 text-zinc-800 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            title={customer.balance <= 0 ? 'No outstanding balance to reduce' : 'Reduce customer balance'}
          >
            <MinusCircle className="w-4 h-4 shrink-0 text-zinc-600" />
            <span>Reduce Balance</span>
          </button>

          {/* Customer Ledger */}
          <button
            type="button"
            onClick={() => setIsLedgerModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200/80 text-purple-700 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98]"
          >
            <BookOpen className="w-4 h-4 shrink-0 text-purple-600" />
            <span>Customer Ledger</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Search & Filter Toolbar                                       */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice #, note, or transaction type..."
              className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50 py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>

          {/* Date Filter Quick Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'today', 'week', 'month', 'custom'] as DateFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setDateFilter(option);
                  if (option !== 'custom') {
                    setCustomFrom('');
                    setCustomTo('');
                  }
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  dateFilter === option
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                }`}
              >
                {option === 'all'
                  ? 'All Time'
                  : option === 'today'
                    ? 'Today'
                    : option === 'week'
                      ? 'This Week'
                      : option === 'month'
                        ? 'This Month'
                        : 'Custom Range'}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Type Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-100">
          {(
            [
              { key: 'all', label: 'All Activities', count: allActivities.length },
              {
                key: 'sales',
                label: 'Purchases (Invoices)',
                count: allActivities.filter((a) => a.type === 'sale').length,
              },
              {
                key: 'payments',
                label: 'Collect Payment',
                count: allActivities.filter((a) => a.type === 'payment_received').length,
              },
              {
                key: 'dues',
                label: 'Add Due',
                count: allActivities.filter((a) => a.type === 'balance_added').length,
              },
              {
                key: 'reductions',
                label: 'Reduce Balance',
                count: allActivities.filter((a) => a.type === 'write_off').length,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActivityTypeFilter(tab.key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all flex items-center gap-1.5 ${
                activityTypeFilter === tab.key
                  ? 'bg-orange-50 text-orange-700 font-semibold border border-orange-200/60'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activityTypeFilter === tab.key ? 'bg-orange-200/60 text-orange-800' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === 'custom' && (
          <div className="pt-2 border-t border-zinc-100">
            <PremiumDateRangePicker
              startDate={customFrom}
              endDate={customTo}
              onChange={(start, end) => {
                setCustomFrom(start);
                setCustomTo(end);
              }}
              placeholder="Select custom date interval"
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Chronological Transaction History Feed                        */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs overflow-hidden">
        {/* Feed Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 p-4 sm:p-5 gap-2 bg-zinc-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-zinc-900">Transaction History Feed</h3>
              <span className="rounded-full bg-zinc-200/70 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                {filteredActivities.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Chronological feed sorted latest first. Invoices, payment collections, dues, and reductions.
            </p>
          </div>
        </div>

        {/* Feed List */}
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Layers className="w-10 h-10 text-zinc-300 mx-auto" />
            <p className="text-sm font-semibold text-zinc-700">No transactions match your current filters</p>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Try adjusting your date range, search query, or activity type filter above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredActivities.map((entry) => (
              <div
                key={entry.id}
                className="p-4 sm:p-5 hover:bg-zinc-50/60 transition-colors group"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {/* Left: Icon, Event Badge, Details, Notes */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Event Icon */}
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                        entry.type === 'sale'
                          ? 'bg-blue-50 text-blue-600 border border-blue-100'
                          : entry.type === 'payment_received'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                            : entry.type === 'balance_added'
                              ? 'bg-amber-50 text-amber-600 border border-amber-100'
                              : entry.type === 'write_off'
                                ? 'bg-purple-50 text-purple-600 border border-purple-100'
                                : 'bg-teal-50 text-teal-600 border border-teal-100'
                      }`}
                    >
                      {entry.type === 'sale' && <ShoppingCart className="w-4 h-4" />}
                      {entry.type === 'payment_received' && <HandCoins className="w-4 h-4" />}
                      {entry.type === 'balance_added' && <Wallet className="w-4 h-4" />}
                      {entry.type === 'write_off' && <MinusCircle className="w-4 h-4" />}
                      {entry.type === 'return_refund' && <Receipt className="w-4 h-4" />}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Event Type Badge */}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${entry.badgeClass}`}
                        >
                          {entry.badgeLabel}
                        </span>

                        {/* Reference / Invoice # */}
                        <span className="text-xs font-mono font-medium text-zinc-500">
                          {entry.reference}
                        </span>

                        {/* Payment Mode Pill */}
                        {entry.paymentMethod && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 uppercase tracking-wider">
                            {entry.paymentMethod}
                          </span>
                        )}
                      </div>

                      {/* Description / Note */}
                      <p className="text-sm font-medium text-zinc-900 leading-snug break-words">
                        {entry.note}
                      </p>

                      {/* Items Summary (for sales) */}
                      {entry.itemsSummary && entry.type === 'sale' && (
                        <p className="text-xs text-zinc-500 truncate max-w-lg">
                          Items: {entry.itemsSummary}
                        </p>
                      )}

                      {/* Date & Time */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <CalendarRange className="h-3.5 w-3.5" />
                          {format(entry.timestamp, 'dd MMM yyyy, hh:mm a')}
                        </span>

                        {/* For sales, show paid and due breakdown if partial */}
                        {entry.type === 'sale' && entry.dueAmount !== undefined && entry.dueAmount > 0 && (
                          <span className="text-orange-600 font-medium">
                            Paid: {formatCurrency(entry.paidAmount || 0, currentOrg.settings.currency)} • Due: {formatCurrency(entry.dueAmount, currentOrg.settings.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount, Balance After, Edit/Delete Action Icons */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-50">
                    <div className="text-left sm:text-right">
                      {/* Amount with (+ / -) color coding */}
                      <p
                        className={`text-lg sm:text-xl font-bold font-mono tracking-tight ${entry.amountClass}`}
                      >
                        {entry.displaySign}
                        {formatCurrency(entry.amount, currentOrg.settings.currency)}
                      </p>
                      {entry.balanceAfter !== null && (
                        <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                          Balance after: {formatCurrency(entry.balanceAfter, currentOrg.settings.currency)}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons: Edit / Delete on manual entries, or View on Sales */}
                    <div className="flex items-center gap-1.5 border-l border-zinc-100 pl-3">
                      {entry.isManualEntry ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 hover:text-orange-600 hover:bg-orange-50 border border-zinc-200/60 hover:border-orange-200 transition-all shadow-2xs"
                            title="Edit transaction"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200/60 hover:border-rose-200 transition-all shadow-2xs"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </>
                      ) : entry.type === 'sale' && entry.rawSale ? (
                        <Link
                          to={`/sales/${entry.rawSale.id}/invoice`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 hover:text-blue-600 hover:bg-blue-50 border border-zinc-200/60 hover:border-blue-200 transition-all shadow-2xs"
                          title="View Invoice"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Invoice</span>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Modal 1: Create Manual Entry (Collect / Add Due / Reduce)     */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {isActionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsActionModalOpen(false)}
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
                  <h3 className="text-xl font-bold text-zinc-900">
                    {actionModalType === 'collect-payment'
                      ? 'Collect Payment'
                      : actionModalType === 'add-due'
                        ? 'Add Due Amount'
                        : 'Reduce Customer Balance'}
                  </h3>
                  <p className="text-sm text-zinc-500">Record a balance activity for {customer.name}</p>
                </div>
                <button
                  onClick={() => setIsActionModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveAction} className="space-y-4 p-6">
                {/* Outstanding Balance Banner */}
                <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 p-3.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Current Outstanding Due
                  </span>
                  <span
                    className={`text-lg font-bold font-mono ${
                      customer.balance > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(customer.balance, currentOrg.settings.currency)}
                  </span>
                </div>

                {/* Action Type Toggle */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Action Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setActionModalType('collect-payment')}
                      className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                        actionModalType === 'collect-payment'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-2xs'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      Collect
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionModalType('add-due')}
                      className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                        actionModalType === 'add-due'
                          ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-2xs'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      Add Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionModalType('write-off')}
                      disabled={customer.balance <= 0}
                      className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                        actionModalType === 'write-off'
                          ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-2xs'
                          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40'
                      }`}
                    >
                      Reduce
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">
                    Amount ({currentOrg.settings.currency})
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formatNumericInput(typeof actionAmount === 'number' ? actionAmount : undefined)}
                    onChange={(e) => setActionAmount(parseNumericInput(e.target.value) ?? '')}
                    placeholder="Enter amount..."
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-base font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono transition-all"
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'cheque'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setActionMethod(method)}
                        className={`rounded-xl border py-2 text-xs font-semibold uppercase tracking-wider transition-all ${
                          actionMethod === method
                            ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-2xs'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">
                    Description / Note
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="e.g. Received via GPay, adjustment note, cheque number..."
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 h-20 resize-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || typeof actionAmount !== 'number' || actionAmount <= 0}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* Modal 2: Edit Manual Transaction                              */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {editingTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTx(null)}
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
                  <h3 className="text-xl font-bold text-zinc-900">Edit Transaction</h3>
                  <p className="text-sm text-zinc-500">Update amount, date, payment mode, or note</p>
                </div>
                <button
                  onClick={() => setEditingTx(null)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 p-6">
                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">
                    Amount ({currentOrg.settings.currency})
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formatNumericInput(editAmount || undefined)}
                    onChange={(e) => setEditAmount(parseNumericInput(e.target.value) ?? 0)}
                    placeholder="Enter amount..."
                    className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-base font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono transition-all"
                  />
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Event Type</label>
                  <select
                    value={editDirection}
                    onChange={(e) => setEditDirection(e.target.value as any)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  >
                    <option value="payment_received">Collect Payment</option>
                    <option value="balance_added">Add Due</option>
                    <option value="write_off">Reduce Balance</option>
                  </select>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'cheque'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEditMethod(method)}
                        className={`rounded-xl border py-2 text-xs font-semibold uppercase tracking-wider transition-all ${
                          editMethod === method
                            ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-2xs'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Time */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1.5">
                    Description / Note
                  </label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || editAmount <= 0}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* Modal 3: Quick Confirm Delete Dialog                          */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {deletingTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingTx(null)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <Trash2 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-zinc-900">Delete this transaction?</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  This action will permanently delete this record and instantly recalculate {customer.name}&apos;s
                  balance, collected totals, and audit trail in real-time. This cannot be undone.
                </p>
              </div>

              {/* Transaction Mini Card Preview */}
              <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 p-3.5 space-y-1.5 text-xs text-zinc-600 font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Type:</span>
                  <span className="font-bold text-zinc-900">
                    {deletingTx.direction === 'payment_received'
                      ? 'Collect Payment'
                      : deletingTx.direction === 'write_off'
                        ? 'Reduce Balance'
                        : 'Add Due'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Amount:</span>
                  <span className="font-bold text-zinc-900">
                    {formatCurrency(deletingTx.amount, currentOrg.settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Date:</span>
                  <span>{format(deletingTx.timestamp, 'dd MMM yyyy, hh:mm a')}</span>
                </div>
                {deletingTx.notes && (
                  <div className="flex justify-between pt-1 border-t border-zinc-200/60">
                    <span className="text-zinc-400">Note:</span>
                    <span className="truncate max-w-[200px]">{deletingTx.notes}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingTx(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* Modal 4: Full Customer Ledger Modal                          */}
      {/* ------------------------------------------------------------- */}
      {isLedgerModalOpen && customer && currentOrg && (
        <CustomerLedgerModal
          isOpen={isLedgerModalOpen}
          onClose={() => setIsLedgerModalOpen(false)}
          customer={customer}
          currentOrg={currentOrg}
          sales={sales}
          paymentRecords={paymentRecords}
          itemsMap={itemsMap}
        />
      )}
    </div>
  );
}
