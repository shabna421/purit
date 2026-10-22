import React, { useEffect, useMemo, useState } from 'react';
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
  subMonths,
} from 'date-fns';
import { useTenancy } from '../contexts';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Customer, PaymentRecord, Sale, CustomerReturn } from '../types';
import { formatCurrency } from '../utils/currency';
import {
  downloadExcelWorkbook,
  downloadTablePdf,
  printHtml,
} from '../utils/reporting';
import { CustomerLedgerModal } from '../components/CustomerLedgerModal';
import { PremiumDateRangePicker } from '../components/PremiumDateRangePicker';

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

export default function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useTenancy();
  const { success, error: notifyError } = useNotifications();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Edit/Delete state variables
  const [editingTx, setEditingTx] = useState<PaymentRecord | null>(null);
  const [deletingTx, setDeletingTx] = useState<PaymentRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Customer Ledger Modal state
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [itemsMap, setItemsMap] = useState<Map<string, string>>(new Map());

  const openLedgerModal = () => {
    setIsLedgerModalOpen(true);
  };

  // Form states for editing
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMethod, setEditMethod] = useState<PaymentRecord['paymentMethod']>('cash');
  const [editDate, setEditDate] = useState<string>('');
  const [editDirection, setEditDirection] = useState<PaymentRecord['direction']>('payment_received');

  const loadData = async () => {
    if (!currentOrg || !id) return;
    setLoading(true);
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
    } catch (error) {
      console.error('Error loading customer details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrg, id]);

  const handleOpenEditModal = (entry: BalanceHistoryEntry) => {
    const paymentId = entry.id.replace('payment-', '');
    const record = paymentRecords.find(p => p.id === paymentId);
    if (!record) return;

    setEditingTx(record);
    setEditAmount(record.amount);
    setEditNotes(record.notes || '');
    setEditMethod(record.paymentMethod || 'cash');
    setEditDirection(record.direction || 'payment_received');
    
    // Format timestamp for datetime-local (YYYY-MM-DDTHH:mm)
    const date = new Date(record.timestamp);
    const localIsoString = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditDate(localIsoString);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !editingTx) return;

    setIsSubmitting(true);
    try {
      await saleService.updateCustomerPaymentRecord(currentOrg.id, editingTx.id, {
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
    const paymentId = entry.id.replace('payment-', '');
    const record = paymentRecords.find(p => p.id === paymentId);
    if (record) {
      setDeletingTx(record);
    }
  };

  const handleDelete = async () => {
    if (!currentOrg || !deletingTx) return;

    setIsSubmitting(true);
    try {
      await saleService.deleteCustomerPaymentRecord(currentOrg.id, deletingTx.id);
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

  const historyEntries = useMemo(() => {
    const paymentEntries: BalanceHistoryEntry[] = paymentRecords.map((record) => ({
      id: `payment-${record.id}`,
      timestamp: record.timestamp,
      type: labelForPaymentRecord(record),
      amount: record.amount,
      balanceAfter: record.balanceAfter ?? null,
      note: record.notes || '-',
      reference: formatReference(record.referenceId),
      tone: record.direction === 'payment_received' || record.direction === 'write_off' || record.direction === 'return_refund'
        ? 'decrease'
        : 'increase',
      searchText: `${labelForPaymentRecord(record)} ${record.notes || ''} ${record.referenceId || ''}`.toLowerCase(),
    }));

    const existingSaleRefs = new Set(
      paymentRecords
        .filter((record) => record.referenceId)
        .map((record) => record.referenceId as string)
    );

    const inferredSaleEntries: BalanceHistoryEntry[] = sales
      .filter((sale) => sale.totalAmount > sale.paidAmount && !existingSaleRefs.has(sale.id))
      .map((sale) => ({
        id: `sale-${sale.id}`,
        timestamp: sale.timestamp,
        type: 'Sale Created',
        amount: sale.totalAmount - sale.paidAmount,
        balanceAfter: null,
        note: sale.notes || 'Product sale',
        reference: formatReference(sale.id),
        tone: 'increase',
        searchText: `sale created ${sale.notes || ''} ${sale.id}`.toLowerCase(),
      }));

    const existingReturnRefs = new Set(
      paymentRecords
        .filter((record) => record.direction === 'return_refund' && record.referenceId)
        .map((record) => record.referenceId as string)
    );

    const inferredReturnEntries: BalanceHistoryEntry[] = returns
      .filter((entry) => !existingReturnRefs.has(entry.id))
      .map((entry) => ({
        id: `return-${entry.id}`,
        timestamp: entry.timestamp,
        type: 'Return / Refund',
        amount: entry.totalAmount,
        balanceAfter: null,
        note: entry.reason || 'Customer return',
        reference: formatReference(entry.id),
        tone: 'decrease',
        searchText: `return refund ${entry.reason || ''} ${entry.id}`.toLowerCase(),
      }));

    const merged = [...paymentEntries, ...inferredSaleEntries, ...inferredReturnEntries].sort(
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
  }, [paymentRecords, returns, sales]);

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

  const summary = useMemo(() => {
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
    if (!customer) return;
    downloadExcelWorkbook(
      `customer-balance-history-${customer.name.replace(/\s+/g, '-').toLowerCase()}.xls`,
      'Balance History',
      ['Date', 'Transaction Type', 'Direction', 'Amount', 'Balance After', 'Remark', 'Reference'],
      exportRows
    );
  };

  const handleExportPdf = () => {
    if (!customer || !currentOrg) return;
    downloadTablePdf(
      `customer-balance-history-${customer.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      'Customer Balance History',
      [
        `Customer: ${customer.name}`,
        `Current Balance: ${formatCurrency(customer.balance, currentOrg.settings.currency)}`,
        `Transactions: ${summary.count}`,
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
    if (!customer || !currentOrg) return;
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
      `Balance History - ${customer.name}`,
      `
        <h1>${customer.name} - Balance History</h1>
        <p>Current Balance: ${formatCurrency(customer.balance, currentOrg.settings.currency)}</p>
        <div class="summary">
          <div class="card"><strong>${summary.count}</strong><br />Transactions</div>
          <div class="card"><strong>${formatCurrency(summary.totalAdded, currentOrg.settings.currency)}</strong><br />Total Added</div>
          <div class="card"><strong>${formatCurrency(summary.totalReduced, currentOrg.settings.currency)}</strong><br />Total Reduced</div>
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
    return <div className="p-8 text-center text-zinc-500">Loading customer profile...</div>;
  }

  if (!customer || !currentOrg) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
        Customer not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/customers')}
            className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">{customer.name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span>{customer.shopName || 'Customer profile and balance audit trail'}</span>
              {customer.gstin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs font-mono font-semibold rounded">
                  GSTIN: {customer.gstin}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openLedgerModal}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-purple-600/20 hover:bg-purple-700 transition-all"
          >
            <BookOpen className="h-4 w-4" />
            Customer Ledger
          </button>
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Current Balance</p>
          <p className={`mt-2 text-3xl font-bold ${customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(customer.balance, currentOrg.settings.currency)}
          </p>
          <p className="mt-2 text-sm text-zinc-500">Live outstanding amount for this customer.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">History Entries</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900">{summary.count}</p>
          <p className="mt-2 text-sm text-zinc-500">Transactions in the current filter.</p>
        </div>
      </div>

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
          <div className="mt-4">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              Custom Date Range
            </label>
            <PremiumDateRangePicker
              startDate={customFrom}
              endDate={customTo}
              onChange={(start, end) => {
                setCustomFrom(start);
                setCustomTo(end);
              }}
              placeholder="Select Custom Date Range"
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 p-5">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Balance History</h3>
            <p className="text-sm text-zinc-500">Latest first, with transaction type, amount, balance after, remarks, and references.</p>
          </div>
          <div className="text-right text-sm text-zinc-500">
            <p>{summary.count} transactions</p>
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
                        {entry.tone === 'increase' ? '+' : '-'}{formatCurrency(entry.amount, currentOrg.settings.currency)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">Balance after: {formatCurrency(entry.balanceAfter || 0, currentOrg.settings.currency)}</p>
                    </div>
                    {entry.id.startsWith('payment-') && (
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

      <div className="flex justify-end">
        <Link to="/customers" className="text-sm font-medium text-orange-600 hover:text-orange-700">
          Back to customers
        </Link>
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
                  {['sale_due_added', 'sale_due_updated', 'return_refund'].includes(editingTx.direction) ? (
                    <input
                      disabled
                      type="text"
                      value={
                        editingTx.direction === 'sale_due_added' || editingTx.direction === 'sale_due_updated'
                          ? 'Sale Outstanding (System)'
                          : 'Return Refund (System)'
                      }
                      className="w-full px-4 py-2 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500 cursor-not-allowed"
                    />
                  ) : (
                    <select
                      value={editDirection}
                      onChange={(e) => setEditDirection(e.target.value as any)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="payment_received">Due Collected</option>
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
                This action will permanently remove the transaction record and recalculate the customer's outstanding balance. This cannot be undone.
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

        {/* Customer Ledger Modal */}
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

      </AnimatePresence>
    </div>
  );
}
