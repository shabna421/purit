import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenancy, useAuth } from '../contexts';
import { purchaseService } from '../services/purchaseService';
import { Purchase, Supplier } from '../types';
import { Building2, ChevronRight, Phone, Plus, Search, Pencil, Trash2, Wallet, HandCoins, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import { formatCurrency } from '../utils/currency';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

type SupplierStats = {
  supplier: Supplier;
  totalPurchases: number;
  totalPaid: number;
  dueBalance: number;
  purchaseCount: number;
};

const emptySupplierForm: Partial<Supplier> = {
  name: '',
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  balance: 0,
};

export default function SuppliersPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>(emptySupplierForm);
  
  // Balance management states
  const [balanceSupplier, setBalanceSupplier] = useState<Supplier | null>(null);
  const [balanceAction, setBalanceAction] = useState<'pay-supplier' | 'add-due' | 'write-off'>('pay-supplier');
  const [balanceAmount, setBalanceAmount] = useState<number | ''>('');
  const [balanceMethod, setBalanceMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [balanceNotes, setBalanceNotes] = useState('');
  
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

  useEffect(() => {
    if (currentOrg) {
      loadData();
    }
  }, [currentOrg]);

  const loadData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const [supplierData, purchaseData] = await Promise.all([
        purchaseService.getSuppliers(currentOrg.id),
        purchaseService.getPurchases(currentOrg.id),
      ]);
      setSuppliers(supplierData);
      setPurchases(purchaseData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingSupplier(null);
    setSupplierForm(emptySupplierForm);
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, supplier: Supplier) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      companyName: supplier.companyName || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      balance: supplier.balance || 0,
    });
    setIsModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        await purchaseService.updateSupplier(currentOrg.id, editingSupplier.id, supplierForm);
      } else {
        await purchaseService.createSupplier(currentOrg.id, supplierForm);
      }
      setIsModalOpen(false);
      setSupplierForm(emptySupplierForm);
      setEditingSupplier(null);
      success(editingSupplier ? 'Supplier updated successfully' : 'Supplier created successfully');
      loadData();
    } catch (error) {
      console.error('Error saving supplier:', error);
      notifyError(editingSupplier ? 'Failed to update supplier' : 'Failed to create supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openBalanceModal = (e: React.MouseEvent, supplier: Supplier, action: 'pay-supplier' | 'add-due' | 'write-off' = 'pay-supplier') => {
    e.preventDefault();
    e.stopPropagation();
    setBalanceSupplier(supplier);
    setBalanceAction(action);
    setBalanceAmount('');
    setBalanceMethod('cash');
    setBalanceNotes('');
  };

  const closeBalanceModal = () => {
    setBalanceSupplier(null);
    setBalanceAmount('');
    setBalanceNotes('');
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !balanceSupplier) return;

    setIsSubmitting(true);
    try {
      await purchaseService.createSupplierBalanceTransaction(currentOrg.id, user.uid, {
        supplierId: balanceSupplier.id,
        amount: typeof balanceAmount === 'number' ? balanceAmount : 0,
        action: balanceAction,
        paymentMethod: balanceMethod,
        notes: balanceNotes,
      });
      closeBalanceModal();
      success(
        balanceAction === 'add-due'
          ? 'Supplier due increased successfully'
          : balanceAction === 'write-off'
            ? 'Supplier balance reduced successfully'
            : 'Payment made to supplier successfully'
      );
      loadData();
    } catch (error: any) {
      console.error('Error updating supplier balance:', error);
      notifyError(error.message || 'Failed to update supplier balance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!currentOrg) return;
    if (supplier.balance > 0) {
      notifyError('Clear the pending amount before deleting this supplier.');
      return;
    }

    setIsSubmitting(true);
    try {
      await purchaseService.deleteSupplier(currentOrg.id, supplier.id);
      success('Supplier deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      notifyError(error.message || 'Failed to delete supplier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const supplierStats = useMemo<SupplierStats[]>(() => {
    return suppliers.map((supplier) => {
      const supplierPurchases = purchases.filter((purchase) => purchase.supplierId === supplier.id);
      const totalPurchases = supplierPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
      const totalPaid = supplierPurchases.reduce((sum, purchase) => sum + purchase.paidAmount, 0);
      const dueBalance = supplier.balance || 0;

      return {
        supplier,
        totalPurchases,
        totalPaid,
        dueBalance,
        purchaseCount: supplierPurchases.length,
      };
    });
  }, [suppliers, purchases]);

  const filteredSuppliers = supplierStats.filter(({ supplier }) => {
    const haystack = [
      supplier.name,
      supplier.companyName || '',
      supplier.phone || '',
      supplier.email || '',
    ].join(' ').toLowerCase();

    return haystack.includes(searchTerm.toLowerCase());
  });

  const nextBalance = balanceSupplier
    ? balanceAction === 'add-due'
      ? balanceSupplier.balance + (typeof balanceAmount === 'number' ? balanceAmount : 0)
      : balanceSupplier.balance - (typeof balanceAmount === 'number' ? balanceAmount : 0)
    : 0;

  const totalAmountToPay = suppliers.reduce((sum, supplier) => sum + (supplier.balance || 0), 0);

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading suppliers...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Suppliers</h2>
          <p className="text-sm text-zinc-500">Track supplier relationships, purchase totals, and outstanding payables.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 font-medium text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
          <Link
            to="/purchases/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 font-medium text-white shadow-lg shadow-zinc-950/10 transition-all hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            New Purchase
          </Link>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by supplier, company, phone, or email..."
          className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </div>

      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-red-50 p-5 shadow-sm">
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Total Amount to Pay Suppliers</p>
        <p className="mt-2 text-3xl font-bold text-red-600">
          {formatCurrency(totalAmountToPay, currentOrg?.settings.currency)}
        </p>
        <p className="mt-2 text-sm text-zinc-500">Live outstanding payables across all vendors</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredSuppliers.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-zinc-500">
            No suppliers found.
          </div>
        ) : (
          filteredSuppliers.map((entry) => {
            const { supplier, dueBalance, totalPaid, totalPurchases, purchaseCount } = entry;
            const statusClasses = dueBalance > 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700';

            return (
              <Link
                key={supplier.id}
                to={`/suppliers/${supplier.id}`}
                className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900">{supplier.name}</h3>
                        <p className="text-xs text-zinc-500">{supplier.companyName || 'No company name'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => openEditModal(e, supplier)}
                        className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-orange-600 transition-colors"
                        title="Edit supplier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSupplierToDelete(supplier);
                        }}
                        disabled={supplier.balance > 0 || isSubmitting}
                        className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        title={supplier.balance > 0 ? 'Pending balance must be zero to delete' : 'Delete supplier'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center gap-2 text-xs text-zinc-600">
                    <Phone className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{supplier.phone || 'No phone number'}</span>
                  </div>

                  <div className={`mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusClasses}`}>
                    {dueBalance > 0 ? 'Payment Pending' : 'Fully Paid'}
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-4">
                    <Metric label="Due Balance" value={formatCurrency(dueBalance, currentOrg?.settings.currency)} valueClassName={dueBalance > 0 ? 'text-red-600' : 'text-green-600'} />
                    <Metric label="Paid" value={formatCurrency(totalPaid, currentOrg?.settings.currency)} />
                    <Metric label="Total Purchases" value={formatCurrency(totalPurchases, currentOrg?.settings.currency)} />
                    <Metric label="Purchases Count" value={purchaseCount.toString()} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-100 mt-4">
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.hash = `/suppliers/${supplier.id}`; // Wait, navigate is safer or just normal Link
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    Ledger Log
                  </span>
                  <button
                    type="button"
                    onClick={(e) => openBalanceModal(e, supplier, 'pay-supplier')}
                    className="inline-flex items-center gap-1 rounded-xl bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                  >
                    <HandCoins className="h-3.5 w-3.5" />
                    Pay Supplier
                  </button>
                  <button
                    type="button"
                    onClick={(e) => openBalanceModal(e, supplier, 'add-due')}
                    className="inline-flex items-center gap-1 rounded-xl bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Add Due
                  </button>
                  {supplier.balance > 0 && (
                    <button
                      type="button"
                      onClick={(e) => openBalanceModal(e, supplier, 'write-off')}
                      className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
                    >
                      Reduce Bal
                    </button>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Manual Balance Modal */}
      <AnimatePresence>
        {balanceSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeBalanceModal}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl z-10"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-6">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Manage Supplier Balance</h3>
                  <p className="text-sm text-zinc-500">{balanceSupplier.name}</p>
                </div>
                <button onClick={closeBalanceModal} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveBalance} className="space-y-4 p-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Current Balance Owed</span>
                    <span className={`font-bold ${balanceSupplier.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balanceSupplier.balance, currentOrg?.settings.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Balance After Action</span>
                    <span className={`font-bold ${nextBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(nextBalance, currentOrg?.settings.currency)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Action</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBalanceAction('pay-supplier')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'pay-supplier' ? 'border-green-500 bg-green-50 text-green-700' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Pay Supplier
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceAction('add-due')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'add-due' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Add Due
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceAction('write-off')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'write-off' ? 'border-zinc-900 bg-zinc-100 text-zinc-900' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Reduce
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Amount</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formatNumericInput(typeof balanceAmount === 'number' ? balanceAmount : undefined)}
                    onChange={(e) => setBalanceAmount(parseNumericInput(e.target.value) ?? '')}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'bank', 'cheque'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setBalanceMethod(method)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase ${balanceMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600'}`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Notes</label>
                  <textarea
                    value={balanceNotes}
                    onChange={(e) => setBalanceNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-24 resize-none"
                    placeholder="Reason, check reference, or ledger adjustment notes"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || (typeof balanceAmount !== 'number' || balanceAmount <= 0)}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                  Save Balance Action
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Supplier Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Supplier Name</label>
                    <input
                      required
                      type="text"
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Company Name</label>
                    <input
                      type="text"
                      value={supplierForm.companyName}
                      onChange={(e) => setSupplierForm({ ...supplierForm, companyName: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={supplierForm.contactPerson}
                      onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Phone</label>
                    <input
                      type="text"
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Address</label>
                    <textarea
                      value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                    />
                  </div>
                  {!editingSupplier && (
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Opening Due Balance</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formatNumericInput(supplierForm.balance)}
                        onChange={(e) => setSupplierForm({ ...supplierForm, balance: parseNumericInput(e.target.value) })}
                        placeholder="0"
                        className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {editingSupplier ? 'Save Changes' : 'Create Supplier'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!supplierToDelete}
        onClose={() => setSupplierToDelete(null)}
        onConfirm={async () => {
          if (supplierToDelete) {
            await handleDeleteSupplier(supplierToDelete);
            setSupplierToDelete(null);
          }
        }}
        title="Delete Supplier Profile?"
        message={`Are you sure you want to permanently delete supplier "${supplierToDelete?.name}"? All associated purchase histories under this supplier will be affected. This action cannot be undone.`}
      />
    </div>
  );
}

function Metric({ label, value, valueClassName = 'text-zinc-900' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}
