import React, { useMemo } from 'react';
import {
  X,
  RotateCcw,
  Calendar,
  Clock,
  AlertTriangle,
  CalendarCheck,
  TrendingUp,
  Package,
  ShoppingCart,
  ArrowRight,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Customer, Sale } from '../../types';
import {
  ProductRepurchasePrediction,
  getProductPurchaseHistory,
  formatConsumptionRate,
} from '../../utils/repurchasePrediction';

interface ProductPurchaseHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | { id: string; name: string; shopName?: string; phone?: string };
  prediction: ProductRepurchasePrediction;
  sales: Sale[];
  currency?: string;
}

export const ProductPurchaseHistoryModal: React.FC<ProductPurchaseHistoryModalProps> = ({
  isOpen,
  onClose,
  customer,
  prediction,
  sales,
  currency = 'INR',
}) => {
  // Extract all chronological purchase records for this customer and product
  const purchaseHistory = useMemo(() => {
    return getProductPurchaseHistory(
      sales,
      customer.id,
      prediction.itemId,
      prediction.unit
    );
  }, [sales, customer.id, prediction.itemId, prediction.unit]);

  if (!isOpen) return null;

  // Status badge styling
  let statusBadgeStyle = 'bg-zinc-100 text-zinc-700 border-zinc-200';
  let statusDotColor = 'bg-zinc-400';
  let statusIcon = <Clock className="w-4 h-4 text-zinc-500" />;

  if (prediction.status === 'upcoming') {
    statusBadgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    statusDotColor = 'bg-emerald-500';
    statusIcon = <CalendarCheck className="w-4 h-4 text-emerald-600" />;
  } else if (prediction.status === 'due_today') {
    statusBadgeStyle = 'bg-amber-50 text-amber-900 border-amber-300';
    statusDotColor = 'bg-amber-500 animate-ping';
    statusIcon = <Clock className="w-4 h-4 text-amber-600" />;
  } else if (prediction.status === 'overdue') {
    statusBadgeStyle = 'bg-rose-50 text-rose-800 border-rose-300';
    statusDotColor = 'bg-rose-500';
    statusIcon = <AlertTriangle className="w-4 h-4 text-rose-600" />;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative w-full max-w-2xl rounded-3xl bg-white border border-zinc-200/90 shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-4.5 border-b border-zinc-100 flex items-start justify-between gap-4 bg-zinc-50/50">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0 mt-0.5 shadow-2xs">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 truncate">
                    {prediction.itemName}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                    {prediction.unit}
                  </span>
                  {prediction.sku && (
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                      {prediction.sku}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-1">
                  <span className="font-semibold text-zinc-700">{customer.name}</span>
                  {customer.shopName && (
                    <>
                      <span className="text-zinc-300">•</span>
                      <span>{customer.shopName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition-colors shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
            {/* Status Highlight Banner */}
            <div className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${statusBadgeStyle}`}>
              <div className="flex items-center gap-2.5">
                <div className="shrink-0">{statusIcon}</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider opacity-80">Rolling Repurchase Status</div>
                  <div className="text-sm sm:text-base font-extrabold flex items-center gap-2 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
                    <span>{prediction.statusLabel}</span>
                  </div>
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-current/10">
                <div className="text-[11px] opacity-80 font-medium">Predicted Next Order</div>
                <div className="text-sm font-bold mt-0.5">
                  {prediction.predictedNextPurchaseDate
                    ? format(new Date(prediction.predictedNextPurchaseDate), 'dd MMMM yyyy')
                    : 'Insufficient History'}
                </div>
              </div>
            </div>

            {/* 4 Summary Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Stat 1: Total Bought */}
              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total Purchased</span>
                <p className="text-sm font-extrabold text-zinc-900 mt-1">
                  {purchaseHistory.reduce((sum, r) => sum + r.quantity, 0)} {prediction.unit}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{purchaseHistory.length} orders recorded</p>
              </div>

              {/* Stat 2: Daily Consumption */}
              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Daily Consumption</span>
                <p className="text-sm font-extrabold text-zinc-900 mt-1">
                  {formatConsumptionRate(prediction.averageDailyConsumption, prediction.unit)}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Weighted avg rate</p>
              </div>

              {/* Stat 3: Avg Interval */}
              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Avg Interval</span>
                <p className="text-sm font-extrabold text-zinc-900 mt-1">
                  {prediction.completedCyclesCount > 0
                    ? `${(prediction.totalCycleDays / prediction.completedCyclesCount).toFixed(1)} days`
                    : '—'}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {prediction.completedCyclesCount} cycle{prediction.completedCyclesCount === 1 ? '' : 's'} completed
                </p>
              </div>

              {/* Stat 4: Last Purchase */}
              <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Last Purchase</span>
                <p className="text-sm font-extrabold text-zinc-900 mt-1">
                  {prediction.lastPurchaseQuantity} {prediction.unit}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {format(new Date(prediction.lastPurchaseDate), 'dd MMM yyyy')}
                </p>
              </div>
            </div>

            {/* Complete Transaction History Table */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span>Product Purchase History & Cycle Intervals</span>
                </h4>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {purchaseHistory.length} transaction{purchaseHistory.length === 1 ? '' : 's'}
                </span>
              </div>

              {purchaseHistory.length === 0 ? (
                <div className="p-6 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 text-zinc-500 text-xs">
                  No previous purchases found for this product.
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[540px]">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Purchase Date</th>
                          <th className="py-2.5 px-3">Invoice #</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Interval (Days)</th>
                          <th className="py-2.5 px-3 text-right">Consumption</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
                        {purchaseHistory.map((item, index) => {
                          const isLatest = index === purchaseHistory.length - 1;
                          return (
                            <tr key={item.saleId + index} className={isLatest ? 'bg-orange-50/20' : 'hover:bg-zinc-50/50'}>
                              <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
                                {index + 1}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-zinc-900 block">
                                  {format(new Date(item.timestamp), 'dd MMM yyyy')}
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {format(new Date(item.timestamp), 'hh:mm a')}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {item.invoiceNumber ? (
                                  <span className="font-mono text-[11px] font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded">
                                    #{item.invoiceNumber}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 font-mono text-[11px]">
                                    #{item.saleId.slice(-6).toUpperCase()}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className="font-bold text-zinc-900 font-mono">
                                  {item.quantity} {prediction.unit}
                                </span>
                                {item.totalAmount ? (
                                  <span className="block text-[10px] text-zinc-400">
                                    ₹{item.totalAmount.toLocaleString()}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {item.daysSincePrevious === null ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-500">
                                    Initial Order
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 font-mono">
                                    +{item.daysSincePrevious} day{item.daysSincePrevious === 1 ? '' : 's'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {item.dailyConsumptionForCycle !== null && item.dailyConsumptionForCycle !== undefined ? (
                                  <span className="font-mono font-bold text-zinc-800 text-[11px]">
                                    {item.dailyConsumptionForCycle >= 10
                                      ? item.dailyConsumptionForCycle.toFixed(1)
                                      : item.dailyConsumptionForCycle.toFixed(2)}{' '}
                                    {prediction.unit}/day
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Prediction Algorithm Explanation Footer */}
                  <div className="p-3 bg-zinc-50 border-t border-zinc-200 text-[11px] text-zinc-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-zinc-800">
                      <Info className="w-3.5 h-3.5 text-orange-600" />
                      <span>Prediction Formula Breakdown:</span>
                    </div>
                    {prediction.completedCyclesCount > 0 ? (
                      <p className="text-zinc-500 pl-5 leading-relaxed">
                        • <strong>Step 1:</strong> Historical purchase intervals: {prediction.cycles.map((c) => `${c.intervalDays}d`).join(', ')}.<br />
                        • <strong>Step 2:</strong> Average consumption = {prediction.totalQuantityConsumed} {prediction.unit} ÷ {prediction.totalCycleDays} total cycle days = <strong>{prediction.averageDailyConsumption?.toFixed(2)} {prediction.unit}/day</strong>.<br />
                        • <strong>Step 3:</strong> Next reorder = Latest purchase ({prediction.lastPurchaseQuantity} {prediction.unit}) ÷ {prediction.averageDailyConsumption?.toFixed(2)} = <strong>~{prediction.estimatedDaysToNextPurchase} days</strong> ({prediction.predictedNextPurchaseDate ? format(new Date(prediction.predictedNextPurchaseDate), 'dd MMM yyyy') : '—'}).
                      </p>
                    ) : (
                      <p className="text-zinc-500 pl-5">
                        Only 1 purchase recorded. At least 2 purchase dates are required to calculate the customer's average reorder interval and daily consumption.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-5 sm:px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
            >
              Close
            </button>

            <Link
              to={`/sales/new?customerId=${customer.id}&itemId=${prediction.itemId}`}
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-xs shadow-orange-500/20 transition-all active:scale-[0.98]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Create New Bill / Reorder</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

