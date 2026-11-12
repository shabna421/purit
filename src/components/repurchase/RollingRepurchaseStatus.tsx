import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  Clock,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Layers,
  Info,
  HelpCircle,
  Package,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Sale, Item } from '../../types';
import {
  calculateRepurchasePredictions,
  ProductRepurchasePrediction,
  RepurchaseStatus,
  formatConsumptionRate,
} from '../../utils/repurchasePrediction';

interface RollingRepurchaseStatusProps {
  sales: Sale[];
  productCatalog: Map<string, Item>;
  customerId: string;
  customerName?: string;
}

type FilterOption = 'all' | 'overdue' | 'due_today' | 'upcoming' | 'insufficient_history';

export const RollingRepurchaseStatus: React.FC<RollingRepurchaseStatusProps> = ({
  sales,
  productCatalog,
  customerId,
  customerName,
}) => {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});

  // Compute live rolling predictions
  const summary = useMemo(() => {
    return calculateRepurchasePredictions(sales, productCatalog, customerId, new Date());
  }, [sales, productCatalog, customerId]);

  const toggleCycles = (itemId: string) => {
    setExpandedCycles((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Filter and search predictions
  const filteredPredictions = useMemo(() => {
    return summary.predictions.filter((p) => {
      // 1. Status Filter
      if (filter !== 'all' && p.status !== filter) return false;

      // 2. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = p.itemName.toLowerCase().includes(query);
        const matchSku = p.sku ? p.sku.toLowerCase().includes(query) : false;
        const matchCategory = p.categoryId ? p.categoryId.toLowerCase().includes(query) : false;
        if (!matchName && !matchSku && !matchCategory) return false;
      }

      return true;
    });
  }, [summary.predictions, filter, searchQuery]);

  return (
    <div className="rounded-3xl border border-zinc-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-6">
      {/* 1. Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0 mt-0.5">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900">
                Rolling Repurchase Status
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200/60">
                AI Prediction
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Predicts customer reorder timelines from historical consumption rates across purchased consumables.
            </p>
          </div>
        </div>

        {/* Quick Top Counts */}
        <div className="flex items-center gap-2 flex-wrap">
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{summary.overdueCount} Overdue</span>
            </span>
          )}
          {summary.dueTodayCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5" />
              <span>{summary.dueTodayCount} Due Today</span>
            </span>
          )}
          {summary.upcomingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>{summary.upcomingCount} Upcoming</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Summary Metric Badges / Filter Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            filter === 'all'
              ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
              : 'bg-zinc-50 border-zinc-200/80 text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">All Tracked</div>
          <div className="text-lg font-extrabold mt-0.5">{summary.totalTrackedProducts}</div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('overdue')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            filter === 'overdue'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-rose-50/70 border-rose-200/80 text-rose-800 hover:bg-rose-100/70'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-85 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            Overdue
          </div>
          <div className="text-lg font-extrabold mt-0.5 text-rose-700 group-[.bg-rose-600]:text-white">
            {summary.overdueCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('due_today')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            filter === 'due_today'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-amber-50/70 border-amber-200/80 text-amber-800 hover:bg-amber-100/70'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-85 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Due Today
          </div>
          <div className="text-lg font-extrabold mt-0.5 text-amber-700 group-[.bg-amber-600]:text-white">
            {summary.dueTodayCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('upcoming')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            filter === 'upcoming'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-800 hover:bg-emerald-100/70'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-85 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Upcoming
          </div>
          <div className="text-lg font-extrabold mt-0.5 text-emerald-700 group-[.bg-emerald-600]:text-white">
            {summary.upcomingCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter('insufficient_history')}
          className={`p-3 rounded-2xl border text-left transition-all col-span-2 sm:col-span-1 ${
            filter === 'insufficient_history'
              ? 'bg-zinc-600 text-white border-zinc-600 shadow-xs'
              : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">1 Purchase Only</div>
          <div className="text-lg font-extrabold mt-0.5">{summary.insufficientHistoryCount}</div>
        </button>
      </div>

      {/* 3. Search Bar */}
      {summary.totalTrackedProducts > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tracked products by name, category, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm text-zinc-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          />
        </div>
      )}

      {/* 4. Product Predictions List */}
      {summary.totalTrackedProducts === 0 ? (
        <div className="p-8 text-center bg-zinc-50/70 rounded-2xl border border-dashed border-zinc-200 space-y-2">
          <Package className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-bold text-zinc-700">No Purchased Consumables Found</p>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Once you record sales for this customer, Purity will automatically track their consumption intervals and predict upcoming reorder dates.
          </p>
        </div>
      ) : filteredPredictions.length === 0 ? (
        <div className="p-8 text-center bg-zinc-50/70 rounded-2xl border border-zinc-200 space-y-2">
          <p className="text-sm font-bold text-zinc-700">No products match the selected filter</p>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSearchQuery('');
            }}
            className="text-xs font-semibold text-orange-600 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPredictions.map((product) => {
            const isExpanded = Boolean(expandedCycles[product.itemId]);

            // Status Styling
            let badgeStyle = 'bg-zinc-100 text-zinc-700 border-zinc-200';
            let dotColor = 'bg-zinc-400';
            let cardBorder = 'border-zinc-200/90';

            if (product.status === 'upcoming') {
              badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              dotColor = 'bg-emerald-500';
              cardBorder = 'border-emerald-200/90 hover:border-emerald-300';
            } else if (product.status === 'due_today') {
              badgeStyle = 'bg-amber-50 text-amber-900 border-amber-300';
              dotColor = 'bg-amber-500 animate-ping';
              cardBorder = 'border-amber-300 hover:border-amber-400';
            } else if (product.status === 'overdue') {
              badgeStyle = 'bg-rose-50 text-rose-800 border-rose-300';
              dotColor = 'bg-rose-500';
              cardBorder = 'border-rose-200 hover:border-rose-300';
            }

            return (
              <div
                key={product.itemId}
                className={`rounded-2xl border ${cardBorder} bg-white p-4 sm:p-5 shadow-xs transition-all space-y-4`}
              >
                {/* Product Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 shrink-0 font-bold text-xs uppercase">
                      {product.unit.slice(0, 3)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-zinc-900 text-base">{product.itemName}</h4>
                        {product.sku && (
                          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                            {product.sku}
                          </span>
                        )}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                          {product.unit}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {product.distinctPurchaseDatesCount} purchase date{product.distinctPurchaseDatesCount === 1 ? '' : 's'} recorded • {product.confidenceLabel}
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Status Badge */}
                  <div className="flex items-center gap-2.5 self-start sm:self-auto">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-extrabold border ${badgeStyle}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span>{product.statusLabel}</span>
                    </span>

                    {/* Quick Reorder Action */}
                    <Link
                      to={`/sales/new?customerId=${customerId}&itemId=${product.itemId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-xs shadow-orange-500/20 transition-all active:scale-[0.98]"
                      title="Create a new sale for this customer and product"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Create Bill</span>
                    </Link>
                  </div>
                </div>

                {/* 4 Detail Stat Tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
                  {/* Tile 1: Last Purchase */}
                  <div className="bg-zinc-50/80 p-3 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Last Purchase
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-zinc-800 mt-1">
                      {format(new Date(product.lastPurchaseDate), 'dd MMM yyyy')}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      Quantity: <strong className="text-zinc-700">{product.lastPurchaseQuantity} {product.unit}</strong>
                    </p>
                  </div>

                  {/* Tile 2: Average Consumption */}
                  <div className="bg-zinc-50/80 p-3 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Daily Consumption
                    </span>
                    <p className="text-xs sm:text-sm font-extrabold text-zinc-800 mt-1">
                      {product.averageDailyConsumption !== null
                        ? `${product.averageDailyConsumption >= 10 ? product.averageDailyConsumption.toFixed(1) : product.averageDailyConsumption.toFixed(2)} ${product.unit}/day`
                        : '—'}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      {product.completedCyclesCount > 0
                        ? `${product.totalQuantityConsumed} ${product.unit} over ${product.totalCycleDays} days`
                        : 'Need 2+ purchases'}
                    </p>
                  </div>

                  {/* Tile 3: Predicted Next Purchase */}
                  <div className="bg-zinc-50/80 p-3 rounded-xl border border-zinc-200/70">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Predicted Next Order
                    </span>
                    <p className="text-xs sm:text-sm font-extrabold text-zinc-900 mt-1">
                      {product.predictedNextPurchaseDate
                        ? format(new Date(product.predictedNextPurchaseDate), 'dd MMM yyyy')
                        : 'Insufficient History'}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      {product.estimatedDaysToNextPurchase
                        ? `~${product.estimatedDaysToNextPurchase} days cycle`
                        : 'Awaiting 2nd purchase'}
                    </p>
                  </div>

                  {/* Tile 4: Dynamic Status */}
                  <div
                    className={`p-3 rounded-xl border ${
                      product.status === 'overdue'
                        ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                        : product.status === 'due_today'
                          ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                          : product.status === 'upcoming'
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                      Current State
                    </span>
                    <p className="text-xs sm:text-sm font-extrabold mt-1">
                      {product.statusLabel}
                    </p>
                    <p className="text-[11px] font-medium opacity-75 mt-0.5">
                      {product.status === 'overdue'
                        ? 'Immediate follow-up recommended'
                        : product.status === 'due_today'
                          ? 'Ready for dispatch today'
                          : product.status === 'upcoming'
                            ? 'Expected on schedule'
                            : 'Needs 2+ purchases to project'}
                    </p>
                  </div>
                </div>

                {/* 5. Cycle History Expander for Transparency */}
                {product.cycles.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleCycles(product.itemId)}
                      className="text-xs font-bold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 transition-colors"
                    >
                      <span>
                        {isExpanded ? 'Hide' : 'View'} Historical Purchase Intervals ({product.cycles.length} cycle{product.cycles.length === 1 ? '' : 's'})
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 rounded-xl bg-zinc-50 p-3 border border-zinc-200/80 overflow-x-auto animate-in fade-in duration-150">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                              <th className="py-1.5 px-2">Cycle</th>
                              <th className="py-1.5 px-2">Purchase Date</th>
                              <th className="py-1.5 px-2">Next Purchase</th>
                              <th className="py-1.5 px-2 text-right">Interval</th>
                              <th className="py-1.5 px-2 text-right">Qty Consumed</th>
                              <th className="py-1.5 px-2 text-right">Consumption Rate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200/60 font-medium text-zinc-700">
                            {product.cycles.map((c) => (
                              <tr key={c.cycleIndex}>
                                <td className="py-1.5 px-2 font-bold text-zinc-900">Cycle #{c.cycleIndex}</td>
                                <td className="py-1.5 px-2">{format(new Date(c.fromDate), 'dd MMM yyyy')}</td>
                                <td className="py-1.5 px-2">{format(new Date(c.toDate), 'dd MMM yyyy')}</td>
                                <td className="py-1.5 px-2 text-right font-mono">{c.intervalDays} day{c.intervalDays === 1 ? '' : 's'}</td>
                                <td className="py-1.5 px-2 text-right font-mono">{c.previousQuantity} {product.unit}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-zinc-900">
                                  {c.dailyConsumption.toFixed(2)} {product.unit}/day
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 pt-2 border-t border-zinc-200 text-[11px] text-zinc-500 flex flex-wrap justify-between gap-2">
                          <span>
                            Total Cycles: <strong>{product.totalCycleDays} days</strong> across {product.cycles.length} interval{product.cycles.length === 1 ? '' : 's'}
                          </span>
                          <span>
                            Weighted Average: <strong>{product.totalQuantityConsumed} {product.unit} ÷ {product.totalCycleDays} days = {product.averageDailyConsumption?.toFixed(2)} {product.unit}/day</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
