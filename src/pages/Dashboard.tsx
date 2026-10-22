import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTenancy } from '../contexts';
import { useAuth } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { inventoryService } from '../services/inventoryService';
import { saleService } from '../services/saleService';
import { purchaseService } from '../services/purchaseService';
import { salesTargetService } from '../services/salesTargetService';
import { Item, InventoryTransaction, Sale, Purchase, Customer, Supplier, SalesTarget } from '../types';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Users, 
  Truck,
  ChevronRight,
  Clock,
  Plus,
  ShoppingCart,
  CalendarRange,
  Sparkles,
  ChevronLeft,
  ChevronDown,
  Target,
  Edit3,
  Check,
  X,
  Flame,
  Award,
  Zap,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { formatCurrency } from '../utils/currency';
import { getItemDisplayName } from '../utils/items';

/* ─────────────────── Sales Target Dashboard Widget ──────────────────── */

function clampPct(achieved: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, (achieved / target) * 100));
}

function fmtCompact(n: number, currency = 'INR') {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n, currency);
}

function MiniRing({ pct, animKey }: { pct: number; animKey: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    setDisplayed(0);
    const t = setTimeout(() => setDisplayed(pct), 60);
    return () => clearTimeout(t);
  }, [animKey, pct]);

  const stroke =
    pct >= 100 ? '#22c55e' : pct >= 75 ? '#f97316' : pct >= 40 ? '#fb923c' : '#d4d4d8';

  return (
    <svg width={130} height={130} className="rotate-[-90deg]">
      <circle cx={65} cy={65} r={r} fill="none" stroke="#f4f4f5" strokeWidth={13} />
      <circle
        cx={65}
        cy={65}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray={`${(displayed / 100) * circ} ${circ}`}
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
      />
    </svg>
  );
}

function SalesTargetDashboardWidget({
  orgId,
  userId,
  ownerId,
  sales,
  currency,
}: {
  orgId: string;
  userId: string;
  ownerId: string;
  sales: Sale[];
  currency?: string;
}) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const cur = currency ?? 'INR';

  const [target, setTarget] = useState<SalesTarget | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTarget = useCallback(async () => {
    setLoadingTarget(true);
    try {
      const t = await salesTargetService.getTarget(orgId, userId, now.getFullYear(), now.getMonth());
      setTarget(t);
      setTargetInput(t ? String(t.targetAmount) : '');
    } finally {
      setLoadingTarget(false);
    }
  }, [orgId, userId]);

  useEffect(() => { fetchTarget(); }, [fetchTarget]);

  const monthSales = useMemo(
    () =>
      sales.filter(
        (s) =>
          s.userId === userId &&
          isWithinInterval(new Date(s.timestamp), { start: startOfDay(monthStart), end: monthEnd })
      ),
    [sales, userId, monthStart, monthEnd]
  );

  const achieved = useMemo(() => monthSales.reduce((sum, s) => sum + s.totalAmount, 0), [monthSales]);
  const targetAmount = target?.targetAmount ?? 0;
  const pct = clampPct(achieved, targetAmount);
  const remaining = Math.max(targetAmount - achieved, 0);

  const daysInMonth = getDaysInMonth(now);
  const daysPassed = now.getDate();
  const daysLeft = daysInMonth - daysPassed;
  const dailyAvg = daysPassed > 0 ? achieved / daysPassed : 0;
  const requiredDaily = daysLeft > 0 ? remaining / daysLeft : 0;

  // Daily bars
  const dailyData = useMemo(() => {
    const arr = Array(daysInMonth).fill(0);
    monthSales.forEach((s) => {
      const d = new Date(s.timestamp).getDate() - 1;
      if (d >= 0 && d < daysInMonth) arr[d] += s.totalAmount;
    });
    return arr;
  }, [monthSales, daysInMonth]);
  const maxDaily = Math.max(...dailyData, 1);

  const handleSave = async () => {
    const amount = parseFloat(targetInput.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    setSaving(true);
    try {
      const t = await salesTargetService.setTarget(orgId, userId, now.getFullYear(), now.getMonth(), amount);
      setTarget(t);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const animKey = `${now.getFullYear()}-${now.getMonth()}`;

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-200">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Monthly Target</p>
            <p className="text-sm font-black text-zinc-900">{format(now, 'MMMM yyyy')}</p>
          </div>
        </div>
        <Link
          to="/sales/target"
          className="text-[11px] font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-0.5"
        >
          Full view <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Main body */}
      <div className="p-5 flex flex-col sm:flex-row items-start gap-5">
        {/* Ring + numbers */}
        <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 130, height: 130 }}>
          {loadingTarget ? (
            <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <MiniRing pct={pct} animKey={animKey} />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-black text-zinc-900 leading-none tabular-nums">{Math.round(pct)}%</p>
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-mono mt-0.5">of target</p>
            <p className="text-xs font-bold text-zinc-700 mt-1">{fmtCompact(achieved, cur)}</p>
          </div>
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Status badge + target */}
          <div className="flex items-center gap-2 flex-wrap">
            {targetAmount === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 text-zinc-500 text-xs font-semibold">
                <Target className="w-3 h-3" /> No target set
              </span>
            ) : pct >= 100 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                <Award className="w-3 h-3" /> Target achieved! 🎉
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold">
                <Flame className="w-3 h-3" /> {fmtCompact(remaining, cur)} to go
              </span>
            )}
            {targetAmount > 0 && (
              <span className="text-xs text-zinc-400 font-mono">
                / {fmtCompact(targetAmount, cur)}
              </span>
            )}
          </div>

          {/* Daily mini-bar chart */}
          <div className="flex items-end gap-px h-12">
            {dailyData.map((val, idx) => {
              const isToday = idx === now.getDate() - 1;
              const isFuture = idx > now.getDate() - 1;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t transition-all ${
                    isFuture
                      ? 'bg-zinc-100'
                      : isToday
                      ? 'bg-orange-500'
                      : val > 0
                      ? 'bg-orange-200'
                      : 'bg-zinc-100'
                  }`}
                  style={{ height: `${Math.max((val / maxDaily) * 100, isFuture ? 4 : val > 0 ? 8 : 4)}%` }}
                />
              );
            })}
          </div>

          {/* Pace metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2">
              <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Daily avg</p>
              <p className="text-sm font-black text-zinc-900">{daysPassed > 0 ? fmtCompact(dailyAvg, cur) : '—'}</p>
            </div>
            <div className={`rounded-xl border px-3 py-2 ${
              targetAmount > 0 && daysLeft > 0 && requiredDaily > dailyAvg * 1.3
                ? 'bg-red-50 border-red-100'
                : 'bg-emerald-50 border-emerald-100'
            }`}>
              <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Need/day ({daysLeft}d)</p>
              <p className={`text-sm font-black ${
                targetAmount > 0 && daysLeft > 0 && requiredDaily > dailyAvg * 1.3
                  ? 'text-red-600'
                  : 'text-emerald-700'
              }`}>
                {targetAmount > 0 && daysLeft > 0 ? fmtCompact(requiredDaily, cur) : pct >= 100 ? '✓' : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Target setter footer */}
      <div className="border-t border-zinc-100 px-5 py-3">
        <AnimatePresence mode="wait">
          {!isEditing ? (
            <motion.button
              key="edit-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={() => { setTargetInput(targetAmount > 0 ? String(targetAmount) : ''); setIsEditing(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {targetAmount > 0 ? 'Edit target' : 'Set a target for this month'}
            </motion.button>
          ) : (
            <motion.div
              key="edit-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder="Target amount…"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-60 flex-shrink-0"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 text-zinc-400 hover:bg-zinc-50 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

type PeriodFilter = 'today' | '7d' | '30d';

export const Dashboard: React.FC = () => {
  const { currentOrg, membership } = useTenancy();
  const { user } = useAuth();

  const hasModulePermission = (modKey: string) => {
    if (!currentOrg) return false;
    if (user?.uid === currentOrg.ownerId || membership?.role === 'owner') return true;
    return Boolean(membership?.allowedModules?.[modKey]);
  };

  const { items, transactions, sales, purchases, customers, suppliers, loading } = useRealtimeData();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('7d');
  const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Cash & Credit Drawer States
  const [isCashCreditOpen, setIsCashCreditOpen] = useState(false);
  const [drawerFilter, setDrawerFilter] = useState<'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [drawerCustomRange, setDrawerCustomRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [drawerCalendarMonth, setDrawerCalendarMonth] = useState(startOfMonth(new Date()));
  const [isDrawerCalendarOpen, setIsDrawerCalendarOpen] = useState(false);

  const drawerInterval = useMemo(() => {
    const today = new Date();
    switch (drawerFilter) {
      case 'today':
        return { start: startOfDay(today), end: endOfDay(today) };
      case 'yesterday': {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      }
      case 'this_week':
        return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case 'this_month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'last_month': {
        const lastMonth = addMonths(today, -1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case 'custom':
      default:
        return {
          start: drawerCustomRange.start ? startOfDay(drawerCustomRange.start) : startOfMonth(today),
          end: drawerCustomRange.end ? endOfDay(drawerCustomRange.end) : endOfDay(today),
        };
    }
  }, [drawerFilter, drawerCustomRange]);

  const drawerSales = useMemo(() => {
    return sales.filter((s) => isWithinInterval(new Date(s.timestamp), drawerInterval));
  }, [sales, drawerInterval]);

  const drawerPurchases = useMemo(() => {
    return purchases.filter((p) => isWithinInterval(new Date(p.timestamp), drawerInterval));
  }, [purchases, drawerInterval]);

  const drawerSalesCash = useMemo(() => drawerSales.reduce((sum, s) => sum + (s.paidAmount || 0), 0), [drawerSales]);
  const drawerSalesCredit = useMemo(() => drawerSales.reduce((sum, s) => sum + Math.max((s.totalAmount || 0) - (s.paidAmount || 0), 0), 0), [drawerSales]);

  const drawerPurchasesCash = useMemo(() => drawerPurchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0), [drawerPurchases]);
  const drawerPurchasesCredit = useMemo(() => drawerPurchases.reduce((sum, p) => sum + Math.max((p.totalAmount || 0) - (p.paidAmount || 0), 0), 0), [drawerPurchases]);

  const drawerTotalCash = drawerSalesCash + drawerPurchasesCash;
  const drawerTotalCredit = drawerSalesCredit + drawerPurchasesCredit;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Calculations
  const now = new Date();
  const periodInterval = (() => {
    if (customRange.start && customRange.end) {
      return {
        start: startOfDay(customRange.start),
        end: endOfDay(customRange.end),
      };
    }

    const start = (() => {
      switch (periodFilter) {
        case 'today':
          return startOfDay(now);
        case '30d':
          return new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        case '7d':
        default:
          return new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      }
    })();

    return {
      start,
      end: endOfDay(now),
    };
  })();

  const periodLabel = (() => {
    if (customRange.start && customRange.end) {
      return `${format(customRange.start, 'dd MMM')} - ${format(customRange.end, 'dd MMM')}`;
    }

    switch (periodFilter) {
      case 'today':
        return 'Today';
      case '30d':
        return '30D';
      case '7d':
      default:
        return '7D';
    }
  })();

  const periodTransactions = transactions.filter((transaction) =>
    isWithinInterval(transaction.timestamp, periodInterval)
  );

  const filteredSalesValue = periodTransactions
    .filter(t => t.type === 'SALE_OUT')
    .reduce((sum, t) => sum + (t.unitSellPrice || 0) * t.quantity, 0);

  const filteredPurchasesValue = periodTransactions
    .filter(t => t.type === 'PURCHASE_IN')
    .reduce((sum, t) => sum + (t.unitCost || 0) * t.quantity, 0);

  const filteredProfitValue = periodTransactions
    .filter((transaction) => transaction.type === 'SALE_OUT')
    .reduce((sum, transaction) => {
      const item = items.find((entry) => entry.id === transaction.itemId);
      const estimatedCost = (item?.basePrice || 0) * transaction.quantity;
      const saleValue = (transaction.unitSellPrice || 0) * transaction.quantity;
      return sum + (saleValue - estimatedCost);
    }, 0);

  const activeItems = items.filter((item) => !item.isDeleted);
  const lowStockItems = activeItems.filter(i => i.currentStock <= i.reorderThreshold);
  const totalReceivables = customers.reduce((sum, c) => sum + c.balance, 0);
  const totalPayables = suppliers.reduce((sum, s) => sum + s.balance, 0);
  const stockValue = activeItems.reduce((sum, i) => sum + i.currentStock * i.basePrice, 0);

  const getTxLabel = (tx: InventoryTransaction) => {
    switch (tx.type) {
      case 'ADJUSTMENT_OUT':
        return 'Item Removed';
      case 'ADJUSTMENT_IN':
        return 'Item Added';
      default:
        return tx.type.replace(/_/g, ' ');
    }
  };

  const getSignedQuantity = (tx: InventoryTransaction) => {
    switch (tx.type) {
      case 'SALE_OUT':
      case 'DAMAGE_OUT':
      case 'ADJUSTMENT_OUT':
        return -tx.quantity;
      case 'PURCHASE_IN':
      case 'CUSTOMER_RETURN':
      case 'ADJUSTMENT_IN':
        return tx.quantity;
      default:
        return tx.quantity;
    }
  };

  const renderOwnerDashboard = () => (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Overview</h3>
            <p className="text-xs text-zinc-500">Compact snapshot of sales, dues, and inventory.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex w-full items-center gap-1 rounded-2xl bg-zinc-100 p-1 sm:w-auto">
              {[
                { key: 'today', label: 'Today' },
                { key: '7d', label: '7D' },
                { key: '30d', label: '30D' },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(option.key as PeriodFilter);
                    setCustomRange({ start: null, end: null });
                    setIsCalendarOpen(false);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !customRange.start && periodFilter === option.key ? 'bg-white text-orange-600 shadow-sm' : 'text-zinc-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="relative ml-auto sm:ml-1">
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                    customRange.start && customRange.end
                      ? 'border-orange-200 bg-orange-50 text-orange-700 shadow-sm'
                      : 'border-transparent bg-transparent text-zinc-600 hover:bg-white hover:text-zinc-900'
                  }`}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  <span className="max-w-[6.75rem] truncate sm:max-w-none">
                    {customRange.start && customRange.end ? periodLabel : 'Date Range'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {isCalendarOpen && (
                  <PremiumRangeCalendar
                    month={calendarMonth}
                    range={customRange}
                    onMonthChange={setCalendarMonth}
                    onSelectDate={(date) => {
                      if (!customRange.start || (customRange.start && customRange.end)) {
                        setCustomRange({ start: date, end: null });
                        return;
                      }

                      if (date < customRange.start) {
                        setCustomRange({ start: date, end: customRange.start });
                      } else {
                        setCustomRange({ start: customRange.start, end: date });
                      }
                    }}
                    onClear={() => setCustomRange({ start: null, end: null })}
                    onApply={() => setIsCalendarOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label={customRange.start && customRange.end ? `Sales (${periodLabel})` : periodFilter === 'today' ? "Today's Sales" : `Sales (${periodFilter.toUpperCase()})`}
            value={formatCurrency(filteredSalesValue, currentOrg?.settings.currency)}
            icon={TrendingUp}
            color="blue"
          />
          <StatCard
            label={customRange.start && customRange.end ? `Purchases (${periodLabel})` : periodFilter === 'today' ? "Today's Purchases" : `Purchases (${periodFilter.toUpperCase()})`}
            value={formatCurrency(filteredPurchasesValue, currentOrg?.settings.currency)}
            icon={ArrowDownLeft}
            color="orange"
          />
          <StatCard label="Receivables" value={formatCurrency(totalReceivables, currentOrg?.settings.currency)} icon={ArrowDownLeft} color="red" />
          <StatCard label="Stock Value" value={formatCurrency(stockValue, currentOrg?.settings.currency)} icon={Package} color="purple" />
          <StatCard
            label={customRange.start && customRange.end ? `Total Profit (${periodLabel})` : periodFilter === 'today' ? "Today's Profit" : `Total Profit (${periodFilter.toUpperCase()})`}
            value={formatCurrency(filteredProfitValue, currentOrg?.settings.currency)}
            icon={Sparkles}
            color="emerald"
            className="col-span-2 xl:col-span-4"
          />
        </div>
      </div>

      {/* Sales Target Widget – visible if sales module is enabled */}
      {currentOrg?.settings?.modules?.sales && user && (
        <SalesTargetDashboardWidget
          orgId={currentOrg.id}
          userId={user.uid}
          ownerId={currentOrg.ownerId}
          sales={sales}
          currency={currentOrg.settings.currency}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900">Recent Activity</h3>
            <Link to="/transactions" className="text-xs font-medium text-orange-600 hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-zinc-50">
            {periodTransactions.slice(0, 5).map((t) => {
              const item = items.find(i => i.id === t.itemId);
              const signedQuantity = getSignedQuantity(t);
              const isOutbound = signedQuantity < 0;
              return (
                <div key={t.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isOutbound ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {isOutbound ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                      <p className="text-xs text-zinc-500 font-mono uppercase">{getTxLabel(t)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${isOutbound ? 'text-red-600' : 'text-blue-600'}`}>
                      {signedQuantity > 0 ? '+' : ''}{signedQuantity} {item?.unit}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono uppercase">{format(t.timestamp, 'dd MMM, HH:mm')}</p>
                  </div>
                </div>
              );
            })}
            {periodTransactions.length === 0 && (
              <div className="p-12 text-center text-zinc-400 italic">No recent activity.</div>
            )}
          </div>
        </div>

        {/* Alerts & Quick Actions */}
        <div className="space-y-8">
          {/* Alerts */}
          {lowStockItems.length > 0 && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-red-700 font-bold mb-3">
                <AlertTriangle className="w-5 h-5" />
                <span>Low Stock Alerts</span>
              </div>
              <div className="space-y-2">
                {lowStockItems.slice(0, 3).map(item => (
                  <div key={item.id} className="flex justify-between text-xs text-red-600 font-medium">
                    <span>{item.name}</span>
                    <span>{item.currentStock} left</span>
                  </div>
                ))}
                {lowStockItems.length > 3 && (
                  <Link to="/items" className="block text-[10px] text-red-400 hover:underline">+{lowStockItems.length - 3} more items</Link>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-2">
              <QuickActionLink to="/sales/new" icon={ShoppingCart} label="New Sale" desc="Create customer invoice" color="orange" />
              <QuickActionLink to="/purchases/new" icon={Package} label="Receive Stock" desc="Add inventory from supplier" color="blue" />
              <QuickActionLink to="/items" icon={Plus} label="Add Item" desc="Register new product" color="zinc" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderWarehouseDashboard = () => {
    const hasAnyPermission = 
      hasModulePermission('inventory') || 
      hasModulePermission('sales') || 
      hasModulePermission('purchases') || 
      hasModulePermission('finance') || 
      hasModulePermission('damages') || 
      hasModulePermission('returns') || 
      hasModulePermission('expenseTracker') || 
      hasModulePermission('customerCredit') || 
      hasModulePermission('supplierCredit') ||
      hasModulePermission('truckInventory') ||
      hasModulePermission('staffManagement');

    if (!hasAnyPermission) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-[2rem] border border-zinc-200 bg-white shadow-sm max-w-xl mx-auto space-y-6 mt-8">
          <div className="h-16 w-16 flex items-center justify-center rounded-2xl bg-orange-50 text-orange-500 shadow-inner">
            <Sparkles className="h-8 w-8 animate-pulse text-orange-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight">Welcome to Stockii</h3>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
              Your account is registered successfully, but you do not currently have access to any modules.
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-4 border border-zinc-100 max-w-xs text-xs text-zinc-400 font-medium leading-normal">
            Please contact your organization administrator or owner to configure your permitted modules.
          </div>
        </div>
      );
    }

    const allowedTxTypes = new Set<string>();
    if (hasModulePermission('sales')) allowedTxTypes.add('SALE_OUT');
    if (hasModulePermission('purchases')) allowedTxTypes.add('PURCHASE_IN');
    if (hasModulePermission('damages')) allowedTxTypes.add('DAMAGE_OUT');
    if (hasModulePermission('returns')) allowedTxTypes.add('CUSTOMER_RETURN');
    if (hasModulePermission('inventory')) {
      allowedTxTypes.add('ADJUSTMENT_IN');
      allowedTxTypes.add('ADJUSTMENT_OUT');
    }
    const filteredPeriodTransactions = periodTransactions.filter(t => allowedTxTypes.has(t.type));

    const showOverviewRow = hasModulePermission('sales') || hasModulePermission('purchases') || hasModulePermission('finance');
    const showNewSaleAction = hasModulePermission('sales');
    const showReceiveStockAction = hasModulePermission('purchases');
    const showAddItemAction = hasModulePermission('inventory');
    const showQuickActions = showNewSaleAction || showReceiveStockAction || showAddItemAction;

    return (
      <div className="space-y-8">
        {hasModulePermission('inventory') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Items" value={activeItems.length.toString()} icon={Package} color="blue" />
            <StatCard label="Low Stock" value={lowStockItems.length.toString()} icon={AlertTriangle} color="red" />
            <StatCard label="Recent Movements" value={periodTransactions.length.toString()} icon={Clock} color="zinc" />
          </div>
        )}

        {/* Sales Target Widget for employees with sales module */}
        {hasModulePermission('sales') && currentOrg && user && (
          <SalesTargetDashboardWidget
            orgId={currentOrg.id}
            userId={user.uid}
            ownerId={currentOrg.ownerId}
            sales={sales}
            currency={currentOrg.settings.currency}
          />
        )}

        {showOverviewRow && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Overview</h3>
                <p className="text-xs text-zinc-500">Compact snapshot of sales, dues, and inventory.</p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="flex w-full items-center gap-1 rounded-2xl bg-zinc-100 p-1 sm:w-auto">
                  {[
                    { key: 'today', label: 'Today' },
                    { key: '7d', label: '7D' },
                    { key: '30d', label: '30D' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setPeriodFilter(option.key as PeriodFilter);
                        setCustomRange({ start: null, end: null });
                        setIsCalendarOpen(false);
                      }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                        !customRange.start && periodFilter === option.key ? 'bg-white text-orange-600 shadow-sm' : 'text-zinc-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  <div className="relative ml-auto sm:ml-1">
                    <button
                      type="button"
                      onClick={() => setIsCalendarOpen((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                        customRange.start && customRange.end
                          ? 'border-orange-200 bg-orange-50 text-orange-700 shadow-sm'
                          : 'border-transparent bg-transparent text-zinc-600 hover:bg-white hover:text-zinc-900'
                      }`}
                    >
                      <CalendarRange className="h-3.5 w-3.5" />
                      <span className="max-w-[6.75rem] truncate sm:max-w-none">
                        {customRange.start && customRange.end ? periodLabel : 'Date Range'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {isCalendarOpen && (
                      <PremiumRangeCalendar
                        month={calendarMonth}
                        range={customRange}
                        onMonthChange={setCalendarMonth}
                        onSelectDate={(date) => {
                          if (!customRange.start || (customRange.start && customRange.end)) {
                            setCustomRange({ start: date, end: null });
                            return;
                          }
                          if (date < customRange.start) {
                            setCustomRange({ start: date, end: customRange.start });
                          } else {
                            setCustomRange({ start: customRange.start, end: date });
                          }
                        }}
                        onClear={() => setCustomRange({ start: null, end: null })}
                        onApply={() => setIsCalendarOpen(false)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {hasModulePermission('sales') && (
                <StatCard
                  label={customRange.start && customRange.end ? `Sales (${periodLabel})` : periodFilter === 'today' ? "Today's Sales" : `Sales (${periodFilter.toUpperCase()})`}
                  value={formatCurrency(filteredSalesValue, currentOrg?.settings.currency)}
                  icon={TrendingUp}
                  color="blue"
                />
              )}
              {hasModulePermission('purchases') && (
                <StatCard
                  label={customRange.start && customRange.end ? `Purchases (${periodLabel})` : periodFilter === 'today' ? "Today's Purchases" : `Purchases (${periodFilter.toUpperCase()})`}
                  value={formatCurrency(filteredPurchasesValue, currentOrg?.settings.currency)}
                  icon={ArrowDownLeft}
                  color="orange"
                />
              )}
              {hasModulePermission('finance') && (
                <>
                  <StatCard label="Receivables" value={formatCurrency(totalReceivables, currentOrg?.settings.currency)} icon={ArrowDownLeft} color="red" />
                  <StatCard label="Stock Value" value={formatCurrency(stockValue, currentOrg?.settings.currency)} icon={Package} color="purple" />
                  <StatCard
                    label={customRange.start && customRange.end ? `Total Profit (${periodLabel})` : periodFilter === 'today' ? "Today's Profit" : `Total Profit (${periodFilter.toUpperCase()})`}
                    value={formatCurrency(filteredProfitValue, currentOrg?.settings.currency)}
                    icon={Sparkles}
                    color="emerald"
                    className="col-span-2 xl:col-span-4"
                  />
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {allowedTxTypes.size > 0 && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-zinc-900">Recent Activity</h3>
                <Link to="/transactions" className="text-xs font-medium text-orange-600 hover:underline">View All</Link>
              </div>
              <div className="divide-y divide-zinc-50">
                {filteredPeriodTransactions.slice(0, 5).map((t) => {
                  const item = items.find(i => i.id === t.itemId);
                  const signedQuantity = getSignedQuantity(t);
                  const isOutbound = signedQuantity < 0;
                  return (
                    <div key={t.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isOutbound ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {isOutbound ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                          <p className="text-xs text-zinc-500 font-mono uppercase">{getTxLabel(t)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${isOutbound ? 'text-red-600' : 'text-blue-600'}`}>
                          {signedQuantity > 0 ? '+' : ''}{signedQuantity} {item?.unit}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono uppercase">{format(t.timestamp, 'dd MMM, HH:mm')}</p>
                      </div>
                    </div>
                  );
                })}
                {filteredPeriodTransactions.length === 0 && (
                  <div className="p-12 text-center text-zinc-400 italic">No recent activity.</div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-8">
            {hasModulePermission('inventory') && lowStockItems.length > 0 && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl">
                <div className="flex items-center gap-2 text-red-700 font-bold mb-3">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Low Stock Alerts</span>
                </div>
                <div className="space-y-2">
                  {lowStockItems.slice(0, 3).map(item => (
                    <div key={item.id} className="flex justify-between text-xs text-red-600 font-medium">
                      <span>{item.name}</span>
                      <span>{item.currentStock} left</span>
                    </div>
                  ))}
                  {lowStockItems.length > 3 && (
                    <Link to="/items" className="block text-[10px] text-red-400 hover:underline">+{lowStockItems.length - 3} more items</Link>
                  )}
                </div>
              </div>
            )}

            {showQuickActions && (
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-zinc-100">
                  <h3 className="font-bold text-zinc-900">Quick Actions</h3>
                </div>
                <div className="p-4 space-y-2">
                  {showNewSaleAction && (
                    <QuickActionLink to="/sales/new" icon={ShoppingCart} label="New Sale" desc="Create customer invoice" color="orange" />
                  )}
                  {showReceiveStockAction && (
                    <QuickActionLink to="/purchases/new" icon={Package} label="Receive Stock" desc="Add inventory from supplier" color="blue" />
                  )}
                  {showAddItemAction && (
                    <QuickActionLink to="/items" icon={Plus} label="Add Item" desc="Register new product" color="zinc" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
          <p className="text-zinc-500 font-serif italic">
            {membership?.role === 'owner' ? "Here's your business at a glance." : "Your daily operations summary."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCashCreditOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Wallet className="w-4 h-4" />
            <span>Cash & Credit</span>
          </button>
        </div>
      </header>

      {membership?.role === 'owner' || membership?.role === 'admin' ? renderOwnerDashboard() : renderWarehouseDashboard()}

      {/* Cash & Credit Drawer */}
      <AnimatePresence>
        {isCashCreditOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCashCreditOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />

            {/* Slide-over panel */}
            <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-screen max-w-md bg-white shadow-2xl flex flex-col h-full"
              >
                {/* Header */}
                <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Cash & Credit Summary</h3>
                    <p className="text-xs text-zinc-500 font-normal">Live breakdown of cash & credit flow</p>
                  </div>
                  <button
                    onClick={() => setIsCashCreditOpen(false)}
                    className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Filter Section */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      Filter Section
                    </label>
                    
                    {/* Preset Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      {(['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'custom'] as const).map((filter) => {
                        const labels = {
                          today: 'Today',
                          yesterday: 'Yesterday',
                          this_week: 'This Week',
                          this_month: 'This Month',
                          last_month: 'Last Month',
                          custom: 'Custom Range',
                        };

                        if (filter === 'custom') {
                          return (
                            <div key={filter} className="relative col-span-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawerFilter('custom');
                                  setIsDrawerCalendarOpen((prev) => !prev);
                                }}
                                className={`w-full rounded-xl px-2 py-2.5 text-xs font-bold transition-all ${
                                  drawerFilter === 'custom'
                                    ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                                }`}
                              >
                                {labels[filter]}
                              </button>
                              {isDrawerCalendarOpen && (
                                <PremiumRangeCalendar
                                  month={drawerCalendarMonth}
                                  range={drawerCustomRange}
                                  onMonthChange={setDrawerCalendarMonth}
                                  onSelectDate={(date) => {
                                    if (!drawerCustomRange.start || (drawerCustomRange.start && drawerCustomRange.end)) {
                                      setDrawerCustomRange({ start: date, end: null });
                                      return;
                                    }

                                    if (date < drawerCustomRange.start) {
                                      setDrawerCustomRange({ start: date, end: drawerCustomRange.start });
                                    } else {
                                      setDrawerCustomRange({ start: drawerCustomRange.start, end: date });
                                    }
                                  }}
                                  onClear={() => setDrawerCustomRange({ start: null, end: null })}
                                  onApply={() => setIsDrawerCalendarOpen(false)}
                                  compact={true}
                                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[19rem] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-2xl shadow-zinc-200 backdrop-blur"
                                />
                              )}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => {
                              setDrawerFilter(filter);
                              setDrawerCustomRange({ start: null, end: null });
                              setIsDrawerCalendarOpen(false);
                            }}
                            className={`rounded-xl px-2 py-2.5 text-xs font-bold transition-all ${
                              drawerFilter === filter
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
                            }`}
                          >
                            {labels[filter]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Breakdown Table */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      Breakdown Table
                    </label>
                    <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white shadow-sm">
                      {drawerFilter === 'custom' && (drawerCustomRange.start || drawerCustomRange.end) && (
                        <div className="bg-orange-50/50 border-b border-zinc-200 px-4 py-2.5 flex items-center gap-2 text-zinc-700 animate-fadeIn">
                          <CalendarRange className="w-4 h-4 text-orange-500 shrink-0" />
                          <span className="text-xs font-semibold">
                            Custom Range:{' '}
                            <span className="font-bold text-zinc-950">
                              {drawerCustomRange.start ? format(drawerCustomRange.start, 'dd MMM yyyy') : 'Start'}{' '}
                              <span className="text-zinc-400 font-normal">to</span>{' '}
                              {drawerCustomRange.end ? format(drawerCustomRange.end, 'dd MMM yyyy') : 'End'}
                            </span>
                          </span>
                        </div>
                      )}
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="bg-zinc-50/80 border-b border-zinc-200">
                            <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase tracking-wider">Transaction Type</th>
                            <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase tracking-wider text-right">Cash Amount (₹)</th>
                            <th className="px-4 py-3 font-bold text-zinc-500 text-[10px] uppercase tracking-wider text-right">Credit Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          <tr className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-zinc-700 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              Sales
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-zinc-900">
                              {formatCurrency(drawerSalesCash, currentOrg?.settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-zinc-900">
                              {formatCurrency(drawerSalesCredit, currentOrg?.settings.currency)}
                            </td>
                          </tr>
                          <tr className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-zinc-700 flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                              Purchases
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-zinc-900">
                              {formatCurrency(drawerPurchasesCash, currentOrg?.settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-zinc-900">
                              {formatCurrency(drawerPurchasesCredit, currentOrg?.settings.currency)}
                            </td>
                          </tr>
                          <tr className="bg-zinc-50 font-bold border-t border-zinc-200">
                            <td className="px-4 py-3 text-zinc-900">Total</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-600 bg-emerald-50/70">
                              {formatCurrency(drawerTotalCash, currentOrg?.settings.currency)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-rose-600 bg-rose-50/70">
                              {formatCurrency(drawerTotalCredit, currentOrg?.settings.currency)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      Summary Cards
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Cash Card */}
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform" />
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Total Cash Amount</p>
                        <p className="text-lg font-extrabold text-emerald-600">
                          {formatCurrency(drawerSalesCash, currentOrg?.settings.currency)}
                        </p>
                        <p className="text-[10px] text-emerald-600/80 mt-1 font-medium">Amount received</p>
                      </div>

                      {/* Credit Card */}
                      <div className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform" />
                        <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-1">Total Credit Amount</p>
                        <p className="text-lg font-extrabold text-rose-600">
                          {formatCurrency(drawerSalesCredit, currentOrg?.settings.currency)}
                        </p>
                        <p className="text-[10px] text-rose-600/80 mt-1 font-medium">Amount not received / on credit</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatCard = ({ label, value, trend, icon: Icon, color, className = '' }: any) => {
  const colors: any = {
    blue: 'bg-blue-500 text-blue-600 bg-blue-50',
    orange: 'bg-orange-500 text-orange-600 bg-orange-50',
    red: 'bg-red-500 text-red-600 bg-red-50',
    purple: 'bg-purple-500 text-purple-600 bg-purple-50',
    emerald: 'bg-emerald-500 text-emerald-600 bg-emerald-50',
    zinc: 'bg-zinc-500 text-zinc-600 bg-zinc-50',
  };

  return (
    <div className={`rounded-2xl border border-zinc-100 bg-zinc-50 p-3.5 sm:p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className={`rounded-xl p-2 ${colors[color].split(' ')[2]} ${colors[color].split(' ')[1]}`}>
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
        </div>
        {trend && <span className="text-xs font-medium text-green-600">{trend}</span>}
      </div>
      <p className="mb-1 text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-400 sm:text-[10px]">{label}</p>
      <span className="text-base font-bold text-zinc-900 sm:text-xl">{value}</span>
    </div>
  );
};

const PremiumRangeCalendar = ({
  month,
  range,
  onMonthChange,
  onSelectDate,
  onClear,
  onApply,
  className,
  compact = false,
}: {
  month: Date;
  range: { start: Date | null; end: Date | null };
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: Date) => void;
  onClear: () => void;
  onApply: () => void;
  className?: string;
  compact?: boolean;
}) => {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const isInRange = (date: Date) =>
    range.start && range.end ? isWithinInterval(date, { start: startOfDay(range.start), end: endOfDay(range.end) }) : false;

  return (
    <div className={className || "absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[22rem] overflow-hidden rounded-[1.75rem] border border-zinc-200/80 bg-white/95 shadow-2xl shadow-zinc-200 backdrop-blur"}>
      {compact && (
        <div className="bg-zinc-50 border-b border-zinc-150 px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Date Range</span>
          <span className="text-xs font-bold text-zinc-800">
            {range.start ? format(range.start, 'dd MMM yyyy') : 'Start'}{' '}
            <span className="text-zinc-400 font-normal">to</span>{' '}
            {range.end ? format(range.end, 'dd MMM yyyy') : 'End'}
          </span>
        </div>
      )}

      <div className={`bg-gradient-to-br from-orange-50 via-white to-emerald-50 ${compact ? 'p-3' : 'p-4'}`}>
        {!compact ? (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Date Range</p>
              <p className="mt-1 text-sm font-bold text-zinc-900">
                {range.start ? format(range.start, 'dd MMM yyyy') : 'Start date'}{' '}
                <span className="text-zinc-400">to</span>{' '}
                {range.end ? format(range.end, 'dd MMM yyyy') : 'End date'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, -1))}
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, 1))}
                className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-zinc-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-zinc-800">{format(month, 'MMMM yyyy')}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, -1))}
                className="rounded-full border border-zinc-200 bg-white p-1 text-zinc-500 hover:text-zinc-950 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, 1))}
                className="rounded-full border border-zinc-200 bg-white p-1 text-zinc-500 hover:text-zinc-950 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {!compact && (
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-800">{format(month, 'MMMM yyyy')}</p>
            <p className="text-xs text-zinc-500">Pick a start and end date</p>
          </div>
        )}

        <div className={`grid grid-cols-7 gap-1 text-center font-mono uppercase tracking-wider text-zinc-400 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day} className="py-0.5">{day}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const selected = (range.start && isSameDay(day, range.start)) || (range.end && isSameDay(day, range.end));
            const inRange = isInRange(day);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelectDate(day)}
                className={`relative rounded-xl font-medium transition-all ${
                  compact ? 'h-8 text-xs' : 'h-11 text-sm'
                } ${
                  selected
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                    : inRange
                      ? 'bg-orange-100 text-orange-700'
                      : isSameMonth(day, month)
                        ? 'text-zinc-700 hover:bg-white hover:shadow-sm'
                        : 'text-zinc-300'
                }`}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`flex items-center justify-between border-t border-zinc-100 ${compact ? 'px-3.5 py-2' : 'px-4 py-3'}`}>
        <button
          type="button"
          onClick={onClear}
          className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold text-zinc-500 hover:text-zinc-900`}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onApply}
          className={`bg-orange-500 font-semibold text-white hover:bg-orange-600 transition-colors ${compact ? 'rounded-lg px-2.5 py-1.5 text-[11px]' : 'rounded-xl px-3 py-2 text-xs'}`}
        >
          Apply Range
        </button>
      </div>
    </div>
  );
};

const QuickActionLink = ({ to, icon: Icon, label, desc, color }: any) => (
  <Link to={to} className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-all group">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-zinc-50 flex items-center justify-center group-hover:bg-white transition-colors`}>
        <Icon className={`w-5 h-5 text-zinc-600`} />
      </div>
      <div className="text-left">
        <p className="text-sm font-bold text-zinc-900">{label}</p>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-zinc-300" />
  </Link>
);
