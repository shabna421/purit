import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Image as ImageIcon,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfWeek,
  endOfYear,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { useNotifications } from '../notifications';
import { ExpenseEntry, User } from '../types';
import { formatCurrency } from '../utils/currency';
import { downloadExcelWorkbook, downloadTablePdf, printHtml } from '../utils/reporting';
import { PremiumDateField } from '../components/PremiumDateField';
import { AppSelect } from '../components/AppSelect';
import { expenseService } from '../services/expenseService';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

const getFallbackName = (email?: string, defaultFallback: string = 'Unknown Staff') => {
  if (!email || email === 'No Email') return defaultFallback;
  const username = email.split('@')[0];
  if (!username) return defaultFallback;
  return username.charAt(0).toUpperCase() + username.slice(1);
};

const CATEGORIES: ExpenseEntry['category'][] = ['Petrol', 'Food', 'Workshop', 'Bank', 'Bank to Sister'];

const emptyForm = {
  amount: '',
  entryDate: format(new Date(), 'yyyy-MM-dd'),
  name: '',
  type: 'expense' as ExpenseEntry['type'],
  category: 'Petrol' as ExpenseEntry['category'],
  note: '',
  attachmentName: '',
  attachmentDataUrl: '',
};

export default function ExpenseTrackerPage() {
  const { currentOrg, membership } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const { expenses: entries, loading: realtimeLoading } = useRealtimeData();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | ExpenseEntry['type']>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ExpenseEntry['category']>('all');
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [form, setForm] = useState(emptyForm);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<ExpenseEntry | null>(null);
  const [userLookup, setUserLookup] = useState<Record<string, { displayName: string; email: string; role?: string }>>({});
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  const uniqueUserIdsString = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.userId).filter((id): id is string => Boolean(id)))).sort().join(',');
  }, [entries]);

  useEffect(() => {
    const loadProfiles = async () => {
      if (!currentOrg) return;
      if (entries.length === 0 && realtimeLoading) {
        return;
      }
      
      try {
        const membershipsQuery = query(collection(db, 'memberships'), where('orgId', '==', currentOrg.id));
        const membershipsSnap = await getDocs(membershipsQuery);
        const membershipsLookup: Record<string, string> = {};
        membershipsSnap.docs.forEach((doc) => {
          const data = doc.data();
          membershipsLookup[data.userId] = data.role || '';
        });

        const uniqueUserIds: string[] = Array.from(new Set(entries.map((e) => e.userId).filter((id): id is string => Boolean(id))));
        const lookup: Record<string, { displayName: string; email: string; role?: string }> = {};

        await Promise.all(
          uniqueUserIds.map(async (uid: string) => {
            const role = uid === currentOrg.ownerId ? 'owner' : (membershipsLookup[uid] || 'employee');
            try {
              if (user && uid === user.uid) {
                lookup[uid] = {
                  displayName: user.displayName || getFallbackName(user.email || '', 'Owner'),
                  email: user.email || 'No Email',
                  role: uid === currentOrg.ownerId ? 'owner' : (membership?.role || role),
                };
                return;
              }
              const userSnap = await getDoc(doc(db, 'users', uid));
              if (userSnap.exists()) {
                const userData = userSnap.data() as User;
                lookup[uid] = {
                  displayName: userData.displayName || getFallbackName(userData.email || '', 'Team Member'),
                  email: userData.email || 'No Email',
                  role,
                };
              } else {
                lookup[uid] = {
                  displayName: 'Unknown Staff',
                  email: 'No Email',
                  role,
                };
              }
            } catch (err) {
              console.error(`Failed to fetch profile for user ${uid}`, err);
              lookup[uid] = {
                displayName: 'Unknown Staff',
                email: 'No Email',
                role,
              };
            }
          })
        );
        setUserLookup(lookup);
      } catch (error) {
        console.error('Error loading profiles:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfiles();
  }, [currentOrg, uniqueUserIdsString, user, membership, realtimeLoading]);

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isExportMenuOpen]);

  const filteredEntries = useMemo(() => {
    let nextEntries = [...entries];
    if (selectedType !== 'all') {
      nextEntries = nextEntries.filter((entry) => entry.type === selectedType);
    }
    if (selectedCategory !== 'all') {
      nextEntries = nextEntries.filter((entry) => entry.category === selectedCategory);
    }
    if (selectedRange.start && selectedRange.end) {
      nextEntries = nextEntries.filter((entry) =>
        isWithinInterval(new Date(entry.entryDate), {
          start: startOfDay(new Date(selectedRange.start)),
          end: endOfDay(new Date(selectedRange.end)),
        })
      );
    }
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      nextEntries = nextEntries.filter((entry) =>
        `${entry.name} ${entry.category} ${entry.type} ${entry.note || ''}`.toLowerCase().includes(query)
      );
    }
    return nextEntries.sort((a, b) => b.entryDate - a.entryDate);
  }, [entries, searchTerm, selectedCategory, selectedRange.end, selectedRange.start, selectedType]);

  const summary = useMemo(() => {
    const monthStart = startOfMonth(new Date()).getTime();
    const monthEnd = endOfMonth(new Date()).getTime();

    const totalExpense = entries.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + entry.amount, 0);
    const totalInvestment = entries.filter((entry) => entry.type === 'investment').reduce((sum, entry) => sum + entry.amount, 0);
    const monthExpense = entries
      .filter((entry) => entry.type === 'expense' && isWithinInterval(new Date(entry.entryDate), { start: new Date(monthStart), end: new Date(monthEnd) }))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const monthInvestment = entries
      .filter((entry) => entry.type === 'investment' && isWithinInterval(new Date(entry.entryDate), { start: new Date(monthStart), end: new Date(monthEnd) }))
      .reduce((sum, entry) => sum + entry.amount, 0);
    const filteredTotal = filteredEntries.reduce((sum, entry) => sum + entry.amount, 0);

    return {
      totalExpense,
      totalInvestment,
      monthExpense,
      monthInvestment,
      filteredCount: filteredEntries.length,
      filteredTotal,
    };
  }, [entries, filteredEntries]);

  const resetForm = () => {
    setEditingEntry(null);
    setForm(emptyForm);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (entry: ExpenseEntry) => {
    setEditingEntry(entry);
    setForm({
      amount: String(entry.amount),
      entryDate: format(entry.entryDate, 'yyyy-MM-dd'),
      name: entry.name,
      type: entry.type,
      category: entry.category,
      note: entry.note || '',
      attachmentName: entry.attachmentName || '',
      attachmentDataUrl: entry.attachmentDataUrl || '',
    });
    setIsModalOpen(true);
  };

  const handleAttachmentChange = async (file?: File) => {
    if (!file) {
      setForm((prev) => ({ ...prev, attachmentName: '', attachmentDataUrl: '' }));
      return;
    }

    if (file.size > 850000) {
      notifyError('Attachment is too large. Please keep it under 850 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        attachmentName: file.name,
        attachmentDataUrl: typeof reader.result === 'string' ? reader.result : '',
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrg || !user) return;

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError('Enter a valid amount greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        amount,
        entryDate: new Date(form.entryDate).getTime(),
        name: form.name,
        type: form.type,
        category: form.category,
        note: form.note || undefined,
        attachmentName: form.attachmentName || undefined,
        attachmentDataUrl: form.attachmentDataUrl || undefined,
        userRole: user.uid === currentOrg.ownerId ? 'owner' : (membership?.role || 'employee'),
      };

      if (editingEntry) {
        await expenseService.updateEntry(currentOrg.id, editingEntry.id, payload);
      } else {
        await expenseService.createEntry(currentOrg.id, user.uid, payload);
        
        // Cache current user profile if not cached
        if (user && !userLookup[user.uid]) {
          setUserLookup((prev) => ({
            ...prev,
            [user.uid]: {
              displayName: user.displayName || getFallbackName(user.email || '', 'Owner'),
              email: user.email || 'No Email',
              role: user.uid === currentOrg.ownerId ? 'owner' : (membership?.role || 'owner'),
            },
          }));
        }
      }
      setIsModalOpen(false);
      resetForm();
      success(
        editingEntry
          ? `${form.type === 'expense' ? 'Expense' : 'Investment'} updated successfully.`
          : `${form.type === 'expense' ? 'Expense' : 'Investment'} saved successfully.`
      );
    } catch (error) {
      console.error(error);
      notifyError(editingEntry ? 'Failed to update entry.' : 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: ExpenseEntry) => {
    if (!currentOrg) return;

    setDeletingEntryId(entry.id);
    try {
      await expenseService.deleteEntry(currentOrg.id, entry.id);
      success('Entry deleted successfully.');
    } catch (error) {
      console.error(error);
      notifyError('Failed to delete entry.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  const exportRows = filteredEntries.map((entry) => [
    format(entry.entryDate, 'dd MMM yyyy'),
    entry.name,
    entry.category,
    entry.type,
    entry.amount,
    entry.note || '',
  ]);

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) {
      notifyError('No expense entries match the current filters.');
      setIsExportMenuOpen(false);
      return;
    }

    downloadExcelWorkbook(
      'expense-tracker-report.xls',
      'Expense Report',
      ['Date', 'Name / Reason', 'Category', 'Type', 'Amount', 'Remark'],
      exportRows
    );
    setIsExportMenuOpen(false);
  };

  const handleExportPdf = () => {
    if (!currentOrg) return;
    if (filteredEntries.length === 0) {
      notifyError('No expense entries match the current filters.');
      setIsExportMenuOpen(false);
      return;
    }

    const filterLabel = [
      selectedRange.start && selectedRange.end
        ? `${selectedRange.start} to ${selectedRange.end}`
        : 'All Dates',
      selectedCategory === 'all' ? 'All Categories' : selectedCategory,
      selectedType === 'all' ? 'All Types' : selectedType,
    ].join(' | ');

    downloadTablePdf(
      'expense-tracker-report.pdf',
      'Expense Tracker Report',
      [
        `Filters: ${filterLabel}`,
        `Transactions: ${summary.filteredCount}`,
        `Total Amount: ${formatCurrency(summary.filteredTotal, currentOrg.settings.currency)}`,
      ],
      ['Date', 'Name / Reason', 'Category', 'Type', 'Amount', 'Remark'],
      exportRows.map((row) => [
        row[0],
        row[1],
        row[2],
        row[3],
        formatCurrency(Number(row[4]), currentOrg.settings.currency),
        row[5],
      ])
    );
    setIsExportMenuOpen(false);
  };

  const handlePrint = () => {
    if (!currentOrg) return;
    if (filteredEntries.length === 0) {
      notifyError('No expense entries match the current filters.');
      setIsExportMenuOpen(false);
      return;
    }

    const rows = filteredEntries
      .map(
        (entry) => `
          <tr>
            <td>${format(entry.entryDate, 'dd MMM yyyy')}</td>
            <td>${entry.name}</td>
            <td>${entry.category}</td>
            <td>${entry.type}</td>
            <td>${formatCurrency(entry.amount, currentOrg.settings.currency)}</td>
            <td>${entry.note || '-'}</td>
          </tr>
        `
      )
      .join('');

    printHtml(
      'Expense Tracker Report',
      `
        <h1>Expense Tracker Report</h1>
        <p>Filters: ${selectedRange.start && selectedRange.end ? `${selectedRange.start} to ${selectedRange.end}` : 'All Dates'} | ${selectedCategory === 'all' ? 'All Categories' : selectedCategory} | ${selectedType === 'all' ? 'All Types' : selectedType}</p>
        <div class="summary">
          <div class="card"><strong>${summary.filteredCount}</strong><br />Transactions</div>
          <div class="card"><strong>${formatCurrency(summary.filteredTotal, currentOrg.settings.currency)}</strong><br />Total Amount</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Category</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
    );
    setIsExportMenuOpen(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading expense tracker...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Expense Tracker</h2>
          <p className="text-sm text-zinc-500">A separate ledger for expenses and investments that stays independent from inventory, sales, and customer balances.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-orange-100 hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
              aria-label="Open expense report actions"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            <AnimatePresence>
              {isExportMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -6 }}
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-60 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <FileText className="h-4 w-4 text-zinc-500" />
                    Print Expense Report
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <Download className="h-4 w-4 text-zinc-500" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <Download className="h-4 w-4 text-zinc-500" />
                    Export Excel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Total Expense" value={formatCurrency(summary.totalExpense, currentOrg?.settings.currency)} tone="red" icon={<TrendingDown className="h-4 w-4" />} />
        <SummaryCard label="Total Investment" value={formatCurrency(summary.totalInvestment, currentOrg?.settings.currency)} tone="green" icon={<TrendingUp className="h-4 w-4" />} />
        <SummaryCard label="This Month Expense" value={formatCurrency(summary.monthExpense, currentOrg?.settings.currency)} tone="red" icon={<CalendarRange className="h-4 w-4" />} />
        <SummaryCard label="This Month Investment" value={formatCurrency(summary.monthInvestment, currentOrg?.settings.currency)} tone="green" icon={<CalendarRange className="h-4 w-4" />} />
      </div>

      <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-400">Filters</p>
            <h3 className="mt-1 text-base font-bold text-zinc-900 sm:text-lg">Refine Expense Entries</h3>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <Filter className="h-4 w-4" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, category, type, or remark..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-2.5 pl-11 pr-4 text-sm text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
            <label className="block rounded-2xl border border-zinc-200 bg-zinc-50/80 p-2.5">
              <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400">Category</span>
              <AppSelect
                value={selectedCategory}
                onChange={(value) => setSelectedCategory(value as typeof selectedCategory)}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...CATEGORIES.map((category) => ({ value: category, label: category })),
                ]}
                buttonClassName="bg-white py-2.5 text-sm font-medium"
              />
            </label>

            <label className="block rounded-2xl border border-zinc-200 bg-zinc-50/80 p-2.5">
              <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400">Type</span>
              <AppSelect
                value={selectedType}
                onChange={(value) => setSelectedType(value as typeof selectedType)}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'expense', label: 'Expense' },
                  { value: 'investment', label: 'Investment' },
                ]}
                buttonClassName="bg-white py-2.5 text-sm font-medium"
              />
            </label>

            <label className="block rounded-2xl border border-zinc-200 bg-zinc-50/80 p-2.5">
              <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-400">Date Range</span>
              <CompactRangeField
                range={selectedRange}
                onChange={setSelectedRange}
                className="w-full"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-zinc-700">
            <Filter className="h-4 w-4 text-zinc-500" />
            {summary.filteredCount} Transactions
          </span>
          <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1.5 font-medium text-orange-700">
            Total Amount: {formatCurrency(summary.filteredTotal, currentOrg?.settings.currency)}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h3 className="text-lg font-bold text-zinc-900">Transactions</h3>
          <p className="text-sm text-zinc-500">Every expense and investment entry appears here instantly after saving.</p>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No entries match the current filters.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-zinc-900">{entry.name}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${entry.type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {entry.type}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                        {entry.category}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-500">
                      <span>{format(entry.entryDate, 'dd MMM yyyy')}</span>
                      {entry.note && <span>{entry.note}</span>}
                      {entry.attachmentName && <span className="inline-flex items-center gap-1"><ImageIcon className="h-4 w-4" />{entry.attachmentName}</span>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 bg-zinc-100/80 border border-zinc-200/50 rounded-full px-2.5 py-1 text-zinc-600 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                        Added by <strong className="text-zinc-800 font-bold">{userLookup[entry.userId]?.displayName || 'Unknown Staff'}</strong>
                        {(() => {
                          const displayRole = entry.userId === currentOrg?.ownerId
                            ? 'owner'
                            : (entry.userRole || userLookup[entry.userId]?.role || 'employee');
                          return (
                            <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              displayRole === 'owner' ? 'bg-purple-100 text-purple-700' :
                              displayRole === 'admin' ? 'bg-blue-100 text-blue-700' :
                              displayRole === 'manager' ? 'bg-teal-100 text-teal-700' :
                              displayRole === 'sales' ? 'bg-orange-100 text-orange-700' :
                              'bg-zinc-200 text-zinc-700'
                            }`}>
                              {displayRole}
                            </span>
                          );
                        })()}
                      </span>
                      <span className="text-zinc-300">•</span>
                      <span className="text-zinc-500 font-mono">on {entry.createdAt ? format(entry.createdAt, 'dd MMM yyyy \'at\' h:mm a') : 'unknown time'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${entry.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(entry.amount, currentOrg?.settings.currency)}
                    </p>
                    {entry.attachmentDataUrl && (
                      <a href={entry.attachmentDataUrl} download={entry.attachmentName || `entry-${entry.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Download attachment
                      </a>
                    )}
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(entry)}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteEntry(entry)}
                        disabled={deletingEntryId === entry.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingEntryId === entry.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative my-3 flex w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-zinc-900/15 sm:my-6 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)]"
            >
              <div className="shrink-0 border-b border-orange-100 bg-gradient-to-br from-orange-50 via-white to-emerald-50 px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">
                      {editingEntry ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {editingEntry ? 'Edit Ledger Entry' : 'New Ledger Entry'}
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
                      {editingEntry ? 'Update Expense / Investment' : 'Add Expense / Investment'}
                    </h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                      {editingEntry
                        ? 'Adjust amount, category, note, or attachment without leaving the tracker.'
                        : 'A clean, separate financial entry that stays independent from inventory, sales, and customer balances.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Default Date</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">{format(new Date(form.entryDate), 'dd MMM yyyy')}</p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Entry Type</p>
                        <p className={`mt-1 text-sm font-semibold ${form.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
                          {form.type === 'expense' ? 'Expense' : 'Investment'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                    className="rounded-full border border-white/80 bg-white/90 p-2.5 text-zinc-400 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSave} className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Amount</span>
                    <div className="rounded-[1.35rem] border border-zinc-200 bg-zinc-50 px-4 py-4 shadow-inner shadow-white">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold text-orange-500">{currentOrg?.settings.currency === 'INR' ? '₹' : currentOrg?.settings.currency}</span>
                        <input
                          required
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={form.amount}
                          onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                          className="w-full bg-transparent text-2xl font-bold text-zinc-900 outline-none placeholder:text-zinc-300"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Date</span>
                    <PremiumDateField
                      value={form.entryDate}
                      onChange={(nextValue) => setForm((prev) => ({ ...prev, entryDate: nextValue || format(new Date(), 'yyyy-MM-dd') }))}
                      className="w-full"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Name / Reason</span>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-[1.35rem] border border-zinc-200 bg-zinc-50 px-4 py-4 text-base text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                    placeholder="Petrol, food, workshop advance, bank transfer..."
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-[1.6rem] border border-zinc-200 bg-zinc-50/80 p-4">
                    <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Type</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, type: 'expense' }))}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          form.type === 'expense'
                            ? 'border-red-200 bg-white text-red-600 shadow-sm'
                            : 'border-transparent bg-transparent text-zinc-500'
                        }`}
                      >
                        <TrendingDown className="mb-2 h-4 w-4" />
                        <p className="text-sm font-bold">Expense</p>
                        <p className="mt-1 text-xs text-zinc-400">Outgoing amount</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, type: 'investment' }))}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          form.type === 'investment'
                            ? 'border-emerald-200 bg-white text-emerald-600 shadow-sm'
                            : 'border-transparent bg-transparent text-zinc-500'
                        }`}
                      >
                        <TrendingUp className="mb-2 h-4 w-4" />
                        <p className="text-sm font-bold">Investment</p>
                        <p className="mt-1 text-xs text-zinc-400">Incoming capital</p>
                      </button>
                    </div>
                  </div>

                  <label className="block rounded-[1.6rem] border border-zinc-200 bg-zinc-50/80 p-4">
                    <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Category</span>
                    <AppSelect
                      value={form.category}
                      onChange={(value) => setForm((prev) => ({ ...prev, category: value as ExpenseEntry['category'] }))}
                      options={CATEGORIES.map((category) => ({ value: category, label: category }))}
                      buttonClassName="rounded-2xl bg-white py-4 text-base font-semibold"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Remark / Note</span>
                    <textarea
                      value={form.note}
                      onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                      className="h-36 w-full rounded-[1.35rem] border border-zinc-200 bg-zinc-50 px-4 py-4 text-base text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                      placeholder="Optional note, receipt reference, transfer details, or context for the team."
                    />
                  </label>

                  <div className="rounded-[1.6rem] border border-dashed border-zinc-300 bg-zinc-50/70 p-4">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">Attachment</span>
                    <label className="flex h-full min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-5 text-center transition-all hover:border-orange-300 hover:bg-orange-50/50">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-zinc-900">
                        {form.attachmentName ? 'Replace attachment' : 'Upload receipt or bill'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Image or PDF, up to 850 KB.
                      </p>
                      {form.attachmentName && (
                        <div className="mt-3 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                          {form.attachmentName}
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) => handleAttachmentChange(event.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                    className="rounded-2xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 disabled:opacity-50"
                  >
                    {saving ? (editingEntry ? 'Updating...' : 'Saving...') : (editingEntry ? 'Update Entry' : 'Save Entry')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!deleteEntry}
        onClose={() => setDeleteEntry(null)}
        onConfirm={async () => {
          if (deleteEntry) {
            await handleDeleteEntry(deleteEntry);
          }
        }}
        title="Delete Ledger Entry?"
        message={`Are you sure you want to permanently delete the ledger entry for "${deleteEntry?.name}" of amount ${deleteEntry ? formatCurrency(deleteEntry.amount, currentOrg?.settings.currency) : ''}? This action cannot be undone.`}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'red' | 'green';
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
        {icon}
      </div>
      <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function CompactRangeField({
  range,
  onChange,
  className = '',
}: {
  range: { start: string; end: string };
  onChange: (range: { start: string; end: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(startOfMonth(new Date()));
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [mobileSheetStyle, setMobileSheetStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    if (!open) {
      setMobileSheetStyle({});
      return;
    }

    if (typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }

    const updateViewportLayout = () => {
      const visualViewport = window.visualViewport;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
      const bottomOffset = keyboardInset + 88;
      const availableHeight = Math.max(320, viewportHeight - 36);

      setMobileSheetStyle({
        bottom: `${bottomOffset}px`,
        maxHeight: `${availableHeight}px`,
      });
    };

    updateViewportLayout();

    window.addEventListener('resize', updateViewportLayout);
    window.visualViewport?.addEventListener('resize', updateViewportLayout);
    window.visualViewport?.addEventListener('scroll', updateViewportLayout);

    return () => {
      window.removeEventListener('resize', updateViewportLayout);
      window.visualViewport?.removeEventListener('resize', updateViewportLayout);
      window.visualViewport?.removeEventListener('scroll', updateViewportLayout);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectedStart = range.start ? startOfDay(new Date(range.start)) : null;
  const selectedEnd = range.end ? endOfDay(new Date(range.end)) : null;
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const quickRanges = [
    {
      label: 'This Week',
      getRange: () => ({
        start: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      }),
    },
    {
      label: 'This Month',
      getRange: () => ({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      }),
    },
    {
      label: 'This Year',
      getRange: () => ({
        start: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        end: format(endOfYear(new Date()), 'yyyy-MM-dd'),
      }),
    },
  ];

  const handleSelectDate = (date: Date) => {
    const normalized = format(date, 'yyyy-MM-dd');

    if (!range.start || (range.start && range.end)) {
      onChange({ start: normalized, end: '' });
      return;
    }

    if (normalized < range.start) {
      onChange({ start: normalized, end: range.start });
      return;
    }

    onChange({ start: range.start, end: normalized });
  };

  const isInRange = (date: Date) =>
    selectedStart && selectedEnd
      ? isWithinInterval(date, { start: selectedStart, end: selectedEnd })
      : false;

  const displayValue = range.start && range.end
    ? `${format(new Date(range.start), 'dd MMM')} - ${format(new Date(range.end), 'dd MMM yyyy')}`
    : range.start
      ? `${format(new Date(range.start), 'dd MMM yyyy')} - End date`
      : 'Choose date range';

  const pickerContent = (
    <>
      <div className="border-b border-zinc-100 bg-gradient-to-br from-orange-50/80 via-white to-emerald-50/60 p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {quickRanges.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange(preset.getRange());
                setOpen(false);
              }}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-400">Date Range</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">{format(visibleMonth, 'MMMM yyyy')}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
              className="rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:text-zinc-900"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              className="rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:text-zinc-900"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-y-auto p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-mono uppercase tracking-wider text-zinc-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day} className="py-1">{day}</span>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const selected = (selectedStart && isSameDay(day, selectedStart)) || (selectedEnd && isSameDay(day, selectedEnd));
            const inRange = isInRange(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => handleSelectDate(day)}
                className={`h-9 rounded-xl text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-zinc-900 text-white shadow-md shadow-zinc-300'
                    : inRange
                      ? 'bg-orange-100 text-orange-700'
                      : isSameMonth(day, visibleMonth)
                        ? 'text-zinc-700 hover:bg-zinc-50'
                        : 'text-zinc-300'
                }`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2.5 supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <button
          type="button"
          onClick={() => {
            onChange({ start: '', end: '' });
            setOpen(false);
          }}
          className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-600"
        >
          Apply
        </button>
      </div>
    </>
  );

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left text-sm font-semibold text-zinc-800 outline-none transition-all hover:border-orange-300 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
      >
        <span className={`${range.start ? 'text-zinc-800' : 'text-zinc-400'} truncate`}>{displayValue}</span>
        <span className="flex items-center gap-2 text-zinc-400">
          <CalendarRange className="h-4 w-4" />
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40 hidden md:block" />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 hidden w-full max-w-[20rem] overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-white/95 shadow-xl shadow-zinc-200 backdrop-blur md:block"
            >
              {pickerContent}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-zinc-900/30 backdrop-blur-sm md:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-x-3 z-[60] overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl md:hidden"
              style={mobileSheetStyle}
            >
              <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-zinc-200" />
              {pickerContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
