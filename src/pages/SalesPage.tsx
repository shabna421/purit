import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import {
  Barcode,
  Calendar,
  ChevronRight,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { saleService } from '../services/saleService';
import { useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { Customer, InventoryLocation, Item, Sale } from '../types';
import { formatCurrency } from '../utils/currency';
import { getNextInvoiceNumber } from '../utils/invoice';
import { getItemDisplayName } from '../utils/items';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import { getMinimumQuantity, getQuantityInputStep, isValidQuantityForUnit } from '../utils/quantity';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

type EditableSaleLine = {
  itemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

type EditableSaleDraft = {
  id: string;
  customerId: string;
  locationId: string;
  timestampInput: string;
  items: EditableSaleLine[];
  paymentType: 'cash' | 'credit';
  paidAmount: number | '';
  notes: string;
  isGstBill?: boolean;
  taxRate?: number;
  gstBillNumber?: string;
};

function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function buildDraftFromSale(sale: Sale): EditableSaleDraft {
  return {
    id: sale.id,
    customerId: sale.customerId,
    locationId: sale.locationId,
    timestampInput: toDateTimeLocalValue(sale.timestamp),
    items: sale.items.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.quantity * line.unitPrice,
    })),
    paymentType: sale.paymentType,
    paidAmount: sale.paidAmount || '',
    notes: sale.notes || '',
    isGstBill: sale.isGstBill,
    taxRate: sale.taxRate,
    gstBillNumber: sale.gstBillNumber || '',
  };
}

export default function SalesPage() {
  const { currentOrg } = useTenancy();
  const { success, error: notifyError } = useNotifications();
  const { sales, customers, items, locations, loading } = useRealtimeData();
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<EditableSaleDraft | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [itemPickerValue, setItemPickerValue] = useState('');

  const selectedSale = useMemo(() => {
    return selectedSaleId ? sales.find((entry) => entry.id === selectedSaleId) ?? null : null;
  }, [selectedSaleId, sales]);

  const taxRate = currentOrg?.settings?.taxEnabled ? (currentOrg.settings.taxRate || 0) : 0;

  const getCustomerName = (id: string) => customers.find((customer) => customer.id === id)?.name || 'Unknown Customer';
  const getLocationName = (id: string) => locations.find((location) => location.id === id)?.name || 'Unknown Location';
  const getItemObj = (id: string) => items.find((item) => item.id === id);
  const getDue = (sale: Sale) => Math.max(sale.totalAmount - sale.paidAmount, 0);

  const getStatus = (sale: Sale) => {
    const due = getDue(sale);
    if (due === 0) return { label: 'Paid', cls: 'bg-green-100 text-green-700' };
    if (sale.paidAmount > 0) return { label: 'Partial', cls: 'bg-orange-100 text-orange-700' };
    return { label: 'Due', cls: 'bg-red-100 text-red-700' };
  };

  const filteredSales = sales.filter((sale) => (
    getCustomerName(sale.customerId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.id.toLowerCase().includes(searchTerm.toLowerCase())
  ));

  const openEditModal = (sale: Sale) => {
    setEditingSale(buildDraftFromSale(sale));
    setItemPickerValue('');
  };

  const updateEditingSale = (updates: Partial<EditableSaleDraft>) => {
    setEditingSale((current) => current ? { ...current, ...updates } : current);
  };

  const updateEditingItem = (index: number, updates: Partial<EditableSaleLine>) => {
    setEditingSale((current) => {
      if (!current) return current;

      const nextItems = [...current.items];
      const existing = nextItems[index];
      const itemId = updates.itemId ?? existing.itemId;
      const matchedItem = items.find((item) => item.id === itemId);
      const quantity = Math.max(getMinimumQuantity(matchedItem?.unit), updates.quantity ?? existing.quantity);
      const unitPrice = updates.unitPrice ?? (updates.itemId ? matchedItem?.sellingPrice ?? existing.unitPrice : existing.unitPrice);

      nextItems[index] = {
        itemId,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      };

      return {
        ...current,
        items: nextItems,
      };
    });
  };

  const addEditingItem = (itemId: string) => {
    const matchedItem = items.find((item) => item.id === itemId);
    if (!matchedItem) return;

    setEditingSale((current) => {
      if (!current) return current;
      if (current.items.some((line) => line.itemId === itemId)) {
        return current;
      }

      return {
        ...current,
        items: [
          ...current.items,
          {
            itemId,
            quantity: 1,
            unitPrice: matchedItem.sellingPrice,
            subtotal: matchedItem.sellingPrice,
          },
        ],
      };
    });

    setItemPickerValue('');
  };

  const removeEditingItem = (index: number) => {
    setEditingSale((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.filter((_, lineIndex) => lineIndex !== index),
      };
    });
  };

  const handleSaveSale = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentOrg || !editingSale) return;

    const subtotalAmount = editingSale.items.reduce((sum, line) => sum + line.subtotal, 0);
    const activeTaxRate = editingSale.isGstBill
      ? (editingSale.taxRate ?? (currentOrg?.settings?.taxRate ?? 18))
      : 0;
    const taxAmount = editingSale.isGstBill
      ? subtotalAmount * (activeTaxRate / 100)
      : 0;
    const totalAmount = subtotalAmount + taxAmount;
    const paidAmount = editingSale.paymentType === 'cash'
      ? totalAmount
      : typeof editingSale.paidAmount === 'number'
        ? editingSale.paidAmount
        : 0;

    setSaving(true);
    try {
      const invalidLine = editingSale.items.find((line) => {
        const matchedItem = items.find((entry) => entry.id === line.itemId);
        return !matchedItem || !isValidQuantityForUnit(line.quantity, matchedItem.unit);
      });
      if (invalidLine) {
        const matchedItem = items.find((entry) => entry.id === invalidLine.itemId);
        throw new Error(`${matchedItem?.name || 'This item'} has an invalid quantity for its unit.`);
      }

      await saleService.updateSale(currentOrg.id, editingSale.id, {
        customerId: editingSale.customerId,
        locationId: editingSale.locationId,
        items: editingSale.items,
        paidAmount: Math.min(Math.max(paidAmount, 0), totalAmount),
        paymentType: editingSale.paymentType,
        notes: editingSale.notes,
        timestamp: new Date(editingSale.timestampInput).getTime(),
        isGstBill: editingSale.isGstBill || false,
        taxRate: editingSale.isGstBill ? activeTaxRate : 0,
        gstBillNumber: editingSale.isGstBill ? editingSale.gstBillNumber : '',
      });

      setEditingSale(null);
      success('Sale updated successfully');
    } catch (error: any) {
      notifyError(error.message || 'Failed to update sale');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSaleConfirm = async (sale: Sale) => {
    if (!currentOrg) return;

    setDeletingSaleId(sale.id);
    try {
      await saleService.deleteSale(currentOrg.id, sale.id);
      if (selectedSaleId === sale.id) setSelectedSaleId(null);
      if (editingSale?.id === sale.id) setEditingSale(null);
      success('Sale deleted successfully');
    } catch (error: any) {
      notifyError(error.message || 'Failed to delete sale');
    } finally {
      setDeletingSaleId(null);
    }
  };

  const editingSubtotal = editingSale?.items.reduce((sum, line) => sum + line.subtotal, 0) ?? 0;
  const editingSaleTaxRate = editingSale?.taxRate ?? (currentOrg?.settings?.taxRate ?? 18);
  const editingTaxAmount = editingSale?.isGstBill
    ? editingSubtotal * (editingSaleTaxRate / 100)
    : 0;
  const editingFinalTotal = editingSubtotal + editingTaxAmount;
  const editingPaidAmount = typeof editingSale?.paidAmount === 'number' ? editingSale.paidAmount : 0;
  const availableAddableItems = editingSale
    ? items.filter((item) => !editingSale.items.some((line) => line.itemId === item.id))
    : items;

  useEffect(() => {
    if (!editingSale || editingSale.paymentType !== 'cash') return;
    if (editingSale.paidAmount === editingFinalTotal) return;

    setEditingSale((current) => {
      if (!current || current.paymentType !== 'cash') return current;
      return {
        ...current,
        paidAmount: editingFinalTotal,
      };
    });
  }, [editingFinalTotal, editingSale]);

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading sales...</div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Sales</h2>
          <p className="text-sm text-zinc-500">Track and manage your customer orders.</p>
        </div>
        <div className="flex items-center gap-2">
          {currentOrg?.settings?.enableBarcode && (
            <Link
              to="/sales/new?scanner=true"
              className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-zinc-800"
            >
              <Barcode className="h-4 w-4" />
              Scan & Sell
            </Link>
          )}
          <Link
            to="/sales/new"
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            New Sale
          </Link>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by customer or order ID..."
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      {filteredSales.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center text-zinc-500">
          No sales found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSales.map((sale) => {
            const status = getStatus(sale);
            const due = getDue(sale);

            return (
              <button
                key={sale.id}
                type="button"
                onClick={() => setSelectedSaleId(sale.id)}
                className="group w-full rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-bold text-zinc-900">{getCustomerName(sale.customerId)}</p>
                      <p className="font-mono text-xs font-bold text-zinc-400">#{sale.id.slice(-6).toUpperCase()}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSaleToDelete(sale);
                      }}
                      disabled={deletingSaleId === sale.id}
                      className="shrink-0 rounded-xl border border-red-200 p-2 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Delete sale ${sale.id}`}
                    >
                      {deletingSaleId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.cls}`}>
                        {status.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-orange-500" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Date</p>
                    <p className="mt-0.5 text-sm text-zinc-700">{format(sale.timestamp, 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Total</p>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">{formatCurrency(sale.totalAmount, currentOrg?.settings.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Paid</p>
                    <p className="mt-0.5 text-sm font-bold text-green-600">{formatCurrency(sale.paidAmount, currentOrg?.settings.currency)}</p>
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

      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSaleId(null)}
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Sale Details</h3>
                  <p className="font-mono text-xs font-bold text-zinc-400">#{selectedSale.id.slice(-6).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/sales/${selectedSale.id}/invoice`}
                    onClick={() => setSelectedSaleId(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Invoice
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      openEditModal(selectedSale);
                      setSelectedSaleId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleToDelete(selectedSale)}
                    disabled={deletingSaleId === selectedSale.id}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingSaleId === selectedSale.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSaleId(null)}
                    className="rounded-full p-2 transition-colors hover:bg-zinc-100"
                  >
                    <X className="h-5 w-5 text-zinc-400" />
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                {(() => {
                  const status = getStatus(selectedSale);
                  return (
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${status.cls}`}>
                      {status.label}
                    </span>
                  );
                })()}

                <div className="grid grid-cols-1 gap-3">
                  <InfoRow icon={User} label="Customer" value={getCustomerName(selectedSale.customerId)} />
                  <InfoRow icon={Calendar} label="Sale Date" value={format(selectedSale.timestamp, 'MMMM dd, yyyy - HH:mm')} />
                  <InfoRow icon={MapPin} label="Location" value={getLocationName(selectedSale.locationId)} />
                  <InfoRow icon={Receipt} label="Invoice Number" value={selectedSale.isGstBill && selectedSale.gstBillNumber ? selectedSale.gstBillNumber : `#${selectedSale.id.slice(-6).toUpperCase()}`} />
                  <InfoRow icon={CreditCard} label="Payment Type" value={selectedSale.paymentType} />
                  {selectedSale.notes && <InfoRow icon={Tag} label="Notes" value={selectedSale.notes} />}
                </div>

                <div className="overflow-hidden rounded-2xl border border-zinc-100">
                  <div className="bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Items Sold</p>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {selectedSale.items.map((line, index) => {
                      const item = getItemObj(line.itemId);
                      return (
                        <div key={`${line.itemId}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900">{getItemDisplayName(item)}</p>
                            <p className="text-xs text-zinc-500">
                              {line.quantity} x {formatCurrency(line.unitPrice, currentOrg?.settings.currency)}
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

                 <div className="space-y-2.5 rounded-2xl bg-zinc-50 p-4">
                  {selectedSale.isGstBill && (
                    <>
                      <FinRow label="Subtotal" value={formatCurrency(selectedSale.totalAmount - (selectedSale.gstAmount || 0), currentOrg?.settings.currency)} />
                      <FinRow label={`GST (${selectedSale.taxRate ?? 18}%)`} value={formatCurrency(selectedSale.gstAmount || 0, currentOrg?.settings.currency)} />
                    </>
                  )}
                  <FinRow label="Total Amount" value={formatCurrency(selectedSale.totalAmount, currentOrg?.settings.currency)} bold />
                  <FinRow label="Amount Paid" value={formatCurrency(selectedSale.paidAmount, currentOrg?.settings.currency)} green />
                  <FinRow label="Due Amount" value={formatCurrency(getDue(selectedSale), currentOrg?.settings.currency)} red={getDue(selectedSale) > 0} />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingSale && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSale(null)}
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-5">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Edit Sale</h3>
                  <p className="text-sm text-zinc-500">Everything on this sale can be updated here, including items and payment details.</p>
                </div>
                <button type="button" onClick={() => setEditingSale(null)} className="rounded-full p-2 transition-colors hover:bg-zinc-100">
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveSale} className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-bold uppercase text-zinc-400">Customer</label>
                    <AppSelect
                      value={editingSale.customerId}
                      onChange={(value) => updateEditingSale({ customerId: value })}
                      placeholder="Select customer"
                      searchable
                      emptyMessage="No customers found."
                      options={customers.map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                        keywords: `${customer.shopName || ''} ${customer.phone || ''} ${customer.route || ''}`,
                      }))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase text-zinc-400">Sale Date</label>
                    <input
                      type="datetime-local"
                      value={editingSale.timestampInput}
                      onChange={(event) => updateEditingSale({ timestampInput: event.target.value })}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase text-zinc-400">Location</label>
                    <AppSelect
                      value={editingSale.locationId}
                      onChange={(value) => updateEditingSale({ locationId: value })}
                      placeholder="Select location"
                      options={locations.map((location) => ({
                        value: location.id,
                        label: `${location.name} (${location.type})`,
                      }))}
                    />
                  </div>

                  {currentOrg?.settings?.taxEnabled && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-700">GST Bill ({currentOrg.settings.taxRate || 18}%)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !editingSale.isGstBill;
                            const lastNum = currentOrg?.settings?.lastGstInvoiceNumber;
                            updateEditingSale({
                              isGstBill: nextVal,
                              gstBillNumber: nextVal ? (editingSale.gstBillNumber || getNextInvoiceNumber(lastNum)) : '',
                            });
                          }}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            editingSale.isGstBill ? 'bg-orange-500' : 'bg-zinc-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              editingSale.isGstBill ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                      {editingSale.isGstBill && (
                        <div className="mt-1">
                          <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">
                            GST Bill Number / Custom Invoice ID <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={editingSale.gstBillNumber || ''}
                            onChange={(event) => updateEditingSale({ gstBillNumber: event.target.value })}
                            placeholder="e.g. GST-2026-0001"
                            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-200 p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-zinc-900">Items</p>
                      <p className="text-xs text-zinc-500">Add, remove, or change any product line from this modal.</p>
                    </div>
                    <div className="w-full sm:max-w-xs">
                      <AppSelect
                        value={itemPickerValue}
                        onChange={(value) => {
                          setItemPickerValue(value);
                          if (value) addEditingItem(value);
                        }}
                        placeholder="Add item"
                        searchable
                        emptyMessage="No more items to add."
                        options={availableAddableItems.map((item) => ({
                          value: item.id,
                          label: getItemDisplayName(item),
                          keywords: `${item.sku || ''} ${item.barcode || ''}`,
                        }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {editingSale.items.map((line, index) => {
                      const item = getItemObj(line.itemId);
                      return (
                        <div key={`${line.itemId}-${index}`} className="rounded-2xl bg-zinc-50 p-3">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_100px_120px_auto] lg:items-end">
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Item</label>
                              <AppSelect
                                value={line.itemId}
                                onChange={(value) => updateEditingItem(index, { itemId: value })}
                                searchable
                                emptyMessage="No items found."
                                options={items.map((entry) => ({
                                  value: entry.id,
                                  label: getItemDisplayName(entry),
                                  keywords: `${entry.sku || ''} ${entry.barcode || ''}`,
                                }))}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Qty</label>
                              <input
                                type="number"
                                min={String(getMinimumQuantity(item?.unit))}
                                step={String(getQuantityInputStep(item?.unit))}
                                value={formatNumericInput(line.quantity)}
                                onChange={(event) => updateEditingItem(index, {
                                  quantity: parseNumericInput(event.target.value) || getMinimumQuantity(item?.unit),
                                })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Unit Price</label>
                              <input
                                type="number"
                                min="0"
                                value={formatNumericInput(line.unitPrice)}
                                onChange={(event) => updateEditingItem(index, { unitPrice: parseNumericInput(event.target.value) || 0 })}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeEditingItem(index)}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                            <span>{item?.sku ? `SKU: ${item.sku}` : 'No SKU'}</span>
                            <span className="font-semibold text-zinc-700">{formatCurrency(line.subtotal, currentOrg?.settings.currency)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {editingSale.items.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500">
                        Add at least one item to save this sale.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-zinc-400">Payment Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cash', 'credit'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          const nextPaidAmount = type === 'cash'
                            ? editingFinalTotal
                            : editingSale.paymentType === 'cash'
                              ? 0
                              : editingSale.paidAmount;

                          updateEditingSale({
                            paymentType: type,
                            paidAmount: nextPaidAmount,
                          });
                        }}
                        className={`rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all ${editingSale.paymentType === type ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Paid Amount</label>
                  <input
                    type="number"
                    min="0"
                    max={editingFinalTotal}
                    step="0.01"
                    disabled={editingSale.paymentType === 'cash'}
                    value={formatNumericInput(typeof editingSale.paidAmount === 'number' ? editingSale.paidAmount : undefined)}
                    onChange={(event) => {
                      const value = parseNumericInput(event.target.value);
                      updateEditingSale({ paidAmount: value === undefined ? '' : Math.min(value, editingFinalTotal) });
                    }}
                    placeholder={editingSale.paymentType === 'cash' ? 'Auto-filled for cash sales' : '0'}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                  />
                  {editingSale.paymentType === 'cash' && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Cash sales always stay fully paid so dues, reports, and invoice totals stay in sync.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Notes</label>
                  <textarea
                    value={editingSale.notes}
                    onChange={(event) => updateEditingSale({ notes: event.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </div>

                 <div className="space-y-2.5 rounded-2xl bg-zinc-50 p-4">
                  <FinRow label="Subtotal" value={formatCurrency(editingSubtotal, currentOrg?.settings.currency)} />
                  {editingSale?.isGstBill && (
                    <FinRow label={`GST (${editingSale.taxRate ?? (currentOrg?.settings?.taxRate ?? 18)}%)`} value={formatCurrency(editingTaxAmount, currentOrg?.settings.currency)} />
                  )}
                  <FinRow label="Total Amount" value={formatCurrency(editingFinalTotal, currentOrg?.settings.currency)} bold />
                  <FinRow label="Due Amount" value={formatCurrency(Math.max(editingFinalTotal - editingPaidAmount, 0), currentOrg?.settings.currency)} red />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const linkedSale = sales.find((sale) => sale.id === editingSale.id);
                      if (linkedSale) {
                        setSaleToDelete(linkedSale);
                      }
                    }}
                    disabled={saving || deletingSaleId === editingSale.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingSaleId === editingSale.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                    Delete
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !editingSale.customerId || !editingSale.locationId || editingSale.items.length === 0}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-bold text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Pencil className="h-5 w-5" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!saleToDelete}
        onClose={() => setSaleToDelete(null)}
        onConfirm={async () => {
          if (saleToDelete) {
            await handleDeleteSaleConfirm(saleToDelete);
          }
        }}
        title="Delete Sale Transaction?"
        message={`Are you sure you want to permanently delete sale #${saleToDelete?.id.slice(-6).toUpperCase()} of amount ${saleToDelete ? formatCurrency(saleToDelete.totalAmount, currentOrg?.settings.currency) : ''}? This will permanently restore associated items stock and delete the sale transaction log. This action cannot be undone.`}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-zinc-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

function FinRow({
  label,
  value,
  bold,
  green,
  red,
}: {
  label: string;
  value: string;
  bold?: boolean;
  green?: boolean;
  red?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-zinc-600">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-zinc-900' : ''} ${green ? 'font-bold text-green-600' : ''} ${red ? 'font-bold text-red-600' : ''}`}>
        {value}
      </span>
    </div>
  );
}
