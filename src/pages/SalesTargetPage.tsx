import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  endOfMonth,
  format,
  getDaysInMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Target,
  TrendingUp,
  Zap,
  Award,
  Edit3,
  Check,
  X,
  BarChart2,
  Flame,
} from 'lucide-react';
import { useAuth, useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { salesTargetService } from '../services/salesTargetService';
import { useNotifications } from '../notifications';
import { formatCurrency } from '../utils/currency';
import { SalesTarget } from '../types';

/* ─────────────────────────────────── helpers ─── */
function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function calcPct(achieved: number, target: number) {
  if (!target) return 0;
  return clamp((achieved / target) * 100, 0, 100);
}

function formatCompact(n: number, currency = 'INR') {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n, currency);
}

/* ─────────────────────────────── ring chart ─── */
function RingProgress({
  pct,
  achieved,
  target,
  currency,
  animKey,
}: {
  pct: number;
  achieved: number;
  target: number;
  currency?: string;
  animKey: string;
}) {
  const r = 82;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    setDisplayed(0);
    const raf = requestAnimationFrame(() => {
      setTimeout(() => setDisplayed(pct), 30);
    });
    return () => cancelAnimationFrame(raf);
  }, [animKey, pct]);

  const strokeColor =
    pct >= 100 ? '#22c55e' : pct >= 75 ? '#f97316' : pct >= 40 ? '#fb923c' : '#e4e4e7';

  const glowColor =
    pct >= 100 ? '#bbf7d0' : pct >= 75 ? '#fed7aa' : pct >= 40 ? '#fdba74' : 'transparent';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
      {/* Glow */}
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-40 transition-all duration-700"
        style={{ background: glowColor }}
      />
      <svg width={220} height={220} className="rotate-[-90deg]">
        {/* Track */}
        <circle
          cx={110}
          cy={110}
          r={r}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth={18}
        />
        {/* Progress */}
        <circle
          cx={110}
          cy={110}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={18}
          strokeLinecap="round"
          strokeDasharray={`${(displayed / 100) * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
        />
        {/* Outer subtle ring */}
        <circle cx={110} cy={110} r={100} fill="none" stroke="#f4f4f5" strokeWidth={2} />
      </svg>

      {/* Centre text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-4xl font-black text-zinc-900 tabular-nums leading-none">
          {Math.round(pct)}%
        </p>
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 mt-1">
          of target
        </p>
        <p className="text-sm font-bold text-zinc-700 mt-2">
          {formatCompact(achieved, currency)}
        </p>
        {target > 0 && (
          <p className="text-[10px] text-zinc-400 mt-0.5">
            / {formatCompact(target, currency)}
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── daily bar chart ─── */
function DailyBarChart({
  dailyData,
  target,
  currency,
  daysInMonth,
}: {
  dailyData: number[];
  target: number;
  currency?: string;
  daysInMonth: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxDaily = Math.max(...dailyData, target / daysInMonth, 1);
  const today = new Date().getDate() - 1; // 0-indexed

  return (
    <div className="relative h-36 flex items-end gap-0.5 sm:gap-1">
      {dailyData.map((val, idx) => {
        const barPct = (val / maxDaily) * 100;
        const isToday = idx === today;
        const isFuture = idx > today;
        const isHovered = idx === hoveredIdx;

        return (
          <div
            key={idx}
            className="relative flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Tooltip */}
            <AnimatePresence>
              {isHovered && val > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full mb-1.5 z-20 bg-zinc-900 text-white text-[9px] font-bold rounded-lg px-2 py-1 whitespace-nowrap shadow-xl"
                >
                  Day {idx + 1}: {formatCompact(val, currency)}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bar */}
            <motion.div
              className={`w-full rounded-t-md transition-all ${
                isFuture
                  ? 'bg-zinc-100'
                  : isToday
                  ? 'bg-orange-500 shadow-md shadow-orange-200'
                  : barPct > 0
                  ? 'bg-orange-300'
                  : 'bg-zinc-100'
              } ${isHovered ? 'opacity-80' : ''}`}
              style={{ height: `${Math.max(barPct, isFuture ? 0 : val > 0 ? 4 : 2)}%` }}
              initial={{ scaleY: 0, originY: 1 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5, delay: idx * 0.012, ease: 'easeOut' }}
            />

            {/* Today marker */}
            {isToday && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-orange-500 uppercase tracking-wider">
                ↑
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── stat chip ─── */
function StatChip({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1.5 ${accent}`}>
      <Icon className="h-4 w-4 opacity-60" />
      <p className="text-xs font-mono uppercase tracking-widest opacity-60">{label}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}

/* ──────────────────────────── main page ─── */
export default function SalesTargetPage() {
  const { currentOrg, membership } = useTenancy();
  const { user } = useAuth();
  const { sales } = useRealtimeData();
  const { success, error: notifyError } = useNotifications();

  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [target, setTarget] = useState<SalesTarget | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);

  const currency = currentOrg?.settings?.currency ?? 'INR';

  /* ── permissions ── */
  const hasSalesPermission = useMemo(() => {
    if (!currentOrg || !user) return false;
    if (user.uid === currentOrg.ownerId) return true;
    if (membership?.role === 'owner' || membership?.role === 'admin') return true;
    return Boolean(membership?.allowedModules?.['sales']);
  }, [currentOrg, user, membership]);

  /* ── fetch target for viewed month ── */
  const fetchTarget = useCallback(async () => {
    if (!currentOrg || !user) return;
    setLoadingTarget(true);
    try {
      const t = await salesTargetService.getTarget(
        currentOrg.id,
        user.uid,
        viewMonth.getFullYear(),
        viewMonth.getMonth()
      );
      setTarget(t);
      setTargetInput(t ? String(t.targetAmount) : '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTarget(false);
    }
  }, [currentOrg, user, viewMonth]);

  useEffect(() => {
    fetchTarget();
  }, [fetchTarget]);

  /* ── sales for viewed month ── */
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);

  const monthSales = useMemo(
    () =>
      sales.filter(
        (s) =>
          s.userId === user?.uid &&
          isWithinInterval(new Date(s.timestamp), {
            start: startOfDay(monthStart),
            end: monthEnd,
          })
      ),
    [sales, user, monthStart, monthEnd]
  );

  const achievedAmount = useMemo(
    () => monthSales.reduce((sum, s) => sum + s.totalAmount, 0),
    [monthSales]
  );

  const targetAmount = target?.targetAmount ?? 0;
  const pct = calcPct(achievedAmount, targetAmount);

  /* ── daily breakdown ── */
  const daysInMonth = getDaysInMonth(viewMonth);
  const dailyData = useMemo(() => {
    const arr = Array(daysInMonth).fill(0);
    monthSales.forEach((s) => {
      const d = new Date(s.timestamp).getDate() - 1; // 0-indexed
      if (d >= 0 && d < daysInMonth) arr[d] += s.totalAmount;
    });
    return arr;
  }, [monthSales, daysInMonth]);

  /* ── remaining & pace ── */
  const remaining = Math.max(targetAmount - achievedAmount, 0);
  const today = new Date();
  const isCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() &&
    viewMonth.getMonth() === today.getMonth();
  const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysLeft = isCurrentMonth ? daysInMonth - today.getDate() : 0;
  const dailyAvg = daysPassed > 0 ? achievedAmount / daysPassed : 0;
  const requiredDaily = daysLeft > 0 ? remaining / daysLeft : 0;

  /* ── save target ── */
  const handleSaveTarget = async () => {
    if (!currentOrg || !user) return;
    const amount = parseFloat(targetInput.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      notifyError('Please enter a valid target amount.');
      return;
    }
    setSaving(true);
    try {
      const t = await salesTargetService.setTarget(
        currentOrg.id,
        user.uid,
        viewMonth.getFullYear(),
        viewMonth.getMonth(),
        amount
      );
      setTarget(t);
      setIsEditing(false);
      success('Sales target saved!');
    } catch (err) {
      console.error(err);
      notifyError('Failed to save target.');
    } finally {
      setSaving(false);
    }
  };

  if (!hasSalesPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-zinc-100 flex items-center justify-center">
          <Target className="w-10 h-10 text-zinc-300" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Sales module required</h2>
          <p className="text-sm text-zinc-500 mt-1">
            You need the Sales module enabled to view targets.
          </p>
        </div>
      </div>
    );
  }

  const animKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-zinc-900 flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-orange-500 shadow-lg shadow-orange-200">
              <Target className="w-5 h-5 text-white" />
            </span>
            Sales Target
          </h2>
          <p className="text-sm text-zinc-500 mt-1 font-serif italic">
            Track your monthly sales goal and daily performance.
          </p>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-2xl px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMonth((m) => startOfMonth(subMonths(m, 1)))}
            className="p-1 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-zinc-500" />
          </button>
          <span className="text-sm font-bold text-zinc-800 min-w-[120px] text-center">
            {format(viewMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = startOfMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1));
              if (next <= startOfMonth(new Date())) setViewMonth(next);
            }}
            disabled={viewMonth >= startOfMonth(new Date())}
            className="p-1 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          </button>
        </div>
      </header>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left: Ring + Target ── */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Ring card */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex flex-col items-center gap-4">
            {loadingTarget ? (
              <div className="w-[220px] h-[220px] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <RingProgress
                pct={pct}
                achieved={achievedAmount}
                target={targetAmount}
                currency={currency}
                animKey={animKey}
              />
            )}

            {/* Status badge */}
            <AnimatePresence mode="wait">
              {targetAmount === 0 ? (
                <motion.div
                  key="notset"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 text-zinc-500 text-sm font-semibold"
                >
                  <Target className="w-4 h-4" />
                  No target set
                </motion.div>
              ) : pct >= 100 ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-700 text-sm font-bold"
                >
                  <Award className="w-4 h-4" />
                  Target Achieved! 🎉
                </motion.div>
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-orange-600 text-sm font-bold"
                >
                  <Flame className="w-4 h-4" />
                  {formatCurrency(remaining, currency)} to go
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Target setter */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                  Monthly Target
                </p>
                <p className="text-2xl font-black text-zinc-900 mt-0.5">
                  {targetAmount > 0
                    ? formatCurrency(targetAmount, currency)
                    : '—'}
                </p>
              </div>
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    setTargetInput(targetAmount > 0 ? String(targetAmount) : '');
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 text-orange-600 text-sm font-semibold hover:bg-orange-100 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  {targetAmount > 0 ? 'Edit' : 'Set Target'}
                </button>
              ) : null}
            </div>

            <AnimatePresence>
              {isEditing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-zinc-100 pt-4 space-y-3">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Target Amount ({currency})
                      </span>
                      <input
                        type="number"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        placeholder="e.g. 100000"
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTarget();
                          if (e.key === 'Escape') setIsEditing(false);
                        }}
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTarget}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-60"
                      >
                        {saving ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Save Target
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="p-2.5 rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: Chart + Stats ── */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Daily bar chart */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                  Daily Sales
                </p>
                <h3 className="text-sm font-bold text-zinc-900 mt-0.5">
                  {format(viewMonth, 'MMMM yyyy')} breakdown
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-orange-500" /> Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-orange-200" /> Past
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-zinc-100" /> Future
                </span>
              </div>
            </div>

            <DailyBarChart
              dailyData={dailyData}
              target={targetAmount}
              currency={currency}
              daysInMonth={daysInMonth}
            />

            {/* X-axis labels */}
            <div className="flex justify-between mt-2 px-0.5">
              <span className="text-[9px] text-zinc-400 font-mono">1</span>
              <span className="text-[9px] text-zinc-400 font-mono">
                {Math.floor(daysInMonth / 2)}
              </span>
              <span className="text-[9px] text-zinc-400 font-mono">{daysInMonth}</span>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip
              label="Achieved"
              value={formatCompact(achievedAmount, currency)}
              icon={TrendingUp}
              accent="bg-orange-50 border-orange-100 text-orange-700"
            />
            <StatChip
              label="Remaining"
              value={targetAmount > 0 ? formatCompact(remaining, currency) : '—'}
              icon={Target}
              accent="bg-zinc-50 border-zinc-200 text-zinc-700"
            />
            <StatChip
              label="Daily Avg"
              value={daysPassed > 0 ? formatCompact(dailyAvg, currency) : '—'}
              icon={BarChart2}
              accent="bg-blue-50 border-blue-100 text-blue-700"
            />
            <StatChip
              label={daysLeft > 0 ? `Need/day (${daysLeft}d)` : 'Req/day'}
              value={
                targetAmount > 0 && daysLeft > 0
                  ? formatCompact(requiredDaily, currency)
                  : pct >= 100
                  ? '✓ Done'
                  : '—'
              }
              icon={Zap}
              accent={
                requiredDaily > dailyAvg * 1.5
                  ? 'bg-red-50 border-red-100 text-red-700'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
              }
            />
          </div>

          {/* Pace insight */}
          {targetAmount > 0 && isCurrentMonth && daysPassed > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                pct >= 100
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : dailyAvg >= requiredDaily
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : requiredDaily > dailyAvg * 1.5
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-orange-50 border-orange-200 text-orange-800'
              }`}
            >
              <div className="mt-0.5">
                {pct >= 100 ? (
                  <Award className="w-5 h-5" />
                ) : dailyAvg >= requiredDaily ? (
                  <Flame className="w-5 h-5" />
                ) : (
                  <Zap className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold">
                  {pct >= 100
                    ? `Target crushed! You're ${Math.round(pct - 100)}% over goal.`
                    : dailyAvg >= requiredDaily
                    ? `On pace! Your daily average exceeds what's needed.`
                    : `Need to pick up the pace — you're ${Math.round(
                        ((requiredDaily - dailyAvg) / requiredDaily) * 100
                      )}% behind daily requirement.`}
                </p>
                <p className="text-xs mt-0.5 opacity-70">
                  Daily average: {formatCompact(dailyAvg, currency)} ·
                  Required: {targetAmount > 0 && daysLeft > 0
                    ? ` ${formatCompact(requiredDaily, currency)}`
                    : ' —'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Recent sales list */}
          {monthSales.length > 0 && (
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900">Recent Sales This Month</h3>
                <span className="text-xs text-zinc-400">{monthSales.length} sales</span>
              </div>
              <div className="divide-y divide-zinc-50 max-h-72 overflow-y-auto">
                {[...monthSales]
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .slice(0, 8)
                  .map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          Sale #{sale.id.slice(-6).toUpperCase()}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {format(new Date(sale.timestamp), 'dd MMM, HH:mm')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-orange-600">
                          {formatCurrency(sale.totalAmount, currency)}
                        </p>
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                            sale.paidAmount >= sale.totalAmount
                              ? 'text-green-600'
                              : sale.paidAmount > 0
                              ? 'text-orange-500'
                              : 'text-red-500'
                          }`}
                        >
                          {sale.paidAmount >= sale.totalAmount
                            ? 'Paid'
                            : sale.paidAmount > 0
                            ? 'Partial'
                            : 'Due'}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
