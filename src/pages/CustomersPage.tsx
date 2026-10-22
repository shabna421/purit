import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenancy } from '../contexts';
import { useAuth } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { saleService } from '../services/saleService';
import { inventoryService } from '../services/inventoryService';
import { Customer, PaymentRecord, Sale } from '../types';
import { Plus, Search, User, Phone, MapPin, X, Loader2, Pencil, Wallet, HandCoins, Trash2, BookOpen, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useNotifications } from '../notifications';
import { formatCurrency } from '../utils/currency';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import { CustomerLedgerModal } from '../components/CustomerLedgerModal';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

function formatReference(referenceId?: string) {
  if (!referenceId) return '-';
  return `#${referenceId.slice(-6).toUpperCase()}`;
}

function labelForPaymentRecord(record: PaymentRecord) {
  switch (record.direction) {
    case 'payment_received':
      return 'Due Collected';
    case 'balance_added':
      return 'Manual Adjustment';
    case 'write_off':
      return 'Balance Reduction';
    case 'sale_due_added':
      return 'Sale Created';
    case 'sale_due_updated':
      return 'Sale Updated';
    case 'return_refund':
      return 'Return / Refund';
    default:
      return 'Balance Change';
  }
}

const emptyCustomerForm: Partial<Customer> = {
  name: '',
  shopName: '',
  phone: '',
  email: '',
  address: '',
  route: '',
  balance: 0,
  gstin: '',
};

export default function CustomersPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const { customers, loading } = useRealtimeData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>(emptyCustomerForm);
  const [balanceCustomer, setBalanceCustomer] = useState<Customer | null>(null);
  const [balanceAction, setBalanceAction] = useState<'collect-payment' | 'add-due' | 'write-off'>('collect-payment');
  const [balanceAmount, setBalanceAmount] = useState<number | ''>('');
  const [balanceMethod, setBalanceMethod] = useState<'cash' | 'bank' | 'cheque'>('cash');
  const [balanceNotes, setBalanceNotes] = useState('');
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Customer Ledger Modal states
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerSales, setLedgerSales] = useState<Sale[]>([]);
  const [ledgerPaymentRecords, setLedgerPaymentRecords] = useState<PaymentRecord[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, string>>(new Map());

  const openLedgerModal = async (customer: Customer) => {
    if (!currentOrg) return;
    setLedgerCustomer(customer);
    setIsLedgerModalOpen(true);
    try {
      const [salesData, paymentsData, itemsData] = await Promise.all([
        saleService.getSales(currentOrg.id),
        saleService.getCustomerPaymentRecords(currentOrg.id, customer.id),
        inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
      ]);
      setLedgerSales(salesData);
      setLedgerPaymentRecords(paymentsData);
      setItemsMap(new Map(itemsData.map((i) => [i.id, i.name])));
    } catch (err) {
      console.error('Error fetching ledger data:', err);
    }
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      shopName: customer.shopName || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      route: customer.route || '',
      balance: customer.balance || 0,
      gstin: customer.gstin || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    
    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await saleService.updateCustomer(currentOrg.id, editingCustomer.id, customerForm);
      } else {
        await saleService.createCustomer(currentOrg.id, customerForm);
      }
      setIsModalOpen(false);
      setCustomerForm(emptyCustomerForm);
      setEditingCustomer(null);
      success(editingCustomer ? 'Customer updated successfully' : 'Customer created successfully');
    } catch (error) {
      console.error('Error saving customer:', error);
      notifyError(editingCustomer ? 'Failed to update customer' : 'Failed to create customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers
    .filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.shopName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm) ||
      c.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const balA = a.balance || 0;
      const balB = b.balance || 0;
      if (balA > 0 && balB > 0) {
        return balB - balA; // Show highest due amount first
      }
      if (balA > 0 && balB <= 0) {
        return -1; // Due balance goes to the top
      }
      if (balA <= 0 && balB > 0) {
        return 1; // Due balance goes to the top
      }
      return a.name.localeCompare(b.name); // Alphabetical sort for zero balances
    });
  const totalAmountToReceive = customers.reduce((sum, customer) => sum + (customer.balance || 0), 0);

  const openBalanceModal = (customer: Customer, action: 'collect-payment' | 'add-due' | 'write-off' = 'collect-payment') => {
    setBalanceCustomer(customer);
    setBalanceAction(action);
    setBalanceAmount('');
    setBalanceMethod('cash');
    setBalanceNotes('');
  };

  const closeBalanceModal = () => {
    setBalanceCustomer(null);
    setBalanceAmount('');
    setBalanceNotes('');
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!currentOrg) return;
    if (customer.balance > 0) {
      notifyError('Clear the pending amount before deleting this customer.');
      return;
    }

    setIsSubmitting(true);
    try {
      await saleService.deleteCustomer(currentOrg.id, customer.id);
      success('Customer deleted successfully');
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      notifyError(error.message || 'Failed to delete customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextBalance = balanceCustomer
    ? balanceAction === 'add-due'
      ? balanceCustomer.balance + (typeof balanceAmount === 'number' ? balanceAmount : 0)
      : balanceCustomer.balance - (typeof balanceAmount === 'number' ? balanceAmount : 0)
    : 0;

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !balanceCustomer) return;

    setIsSubmitting(true);
    try {
      await saleService.createCustomerBalanceTransaction(currentOrg.id, user.uid, {
        customerId: balanceCustomer.id,
        amount: typeof balanceAmount === 'number' ? balanceAmount : 0,
        action: balanceAction,
        paymentMethod: balanceMethod,
        notes: balanceNotes,
      });
      closeBalanceModal();
      success(
        balanceAction === 'add-due'
          ? 'Customer due increased successfully'
          : balanceAction === 'write-off'
            ? 'Customer balance reduced successfully'
            : 'Payment collected successfully'
      );
    } catch (error: any) {
      console.error('Error updating customer balance:', error);
      notifyError(error.message || 'Failed to update customer balance');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading customers...</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Customers</h2>
          <p className="text-sm text-zinc-500">Manage your customer database and credit balances.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-medium shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input 
          type="text" 
          placeholder="Search by name, shop, or phone..." 
          className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-green-50 p-5 shadow-sm">
        <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Total Amount to Receive</p>
        <p className="mt-2 text-3xl font-bold text-orange-600">
          {formatCurrency(totalAmountToReceive, currentOrg?.settings.currency)}
        </p>
        <p className="mt-2 text-sm text-zinc-500">Pending amount from all customers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 bg-white border border-zinc-200 rounded-2xl">
            No customers found.
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-white border border-zinc-200 rounded-2xl p-5 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900">{customer.name}</h3>
                    <p className="text-xs text-zinc-500">{customer.shopName || 'No Shop Name'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Balance</p>
                    <p className={`text-sm font-bold ${customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(customer.balance, currentOrg?.settings.currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditModal(customer)}
                    className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-orange-600"
                    title="Edit customer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerToDelete(customer)}
                    disabled={customer.balance > 0 || isSubmitting}
                    className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title={customer.balance > 0 ? 'Pending amount must be zero to delete' : 'Delete customer'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2 pt-4 border-t border-zinc-50">
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <Phone className="w-3 h-3 text-zinc-400" />
                  {customer.phone || 'No Phone'}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <MapPin className="w-3 h-3 text-zinc-400" />
                  <span className="truncate">{customer.address || 'No Address'}</span>
                </div>
                {customer.route && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 rounded text-[10px] font-medium text-zinc-500">
                    Route: {customer.route}
                  </div>
                )}
                {customer.gstin && (
                  <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono">
                    <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 text-[10px] font-bold rounded">GSTIN</span>
                    <span>{customer.gstin}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-3">
                  <Link
                    to={`/customers/${customer.id}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Balance History
                  </Link>
                  <button
                    type="button"
                    onClick={() => openLedgerModal(customer)}
                    className="inline-flex items-center gap-1 rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Customer Ledger
                  </button>
                  <button
                    type="button"
                    onClick={() => openBalanceModal(customer, 'collect-payment')}
                    className="inline-flex items-center gap-1 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100"
                  >
                    <HandCoins className="h-3.5 w-3.5" />
                    Collect
                  </button>
                  <button
                    type="button"
                    onClick={() => openBalanceModal(customer, 'add-due')}
                    className="inline-flex items-center gap-1 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Add Due
                  </button>
                  {customer.balance > 0 && (
                    <button
                      type="button"
                      onClick={() => openBalanceModal(customer, 'write-off')}
                      className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                    >
                      Reduce Balance
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {balanceCustomer && (
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
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 p-6">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Manage Customer Balance</h3>
                  <p className="text-sm text-zinc-500">{balanceCustomer.name}</p>
                </div>
                <button onClick={closeBalanceModal} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveBalance} className="space-y-4 p-6">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Current Balance</span>
                    <span className={`font-bold ${balanceCustomer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balanceCustomer.balance, currentOrg?.settings.currency)}
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
                      onClick={() => setBalanceAction('collect-payment')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${balanceAction === 'collect-payment' ? 'border-green-500 bg-green-50 text-green-700' : 'border-zinc-200 text-zinc-600'}`}
                    >
                      Collect
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
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Method</label>
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
                    placeholder="Reason, receipt reference, or adjustment details"
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
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Customer Name</label>
                    <input
                      required
                      type="text"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Shop Name</label>
                    <input
                      type="text"
                      value={customerForm.shopName}
                      onChange={(e) => setCustomerForm({ ...customerForm, shopName: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Phone</label>
                    <input
                      type="text"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Route</label>
                    <input
                      type="text"
                      value={customerForm.route}
                      onChange={(e) => setCustomerForm({ ...customerForm, route: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">GSTIN (GST Number)</label>
                    <input
                      type="text"
                      placeholder="e.g. 32ABCDE1234F1Z5"
                      value={customerForm.gstin || ''}
                      onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono uppercase"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Address</label>
                    <textarea
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {editingCustomer ? 'Save Changes' : 'Create Customer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Ledger PDF Modal */}
      <AnimatePresence>
      {/* Customer Ledger Modal */}
      {isLedgerModalOpen && ledgerCustomer && currentOrg && (
        <CustomerLedgerModal
          isOpen={isLedgerModalOpen}
          onClose={() => {
            setIsLedgerModalOpen(false);
            setLedgerCustomer(null);
          }}
          customer={ledgerCustomer}
          currentOrg={currentOrg}
          sales={ledgerSales}
          paymentRecords={ledgerPaymentRecords}
          itemsMap={itemsMap}
        />
      )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={async () => {
          if (customerToDelete) {
            await handleDeleteCustomer(customerToDelete);
            setCustomerToDelete(null);
          }
        }}
        title="Delete Customer Profile?"
        message={`Are you sure you want to permanently delete customer "${customerToDelete?.name}"? All associated transaction histories under this customer will be affected. This action cannot be undone.`}
      />
    </div>
  );
}
