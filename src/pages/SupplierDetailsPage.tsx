import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { useTenancy } from '../contexts';
import { purchaseService } from '../services/purchaseService';
import { inventoryService } from '../services/inventoryService';
import { Item, Purchase, Supplier, PaymentRecord } from '../types';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Landmark,
  MapPin,
  Phone,
  Receipt,
  Wallet,
  CalendarRange,
  Download,
  FileText,
  HandCoins,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { getItemDisplayName } from '../utils/items';
import { downloadExcelWorkbook, downloadTablePdf, printHtml } from '../utils/reporting';
import { useNotifications } from '../notifications';
import { motion, AnimatePresence } from 'motion/react';

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

type BalanceHistoryEntry = {
  id: string;
  timestamp: number;
  type: string;
  amount: number;
  balanceAfter: number | null;
  note: string;
  reference: string;
  tone: 'increase' | 'decrease';
  searchText: string;
};

function formatReference(referenceId?: string) {
  if (!referenceId) return '-';
  return `#${referenceId.slice(-6).toUpperCase()}`;
}

function labelForPaymentRecord(record: PaymentRecord) {
  switch (record.direction) {
    case 'payment_made':
      return 'Vendor Paid';
    case 'balance_added':
      return 'Manual Adjustment';
    case 'write_off':
      return 'Balance Reduction';
    case 'purchase_due_added':
      return 'Purchase Created';
    default:
      return 'Balance Change';
  }
}

export default function SupplierDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useTenancy();
  const { success, error: notifyError } = useNotifications();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Edit/Delete state variables
  const [editingTx, setEditingTx] = useState<PaymentRecord | null>(null);
  const [deletingTx, setDeletingTx] = useState<PaymentRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for editing
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMethod, setEditMethod] = useState<PaymentRecord['paymentMethod']>('cash');
  const [editDate, setEditDate] = useState<string>('');
  const [editDirection, setEditDirection] = useState<PaymentRecord['direction']>('payment_made');

  useEffect(() => {
    if (currentOrg && id) {
      loadData();
    }
  }, [currentOrg, id]);

  const loadData = async () => {
    if (!currentOrg || !id) return;
    setLoading(true);
    try {
      const [suppliers, purchasesData, itemsData, payments] = await Promise.all([
        purchaseService.getSuppliers(currentOrg.id),
        purchaseService.getPurchases(currentOrg.id),
        inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
        purchaseService.getSupplierPaymentRecords(currentOrg.id, id),
      ]);
      setSupplier(suppliers.find((entry) => entry.id === id) || null);
      setPurchases(purchasesData.filter((purchase) => purchase.supplierId === id));
      setItems(itemsData);
      setPaymentRecords(payments);
    } catch (error) {
      console.error('Error loading supplier details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (entry: BalanceHistoryEntry) => {
    if (entry.id.startsWith('payment-')) {
      const paymentId = entry.id.replace('payment-', '');
      const record = paymentRecords.find(p => p.id === paymentId);
      if (!record) return;

      setEditingTx(record);
      setEditAmount(record.amount);
      setEditNotes(record.notes || '');
      setEditMethod(record.paymentMethod || 'cash');
      setEditDirection(record.direction || 'payment_made');
      
      // Format timestamp for datetime-local (YYYY-MM-DDTHH:mm)
      const date = new Date(record.timestamp);
      const localIsoString = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditDate(localIsoString);
    } else if (entry.id.startsWith('purchase-')) {
      const purchaseId = entry.id.replace('purchase-', '');
      const purchase = purchases.find(p => p.id === purchaseId);
      if (!purchase) return;

      const mockRecord: PaymentRecord = {
        id: `mock-purchase-${purchase.id}`,
        orgId: currentOrg?.id || '',
        entityType: 'supplier',
        entityId: purchase.supplierId,
        amount: purchase.totalAmount - purchase.paidAmount,
        direction: 'purchase_due_added',
        paymentMethod: purchase.paymentType === 'cash' ? 'cash' : 'bank',
        timestamp: purchase.timestamp,
        notes: purchase.notes || 'Product purchase',
        referenceId: purchase.id,
        userId: purchase.userId
      };

      setEditingTx(mockRecord);
      setEditAmount(mockRecord.amount);
      setEditNotes(mockRecord.notes || '');
      setEditMethod(mockRecord.paymentMethod);
      setEditDirection(mockRecord.direction);

      const date = new Date(mockRecord.timestamp);
      const localIsoString = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditDate(localIsoString);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !editingTx) return;

    setIsSubmitting(true);
    try {
      await purchaseService.updateSupplierPaymentRecord(currentOrg.id, editingTx.id, {
        amount: editAmount,
        notes: editNotes.trim(),
        timestamp: new Date(editDate).getTime(),
        paymentMethod: editMethod,
        direction: editDirection,
      });
      success('Transaction updated successfully');
      setEditingTx(null);
      await loadData();
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = (entry: BalanceHistoryEntry) => {
    if (entry.id.startsWith('payment-')) {
      const paymentId = entry.id.replace('payment-', '');
      const record = paymentRecords.find(p => p.id === paymentId);
      if (record) {
        setDeletingTx(record);
      }
    } else if (entry.id.startsWith('purchase-')) {
      const purchaseId = entry.id.replace('purchase-', '');
      const purchase = purchases.find(p => p.id === purchaseId);
      if (purchase) {
        const mockRecord: PaymentRecord = {
          id: `mock-purchase-${purchase.id}`,
          orgId: currentOrg?.id || '',
          entityType: 'supplier',
          entityId: purchase.supplierId,
          amount: purchase.totalAmount - purchase.paidAmount,
          direction: 'purchase_due_added',
          paymentMethod: purchase.paymentType === 'cash' ? 'cash' : 'bank',
          timestamp: purchase.timestamp,
          notes: purchase.notes || 'Product purchase',
          referenceId: purchase.id,
          userId: purchase.userId
        };
        setDeletingTx(mockRecord);
      }
    }
  };

  const handleDelete = async () => {
    if (!currentOrg || !deletingTx) return;

    setIsSubmitting(true);
    try {
      await purchaseService.deleteSupplierPaymentRecord(currentOrg.id, deletingTx.id);
      success('Transaction deleted successfully');
      setDeletingTx(null);
      await loadData();
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to delete transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = useMemo(() => {
    const totalPurchases = purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
    const dueBalance = supplier?.balance || 0; // Use live supplier balance field
    const totalPaid = Math.max(0, totalPurchases - dueBalance);

    return {
      totalPurchases,
      totalPaid,
      dueBalance,
      purchaseCount: purchases.length,
    };
  }, [purchases, supplier]);

  const historyEntries = useMemo(() => {
    const paymentEntries: BalanceHistoryEntry[] = paymentRecords.map((record) => ({
      id: `payment-${record.id}`,
      timestamp: record.timestamp,
      type: labelForPaymentRecord(record),
      amount: record.amount,
      balanceAfter: record.balanceAfter ?? null,
      note: record.notes || '-',
      reference: formatReference(record.referenceId),
      tone: record.direction === 'payment_made' || record.direction === 'write_off'
        ? 'decrease'
        : 'increase',
      searchText: `${labelForPaymentRecord(record)} ${record.notes || ''} ${record.referenceId || ''}`.toLowerCase(),
    }));

    const existingPurchaseRefs = new Set(
      paymentRecords
        .filter((record) => record.referenceId)
        .map((record) => record.referenceId as string)
    );

    const inferredPurchaseEntries: BalanceHistoryEntry[] = purchases
      .filter((purchase) => purchase.totalAmount > purchase.paidAmount && !existingPurchaseRefs.has(purchase.id))
      .map((purchase) => ({
        id: `purchase-${purchase.id}`,
        timestamp: purchase.timestamp,
        type: 'Purchase Created',
        amount: purchase.totalAmount - purchase.paidAmount,
        balanceAfter: null,
        note: purchase.notes || 'Product purchase',
        reference: formatReference(purchase.id),
        tone: 'increase',
        searchText: `purchase created ${purchase.notes || ''} ${purchase.id}`.toLowerCase(),
      }));

    const merged = [...paymentEntries, ...inferredPurchaseEntries].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Fill missing balanceAfter values using chronological reconstruction.
    let runningBalance = 0;
    const resolved = merged.map((entry) => {
      if (entry.balanceAfter == null) {
        runningBalance += entry.tone === 'increase' ? entry.amount : -entry.amount;
        return { ...entry, balanceAfter: Math.max(runningBalance, 0) };
      }

      runningBalance = entry.balanceAfter;
      return entry;
    });

    return resolved.sort((a, b) => b.timestamp - a.timestamp);
  }, [paymentRecords, purchases]);

  const filteredEntries = useMemo(() => {
    let nextEntries = [...historyEntries];
    const now = new Date();

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

      nextEntries = nextEntries.filter((entry) =>
        isWithinInterval(new Date(entry.timestamp), { start, end })
      );
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      nextEntries = nextEntries.filter((entry) => entry.searchText.includes(query));
    }

    return nextEntries;
  }, [customFrom, customTo, dateFilter, historyEntries, searchTerm]);

  const filteredSummary = useMemo(() => {
    const totalAdded = filteredEntries
      .filter((entry) => entry.tone === 'increase')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const totalReduced = filteredEntries
      .filter((entry) => entry.tone === 'decrease')
      .reduce((sum, entry) => sum + entry.amount, 0);

    return {
      count: filteredEntries.length,
      totalAdded,
      totalReduced,
    };
  }, [filteredEntries]);

  const exportRows = filteredEntries.map((entry) => [
    format(entry.timestamp, 'dd MMM yyyy HH:mm'),
    entry.type,
    entry.tone === 'increase' ? 'Added' : 'Reduced',
    entry.amount,
    entry.balanceAfter ?? 0,
    entry.note,
    entry.reference,
  ]);

  const handleExportExcel = () => {
    if (!supplier) return;
    downloadExcelWorkbook(
      `supplier-balance-history-${supplier.name.replace(/\s+/g, '-').toLowerCase()}.xls`,
      'Balance History',
      ['Date', 'Transaction Type', 'Direction', 'Amount', 'Balance After', 'Remark', 'Reference'],
      exportRows
    );
  };

  const handleExportPdf = () => {
    if (!supplier || !currentOrg) return;
    downloadTablePdf(
      `supplier-balance-history-${supplier.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      'Supplier Balance History',
      [
        `Supplier: ${supplier.name}`,
        `Current Balance: ${formatCurrency(supplier.balance, currentOrg.settings.currency)}`,
        `Transactions: ${filteredSummary.count}`,
      ],
      ['Date', 'Type', 'Direction', 'Amount', 'Balance After', 'Remark', 'Reference'],
      filteredEntries.map((entry) => [
        format(entry.timestamp, 'dd MMM yyyy HH:mm'),
        entry.type,
        entry.tone === 'increase' ? 'Added' : 'Reduced',
        formatCurrency(entry.amount, currentOrg.settings.currency),
        formatCurrency(entry.balanceAfter || 0, currentOrg.settings.currency),
        entry.note,
        entry.reference,
      ])
    );
  };

  const handlePrint = () => {
    if (!supplier || !currentOrg) return;
    const rows = filteredEntries
      .map(
        (entry) => `
          <tr>
            <td>${format(entry.timestamp, 'dd MMM yyyy HH:mm')}</td>
            <td>${entry.type}</td>
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
      `Balance History - ${supplier.name}`,
      `
        <h1>${supplier.name} - Balance History</h1>
        <p>Current Balance: ${formatCurrency(supplier.balance, currentOrg.settings.currency)}</p>
        <div class="summary">
          <div class="card"><strong>${filteredSummary.count}</strong><br />Transactions</div>
          <div class="card"><strong>${formatCurrency(filteredSummary.totalAdded, currentOrg.settings.currency)}</strong><br />Total Added</div>
          <div class="card"><strong>${formatCurrency(filteredSummary.totalReduced, currentOrg.settings.currency)}</strong><br />Total Reduced</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Balance After</th>
              <th>Remark</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading supplier details...</div>;
  }

  if (!supplier) {
    return (
      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-zinc-500">Supplier not found.</p>
        <button
          type="button"
          onClick={() => navigate('/suppliers')}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-medium text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Suppliers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => navigate('/suppliers')}
            className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">{supplier.name}</h2>
            <p className="text-sm text-zinc-500">{supplier.companyName || 'Supplier profile and balance audit trail'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <FileText className="h-4 w-4" />
            Print
          </button>
          <button onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Download className="h-4 w-4" />
            Export Excel
          </button>
          <Link
            to="/purchases/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-medium text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600"
          >
            <Receipt className="h-4 w-4" />
            New Purchase
          </Link>
        </div>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Top Summary</h3>
            <p className="text-sm text-zinc-500">Core supplier information and payable overview.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.9fr]">
          <div className="space-y-3 rounded-2xl bg-zinc-50 p-4">
            <InfoRow icon={Building2} label="Supplier Name" value={supplier.name} />
            <InfoRow icon={Phone} label="Contact Number" value={supplier.phone || 'Not added'} />
            <InfoRow icon={MapPin} label="Address" value={supplier.address || 'Not added'} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard icon={Receipt} label="Total Purchases" value={formatCurrency(summary.totalPurchases, currentOrg?.settings.currency)} />
            <SummaryCard icon={Landmark} label="Total Paid" value={formatCurrency(summary.totalPaid, currentOrg?.settings.currency)} />
            <SummaryCard icon={Wallet} label="Total Due Balance" value={formatCurrency(summary.dueBalance, currentOrg?.settings.currency)} valueClassName={summary.dueBalance > 0 ? 'text-red-600' : 'text-green-600'} />
          </div>
        </div>
      </div>

      {/* Ledger Logs Filter */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by invoice number, remark, or transaction type..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month', 'custom'] as DateFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDateFilter(option)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${dateFilter === option ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-700'}`}
              >
                {option === 'week' ? 'This Week' : option === 'month' ? 'This Month' : option === 'today' ? 'Today' : 'Custom Date Range'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setDateFilter('all');
                setCustomFrom('');
                setCustomTo('');
              }}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${dateFilter === 'all' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
            >
              All
            </button>
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-600">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
              />
            </label>
            <label className="text-sm text-zinc-600">
              To
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
              />
            </label>
          </div>
        )}
      </div>

      {/* Balance History / Ledger section */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Balance History Ledger</h3>
            <p className="text-sm text-zinc-500">Latest first, with transaction type, amount, balance after, remarks, and references.</p>
          </div>
          <div className="text-right text-sm text-zinc-500">
            <p>{filteredSummary.count} transactions</p>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No balance history matches your current filters.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-2xl ${entry.tone === 'increase' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                      {entry.tone === 'increase' ? <Wallet className="h-4 w-4" /> : <HandCoins className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900">{format(entry.timestamp, 'dd MMM yyyy')} - {entry.type}</p>
                      <p className="mt-1 text-sm text-zinc-500">{entry.note}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{format(entry.timestamp, 'hh:mm a')}</span>
                        <span className="inline-flex items-center gap-1"><Receipt className="h-3.5 w-3.5" />{entry.reference}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${entry.tone === 'increase' ? 'text-orange-600' : 'text-green-600'}`}>
                        {entry.tone === 'increase' ? '+' : '-'}{formatCurrency(entry.amount, currentOrg?.settings.currency)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">Balance after: {formatCurrency(entry.balanceAfter || 0, currentOrg?.settings.currency)}</p>
                    </div>
                    {(entry.id.startsWith('payment-') || entry.id.startsWith('purchase-')) && (
                      <div className="flex items-center gap-1 border-l border-zinc-100 pl-3">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(entry)}
                          className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-50 hover:text-orange-600 transition-colors"
                          title="Edit transaction"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(entry)}
                          className="p-1.5 rounded-xl text-zinc-400 hover:bg-zinc-50 hover:text-red-600 transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detailed Purchase History */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-5">
          <h3 className="text-lg font-bold text-zinc-900">Detailed Purchase Invoice List</h3>
          <p className="text-sm text-zinc-500">Open any purchase to view item-wise quantities, unit prices, and totals.</p>
        </div>

        {purchases.length === 0 ? (
          <div className="px-6 py-12 text-center text-zinc-500">No purchase invoices found for this supplier yet.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {purchases.map((purchase) => {
              const due = Math.max(purchase.totalAmount - purchase.paidAmount, 0);
              const isExpanded = expandedPurchaseId === purchase.id;
              const status = due === 0
                ? 'Paid'
                : purchase.paidAmount > 0
                  ? 'Partially Paid'
                  : 'Unpaid';
              const statusClasses = status === 'Paid'
                ? 'bg-green-100 text-green-700'
                : status === 'Partially Paid'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700';

              return (
                <div key={purchase.id} className="p-5">
                  <button
                    type="button"
                    onClick={() => setExpandedPurchaseId(isExpanded ? null : purchase.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-base font-bold text-zinc-900">Purchase #{purchase.id.slice(-6).toUpperCase()}</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClasses}`}>
                          {status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <Metric label="Purchase Date" value={format(purchase.timestamp, 'MMM dd, yyyy')} />
                        <Metric label="Invoice Number" value={`#${purchase.id.slice(-6).toUpperCase()}`} />
                        <Metric label="Total Invoice" value={formatCurrency(purchase.totalAmount, currentOrg?.settings.currency)} />
                        <Metric label="Paid Amount" value={formatCurrency(purchase.paidAmount, currentOrg?.settings.currency)} valueClassName="text-green-600" />
                        <Metric label="Balance Amount" value={formatCurrency(due, currentOrg?.settings.currency)} valueClassName={due > 0 ? 'text-red-600' : 'text-green-600'} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-500">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-900">Item-wise Details</p>
                          <p className="text-xs text-zinc-500">Quantity purchased, unit cost, and line totals for this invoice.</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {purchase.items.map((line, index) => {
                          const item = items.find((entry) => entry.id === line.itemId);
                          return (
                            <div key={`${purchase.id}-${line.itemId}-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                                  <p className="text-xs text-zinc-500">
                                    {line.quantity} x {formatCurrency(line.unitCost, currentOrg?.settings.currency)}
                                  </p>
                                </div>
                                <p className="text-sm font-bold text-zinc-900">{formatCurrency(line.subtotal, currentOrg?.settings.currency)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3">
                        <Metric label="Total" value={formatCurrency(purchase.totalAmount, currentOrg?.settings.currency)} />
                        <Metric label="Paid" value={formatCurrency(purchase.paidAmount, currentOrg?.settings.currency)} valueClassName="text-green-600" />
                        <Metric label="Due" value={formatCurrency(due, currentOrg?.settings.currency)} valueClassName={due > 0 ? 'text-red-600' : 'text-green-600'} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                  <p className="text-sm text-zinc-500">Modify details of this balance entry</p>
                </div>
                <button onClick={() => setEditingTx(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4 p-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Amount</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Transaction Type</label>
                  {editingTx.direction === 'purchase_due_added' ? (
                    <input
                      disabled
                      type="text"
                      value="Purchase Outstanding (System)"
                      className="w-full px-4 py-2 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500 cursor-not-allowed"
                    />
                  ) : (
                    <select
                      value={editDirection}
                      onChange={(e) => setEditDirection(e.target.value as any)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="payment_made">Vendor Paid</option>
                      <option value="balance_added">Manual Adjustment</option>
                      <option value="write_off">Balance Reduction</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Payment Method</label>
                  <select
                    value={editMethod}
                    onChange={(e) => setEditMethod(e.target.value as any)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Date</label>
                  <input
                    required
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || editAmount <= 0}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

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
              <h3 className="text-xl font-bold text-zinc-900">Delete this transaction?</h3>
              <p className="text-sm text-zinc-500">
                This action will permanently remove the transaction and recalculate the supplier balance.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingTx(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Transaction
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-zinc-600">
      <Icon className="mt-0.5 h-4 w-4 text-zinc-400" />
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
        <p className="mt-1 text-sm text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  valueClassName = 'text-zinc-900',
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClassName = 'text-zinc-900',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}
