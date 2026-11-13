import React, { useMemo } from 'react';
import {
  Repeat,
  RotateCcw,
  Clock,
  AlertTriangle,
  CalendarCheck,
  Package,
  Calendar,
  ArrowRight,
  ShoppingCart,
  ChevronRight,
  Info,
  X,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Sale, Item } from '../../types';
import {
  calculateRepurchasePredictions,
  ProductRepurchasePrediction,
  getProductPurchaseHistory,
  formatConsumptionRate,
} from '../../utils/repurchasePrediction';

interface CustomerReorderTimelineTableProps {
  sales: Sale[];
  productCatalog: Map<string, Item>;
  customerId: string;
  customerName?: string;
  onProductClick?: (prediction: ProductRepurchasePrediction) => void;
  onClose?: () => void;
}

export const CustomerReorderTimelineTable: React.FC<CustomerReorderTimelineTableProps> = ({
  sales,
  productCatalog,
  customerId,
  customerName,
  onProductClick,
  onClose,
}) => {
  // Compute rolling predictions
  const summary = useMemo(() => {
    return calculateRepurchasePredictions(sales, productCatalog, customerId, new Date());
  }, [sales, productCatalog, customerId]);

  // Compute purchase histories per product
  const productHistories = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getProductPurchaseHistory>>();
    for (const pred of summary.predictions) {
      map.set(
        pred.itemId,
        getProductPurchaseHistory(sales, customerId, pred.itemId, pred.unit)
      );
    }
    return map;
  }, [sales, customerId, summary.predictions]);

  if (summary.totalTrackedProducts === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Repeat className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-zinc-900 text-sm">Customer Reorder Timelines</h4>
              <p className="text-xs text-zinc-400">Historical purchase intervals & predictions</p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="p-5 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200 text-xs text-zinc-500">
          No previous sales found for this customer. Once sales are recorded, reorder timelines and intervals will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-orange-200/80 bg-white shadow-xs overflow-hidden transition-all">
      {/* Header Bar */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-orange-50/70 via-white to-orange-50/30 border-b border-orange-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs shadow-orange-500/30 shrink-0">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-zinc-900 text-sm sm:text-base">
                Customer Reorder Timelines & Purchase History
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                {summary.totalTrackedProducts} Product{summary.totalTrackedProducts === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Historical purchase dates, interval days, consumption rates & next order projections.
            </p>
          </div>
        </div>

        {/* Quick Counts & Close */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {summary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span>{summary.overdueCount} Overdue</span>
            </span>
          )}
          {summary.dueTodayCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <Clock className="w-3 h-3" />
              <span>{summary.dueTodayCount} Due Today</span>
            </span>
          )}
          {summary.upcomingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CalendarCheck className="w-3 h-3" />
              <span>{summary.upcomingCount} Upcoming</span>
            </span>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors ml-1"
              title="Close reorder timeline view"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Horizontal Table View */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[940px]">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200/90 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <th className="py-2.5 px-3.5 sticky left-0 bg-zinc-50 z-10 w-48 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                Product Name
              </th>
              <th className="py-2.5 px-3 w-32">Status</th>
              <th className="py-2.5 px-3 w-36">Next Predicted Order</th>
              <th className="py-2.5 px-3 w-28">Daily Consumption</th>
              <th className="py-2.5 px-3 w-24">Avg Interval</th>
              <th className="py-2.5 px-3 w-36">Last Purchase</th>
              <th className="py-2.5 px-3 min-w-[340px]">
                Past Reorder Timelines & Quantities (Chronological)
              </th>
              <th className="py-2.5 px-3 text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
            {summary.predictions.map((pred) => {
              const history = productHistories.get(pred.itemId) || [];

              // Status styles
              let badgeColor = 'bg-zinc-100 text-zinc-700 border-zinc-200';
              let dotColor = 'bg-zinc-400';
              if (pred.status === 'upcoming') {
                badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                dotColor = 'bg-emerald-500';
              } else if (pred.status === 'due_today') {
                badgeColor = 'bg-amber-50 text-amber-900 border-amber-300';
                dotColor = 'bg-amber-500';
              } else if (pred.status === 'overdue') {
                badgeColor = 'bg-rose-50 text-rose-800 border-rose-300';
                dotColor = 'bg-rose-500';
              }

              return (
                <tr
                  key={pred.itemId}
                  className="hover:bg-orange-50/20 transition-colors group cursor-pointer"
                  onClick={() => onProductClick?.(pred)}
                >
                  {/* Column 1: Product Name & Unit (Sticky on left for horizontal scroll) */}
                  <td className="py-3 px-3.5 sticky left-0 bg-white group-hover:bg-[#fffcf9] transition-colors z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-zinc-900 group-hover:text-orange-600 transition-colors">
                        {pred.itemName}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 shrink-0">
                        {pred.unit}
                      </span>
                    </div>
                    {pred.sku && (
                      <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                        {pred.sku}
                      </span>
                    )}
                  </td>

                  {/* Column 2: Status */}
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badgeColor}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                      <span>{pred.statusLabel}</span>
                    </span>
                  </td>

                  {/* Column 3: Next Predicted Order */}
                  <td className="py-3 px-3">
                    <span className="font-extrabold text-zinc-900 block font-mono text-[11px]">
                      {pred.predictedNextPurchaseDate
                        ? format(new Date(pred.predictedNextPurchaseDate), 'dd MMM yyyy')
                        : 'Insufficient History'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {pred.estimatedDaysToNextPurchase
                        ? `~${pred.estimatedDaysToNextPurchase}d cycle`
                        : 'Need 2+ orders'}
                    </span>
                  </td>

                  {/* Column 4: Daily Consumption */}
                  <td className="py-3 px-3">
                    <span className="font-bold text-zinc-800 font-mono">
                      {formatConsumptionRate(pred.averageDailyConsumption, pred.unit)}
                    </span>
                  </td>

                  {/* Column 5: Avg Interval */}
                  <td className="py-3 px-3">
                    <span className="font-mono text-zinc-700">
                      {pred.completedCyclesCount > 0
                        ? `${(pred.totalCycleDays / pred.completedCyclesCount).toFixed(1)}d`
                        : '—'}
                    </span>
                  </td>

                  {/* Column 6: Last Purchase */}
                  <td className="py-3 px-3">
                    <span className="font-semibold text-zinc-800 block text-[11px]">
                      {format(new Date(pred.lastPurchaseDate), 'dd MMM yyyy')}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-600">
                      {pred.lastPurchaseQuantity} {pred.unit}
                    </span>
                  </td>

                  {/* Column 7: Past Reorder Timeline Flow (Scrollable Horizontal Nodes) */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[420px]">
                      {history.length === 0 ? (
                        <span className="text-zinc-400 text-[11px]">No purchases</span>
                      ) : (
                        history.map((h, i) => (
                          <React.Fragment key={h.saleId + i}>
                            {/* Interval connector badge if not first */}
                            {i > 0 && h.daysSincePrevious !== null && (
                              <div className="flex items-center text-zinc-300 shrink-0">
                                <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60 whitespace-nowrap">
                                  +{h.daysSincePrevious}d
                                </span>
                                <ArrowRight className="w-3 h-3 text-zinc-400 mx-0.5" />
                              </div>
                            )}

                            {/* Purchase event node */}
                            <div className="shrink-0 p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-white transition-all text-center min-w-[70px]">
                              <div className="text-[10px] font-bold text-zinc-800 whitespace-nowrap">
                                {format(new Date(h.timestamp), 'dd MMM')}
                              </div>
                              <div className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                                {h.quantity} {pred.unit}
                              </div>
                            </div>
                          </React.Fragment>
                        ))
                      )}

                      {/* Next order node projection */}
                      {pred.predictedNextPurchaseDate && (
                        <div className="flex items-center text-zinc-300 shrink-0">
                          <ArrowRight className="w-3 h-3 text-orange-400 mx-0.5" />
                          <div className={`shrink-0 p-1.5 rounded-lg border border-dashed transition-all text-center min-w-[80px] ${
                            pred.status === 'overdue'
                              ? 'border-rose-300 bg-rose-50/60 text-rose-900'
                              : pred.status === 'due_today'
                                ? 'border-amber-300 bg-amber-50/60 text-amber-900'
                                : 'border-emerald-300 bg-emerald-50/60 text-emerald-900'
                          }`}>
                            <div className="text-[9px] font-bold uppercase tracking-wider">
                              Next Order
                            </div>
                            <div className="text-[10px] font-mono font-bold whitespace-nowrap">
                              {format(new Date(pred.predictedNextPurchaseDate), 'dd MMM')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Column 8: Actions */}
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProductClick?.(pred);
                        }}
                        className="px-2 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-[10px] font-semibold text-zinc-700 transition-colors shadow-2xs"
                        title="View complete purchase history & intervals"
                      >
                        History
                      </button>
                      <Link
                        to={`/sales/new?customerId=${customerId}&itemId=${pred.itemId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                        title="Create new sale"
                      >
                        <ShoppingCart className="w-3 h-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

