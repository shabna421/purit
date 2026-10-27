import React, { useState, useEffect } from 'react';
import { useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { 
  Plus, Search, Trash2, Pencil, X, Droplets, Package, 
  Layers, User, Calendar, FileText, ArrowUpDown, Filter, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import { formatCurrency } from '../utils/currency';

export interface DispenserRecord {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  customerId?: string;
  customerName?: string;
  notes?: string;
  date: string;
  createdAt: number;
}

const DEFAULT_DISPENSERS: DispenserRecord[] = [
  {
    id: 'disp-1',
    itemName: 'Tissue Dispenser (TD)',
    quantity: 3,
    unitPrice: 2000,
    totalAmount: 6000,
    customerName: 'Kattans Feroke',
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now() - 86400000 * 2,
    notes: 'Installed in washroom 1 & 2',
  },
  {
    id: 'disp-2',
    itemName: 'Foam Hand Wash Dispenser (FHB)',
    quantity: 2,
    unitPrice: 3000,
    totalAmount: 6000,
    customerName: 'Kattans Feroke',
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now() - 86400000,
    notes: 'Dining area sink',
  },
];

const SUGGESTED_ITEMS = [
  'Tissue Dispenser (TD)',
  'Foam Hand Wash Dispenser (FHB)',
  'Liquid Soap Dispenser',
  'Paper Towel Dispenser',
  'Automatic Sanitizer Dispenser',
];

export default function DispensersPage() {
  const { currentOrg } = useTenancy();
  const { customers } = useRealtimeData();
  const { success, error: notifyError } = useNotifications();

  const storageKey = `purit_dispensers_${currentOrg?.id || 'default'}`;

  const [dispensers, setDispensers] = useState<DispenserRecord[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
      return DEFAULT_DISPENSERS;
    } catch {
      return DEFAULT_DISPENSERS;
    }
  });

  // Real-time synchronization when customer dispensers change
  useEffect(() => {
    const handleSync = (e: any) => {
      if (e?.detail) {
        setDispensers(e.detail);
      } else {
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) setDispensers(JSON.parse(saved));
        } catch {}
      }
    };

    window.addEventListener('purit_dispensers_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('purit_dispensers_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [storageKey]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDispenser, setEditingDispenser] = useState<DispenserRecord | null>(null);

  // Form states
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [unitPrice, setUnitPrice] = useState<number | ''>(2000);
  const [totalAmount, setTotalAmount] = useState<number | ''>(2000);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Sync to localStorage
  const saveDispensers = (data: DispenserRecord[]) => {
    setDispensers(data);
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save dispensers to localStorage:', e);
    }
  };

  // Recalculate total amount when quantity or unitPrice changes
  const handleQuantityChange = (val: number | '') => {
    setQuantity(val);
    const q = typeof val === 'number' ? val : 0;
    const p = typeof unitPrice === 'number' ? unitPrice : 0;
    setTotalAmount(q * p);
  };

  const handleUnitPriceChange = (val: number | '') => {
    setUnitPrice(val);
    const q = typeof quantity === 'number' ? quantity : 0;
    const p = typeof val === 'number' ? val : 0;
    setTotalAmount(q * p);
  };

  const openAddModal = () => {
    setEditingDispenser(null);
    setItemName('Tissue Dispenser (TD)');
    setQuantity(1);
    setUnitPrice(2000);
    setTotalAmount(2000);
    setSelectedCustomerId('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const openEditModal = (dispenser: DispenserRecord) => {
    setEditingDispenser(dispenser);
    setItemName(dispenser.itemName);
    setQuantity(dispenser.quantity);
    setUnitPrice(dispenser.unitPrice);
    setTotalAmount(dispenser.totalAmount);
    setSelectedCustomerId(dispenser.customerId || '');
    setNotes(dispenser.notes || '');
    setDate(dispenser.date || new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      notifyError('Please enter or select an item name');
      return;
    }
    const q = typeof quantity === 'number' ? quantity : 1;
    if (q <= 0) {
      notifyError('Quantity must be greater than 0');
      return;
    }
    const u = typeof unitPrice === 'number' ? unitPrice : 0;
    const tot = typeof totalAmount === 'number' ? totalAmount : q * u;

    const matchedCust = customers?.find((c) => c.id === selectedCustomerId);

    if (editingDispenser) {
      const updated = dispensers.map((d) =>
        d.id === editingDispenser.id
          ? {
              ...d,
              itemName: itemName.trim(),
              quantity: q,
              unitPrice: u,
              totalAmount: tot,
              customerId: selectedCustomerId || undefined,
              customerName: matchedCust ? (matchedCust.shopName ? `${matchedCust.name} (${matchedCust.shopName})` : matchedCust.name) : undefined,
              notes: notes.trim() || undefined,
              date,
            }
          : d
      );
      saveDispensers(updated);
      success('Dispenser item updated successfully');
    } else {
      const newRecord: DispenserRecord = {
        id: `disp-${Date.now()}`,
        itemName: itemName.trim(),
        quantity: q,
        unitPrice: u,
        totalAmount: tot,
        customerId: selectedCustomerId || undefined,
        customerName: matchedCust ? (matchedCust.shopName ? `${matchedCust.name} (${matchedCust.shopName})` : matchedCust.name) : undefined,
        notes: notes.trim() || undefined,
        date,
        createdAt: Date.now(),
      };
      saveDispensers([newRecord, ...dispensers]);
      success('Dispenser item added successfully');
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this dispenser record?')) {
      saveDispensers(dispensers.filter((d) => d.id !== id));
      success('Dispenser record deleted');
    }
  };

  // Filtered dispensers
  const filteredDispensers = dispensers.filter((d) => {
    const matchesSearch =
      d.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.customerName && d.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.notes && d.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCustomer =
      selectedCustomerFilter === 'all' ||
      (selectedCustomerFilter === 'unassigned' ? !d.customerId : d.customerId === selectedCustomerFilter);

    return matchesSearch && matchesCustomer;
  });

  // KPI calculations
  const totalQuantitySum = dispensers.reduce((sum, d) => sum + (d.quantity || 0), 0);
  const totalValueSum = dispensers.reduce((sum, d) => sum + (d.totalAmount || 0), 0);
  const uniqueItemsCount = new Set(dispensers.map((d) => d.itemName.toLowerCase())).size;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-100/80 text-orange-600 flex items-center justify-center shadow-xs">
              <Droplets className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Dispensers</h2>
              <p className="text-sm text-zinc-500">Manage dispenser items, quantities, and amount valuations.</p>
            </div>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl font-semibold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all text-sm shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Add Dispenser
        </button>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Quantity</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-zinc-900 tracking-tight">{totalQuantitySum}</p>
          <p className="mt-1 text-xs text-zinc-500">Dispensers logged</p>
        </div>

        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Value</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Droplets className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-600 tracking-tight">
            {formatCurrency(totalValueSum, currentOrg?.settings.currency)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Combined dispenser valuation</p>
        </div>

        <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Item Types</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-zinc-900 tracking-tight">{uniqueItemsCount}</p>
          <p className="mt-1 text-xs text-zinc-500">Different models & dispenser kinds</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by dispenser item, customer, notes..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-2xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {customers && customers.length > 0 && (
          <div className="sm:w-64">
            <select
              value={selectedCustomerFilter}
              onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-2xs"
            >
              <option value="all">All Customers</option>
              <option value="unassigned">Unassigned / General</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.shopName ? `(${c.shopName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Dispensers List */}
      {filteredDispensers.length === 0 ? (
        <div className="py-16 text-center bg-white border border-zinc-200/90 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mx-auto">
            <Droplets className="w-8 h-8 stroke-[1.8]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">No dispensers found</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-1">
              {searchTerm || selectedCustomerFilter !== 'all'
                ? 'Try adjusting your search query or customer filter.'
                : 'Get started by adding your first dispenser item, quantity, and amount.'}
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-100"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add Dispenser
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDispensers.map((disp) => (
            <div
              key={disp.id}
              className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-2xs hover:shadow-md hover:border-orange-200 transition-all flex flex-col justify-between gap-4 group"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 border border-orange-100/80 flex items-center justify-center shrink-0 mt-0.5">
                      <Droplets className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-zinc-900 tracking-tight leading-snug">
                        {disp.itemName}
                      </h4>
                      {disp.customerName ? (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-500">
                          <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{disp.customerName}</span>
                        </div>
                      ) : (
                        <span className="inline-block mt-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                          General Stock
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(disp)}
                      className="w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition-colors"
                      title="Edit Dispenser"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(disp.id)}
                      className="w-7 h-7 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                      title="Delete Dispenser"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {disp.notes && (
                  <p className="text-xs text-zinc-500 mt-3 bg-zinc-50/80 border border-zinc-100 rounded-xl px-3 py-2 line-clamp-2">
                    {disp.notes}
                  </p>
                )}
              </div>

              {/* Amount and Quantity Breakdown Row */}
              <div className="pt-3 border-t border-zinc-100 flex items-end justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">QUANTITY</span>
                  <div className="text-lg font-extrabold text-zinc-900 tracking-tight mt-0.5">
                    {disp.quantity} <span className="text-xs font-semibold text-zinc-400">units</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-medium">
                    @ {formatCurrency(disp.unitPrice, currentOrg?.settings.currency)}/unit
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">TOTAL AMOUNT</span>
                  <div className="text-xl font-black text-emerald-600 tracking-tight mt-0.5">
                    {formatCurrency(disp.totalAmount, currentOrg?.settings.currency)}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-medium flex items-center justify-end gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-zinc-400" />
                    <span>{disp.date}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl border border-zinc-200/90 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center shadow-2xs">
                    <Droplets className="w-4.5 h-4.5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      {editingDispenser ? 'Edit Dispenser' : 'Add Dispenser'}
                    </h3>
                    <p className="text-xs text-zinc-500">Record dispenser item, quantity, and amount</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
                {/* Item Name */}
                <div>
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                    Dispenser Item Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tissue Dispenser (TD)"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                  {/* Quick suggestion tags */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SUGGESTED_ITEMS.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setItemName(sug)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                          itemName === sug
                            ? 'bg-orange-50 text-orange-700 border-orange-200 font-semibold'
                            : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity and Unit Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                      Quantity *
                    </label>
                    <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(Math.max(1, (Number(quantity) || 1) - 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-bold text-zinc-600 hover:bg-zinc-100 text-sm shadow-2xs"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        required
                        value={quantity}
                        onChange={(e) => handleQuantityChange(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent text-center font-bold text-zinc-900 text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange((Number(quantity) || 0) + 1)}
                        className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center font-bold text-zinc-600 hover:bg-zinc-100 text-sm shadow-2xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                      Unit Price ({currentOrg?.settings.currency || '₹'})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 2000"
                      value={unitPrice}
                      onChange={(e) => handleUnitPriceChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                  </div>
                </div>

                {/* Total Amount */}
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                      Calculated Total Amount
                    </span>
                    <span className="text-xs text-emerald-600">
                      {quantity || 0} unit(s) × {formatCurrency(Number(unitPrice) || 0, currentOrg?.settings.currency)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-emerald-700">
                      {formatCurrency(Number(totalAmount) || 0, currentOrg?.settings.currency)}
                    </span>
                  </div>
                </div>

                {/* Customer Assignment (Optional) */}
                <div>
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                    Assign to Customer (Optional)
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  >
                    <option value="">-- General Stock / Unassigned --</option>
                    {customers?.map((cust) => (
                      <option key={cust.id} value={cust.id}>
                        {cust.name} {cust.shopName ? `(${cust.shopName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider block mb-1">
                    Notes / Location Details (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Washroom dispenser, warranty details, placement notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>

                {/* Submit Actions */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold shadow-md shadow-orange-100 hover:bg-orange-600 transition-all"
                  >
                    {editingDispenser ? 'Save Changes' : 'Add Dispenser'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
