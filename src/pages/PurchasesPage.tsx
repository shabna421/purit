import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Search, PackagePlus, X, ChevronRight, Building2, Calendar, Receipt, Wallet, Tag } from 'lucide-react';
import { useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { Purchase, Supplier, InventoryLocation, Item } from '../types';
import { formatCurrency } from '../utils/currency';
import { getItemDisplayName } from '../utils/items';
import { motion, AnimatePresence } from 'motion/react';

export default function PurchasesPage() {
  const { currentOrg } = useTenancy();
  const { purchases, suppliers, locations, items, loading } = useRealtimeData();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const selectedPurchase = useMemo(() => {
    return selectedPurchaseId ? purchases.find((entry) => entry.id === selectedPurchaseId) ?? null : null;
  }, [selectedPurchaseId, purchases]);

  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || 'Unknown Supplier';
  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || 'Unknown Location';
  const getItemObj = (id: string) => items.find(i => i.id === id);
  const getDue = (p: Purchase) => Math.max(p.totalAmount - p.paidAmount, 0);

  const getStatus = (p: Purchase) => {
    const due = getDue(p);
    if (due === 0) return { label: 'Paid', cls: 'bg-green-100 text-green-700' };
    if (p.paidAmount > 0) return { label: 'Partial', cls: 'bg-orange-100 text-orange-700' };
    return { label: 'Unpaid', cls: 'bg-red-100 text-red-700' };
  };

  const filteredPurchases = purchases.filter(p =>
    getSupplierName(p.supplierId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading purchases...</div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Purchases</h2>
          <p className="text-sm text-zinc-500">Receive stock from suppliers and track incoming inventory.</p>
        </div>
        <Link
          to="/purchases/new"
          className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New Purchase
        </Link>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by supplier or purchase ID..."
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Cards */}
      {filteredPurchases.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center text-zinc-500">
          No purchases found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPurchases.map(purchase => {
            const status = getStatus(purchase);
            const due = getDue(purchase);
            return (
              <button
                key={purchase.id}
                type="button"
                onClick={() => setSelectedPurchaseId(purchase.id)}
                className="group w-full rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              >
                {/* Header */}
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <PackagePlus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-zinc-900">{getSupplierName(purchase.supplierId)}</p>
                      <p className="font-mono text-xs font-bold text-zinc-400">#{purchase.id.slice(-6).toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-orange-500" />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Date</p>
                    <p className="mt-0.5 text-sm text-zinc-700">{format(purchase.timestamp, 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Total</p>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">{formatCurrency(purchase.totalAmount, currentOrg?.settings.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Paid</p>
                    <p className="mt-0.5 text-sm font-bold text-green-600">{formatCurrency(purchase.paidAmount, currentOrg?.settings.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Due</p>
                    <p className={`mt-0.5 text-sm font-bold ${due > 0 ? 'text-red-600' : 'text-zinc-400'}`}>
                      {formatCurrency(due, currentOrg?.settings.currency)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPurchaseId(null)}
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Purchase Details</h3>
                  <p className="font-mono text-xs font-bold text-zinc-400">
                    #{selectedPurchase.id.slice(-6).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPurchaseId(null)}
                  className="rounded-full p-2 hover:bg-zinc-100 transition-colors"
                >
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-4 p-5">
                {/* Status Badge */}
                {(() => {
                  const status = getStatus(selectedPurchase);
                  return (
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                  );
                })()}

                {/* Info Cards */}
                <div className="grid grid-cols-1 gap-3">
                  <InfoRow icon={Building2} label="Supplier" value={getSupplierName(selectedPurchase.supplierId)} />
                  <InfoRow icon={Calendar} label="Purchase Date" value={format(selectedPurchase.timestamp, 'MMMM dd, yyyy · HH:mm')} />
                  <InfoRow icon={Receipt} label="Invoice Number" value={`#${selectedPurchase.id.slice(-6).toUpperCase()}`} />
                  {selectedPurchase.notes && (
                    <InfoRow icon={Tag} label="Notes" value={selectedPurchase.notes} />
                  )}
                </div>

                {/* Item-wise Table */}
                <div className="overflow-hidden rounded-2xl border border-zinc-100">
                  <div className="bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Items Purchased</p>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {selectedPurchase.items.map((line, idx) => {
                      const item = getItemObj(line.itemId);
                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900">{getItemDisplayName(item)}</p>
                            <p className="text-xs text-zinc-500">
                              {line.quantity} × {formatCurrency(line.unitCost, currentOrg?.settings.currency)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-zinc-900">
                            {formatCurrency(line.subtotal, currentOrg?.settings.currency)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financials Summary */}
                <div className="rounded-2xl bg-zinc-50 p-4 space-y-2.5">
                  <FinRow label="Subtotal" value={formatCurrency(selectedPurchase.totalAmount, currentOrg?.settings.currency)} />
                  <FinRow label="Tax" value={formatCurrency(0, currentOrg?.settings.currency)} muted />
                  <FinRow label="Discount" value={formatCurrency(0, currentOrg?.settings.currency)} muted />
                  <div className="border-t border-zinc-200 pt-2.5">
                    <FinRow label="Grand Total" value={formatCurrency(selectedPurchase.totalAmount, currentOrg?.settings.currency)} bold />
                  </div>
                  <FinRow label="Amount Paid" value={formatCurrency(selectedPurchase.paidAmount, currentOrg?.settings.currency)} green />
                  <FinRow
                    label="Due Balance"
                    value={formatCurrency(getDue(selectedPurchase), currentOrg?.settings.currency)}
                    red={getDue(selectedPurchase) > 0}
                  />
                </div>
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
    <div className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-zinc-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-900 break-words">{value}</p>
      </div>
    </div>
  );
}

function FinRow({
  label, value, bold, green, red, muted,
}: {
  label: string; value: string; bold?: boolean; green?: boolean; red?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-sm ${muted ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-zinc-900' : ''} ${green ? 'font-bold text-green-600' : ''} ${red ? 'font-bold text-red-600' : ''} ${muted ? 'text-zinc-400' : ''}`}>
        {value}
      </span>
    </div>
  );
}
