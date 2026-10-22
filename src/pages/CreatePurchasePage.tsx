import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenancy } from '../contexts';
import { useAuth } from '../contexts';
import { purchaseService } from '../services/purchaseService';
import { inventoryService } from '../services/inventoryService';
import { Supplier, Item, PurchaseLine, InventoryLocation, ItemCategory } from '../types';
import { Plus, Trash2, Search, Loader2, MapPin, Truck, PackagePlus, Building2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { getItemDisplayName } from '../utils/items';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';

type SupplierFormState = Partial<Supplier>;
type LocationFormState = {
  name: string;
  type: InventoryLocation['type'];
  isDefault: boolean;
};

const emptySupplierForm: SupplierFormState = {
  name: '',
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  balance: 0,
};

const emptyLocationForm: LocationFormState = {
  name: '',
  type: 'warehouse',
  isDefault: false,
};

const emptyItemForm: Partial<Item> = {
  name: '',
  sku: '',
  categoryId: '',
  unit: 'pcs',
  basePrice: 0,
  sellingPrice: 0,
  reorderThreshold: 5,
  description: '',
};

export const CreatePurchasePage: React.FC = () => {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<Partial<PurchaseLine>[]>([]);
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplierForm);
  const [locationForm, setLocationForm] = useState<LocationFormState>(emptyLocationForm);
  const [itemForm, setItemForm] = useState<Partial<Item>>(emptyItemForm);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const multiLocationEnabled = currentOrg?.settings?.multiLocationEnabled ?? false;

  useEffect(() => {
    if (currentOrg) {
      loadReferenceData();
    }
  }, [currentOrg]);

  const loadReferenceData = async () => {
    if (!currentOrg) return;
    const [supplierData, itemData, locationData, categoryData] = await Promise.all([
      purchaseService.getSuppliers(currentOrg.id),
      inventoryService.getItems(currentOrg.id),
      inventoryService.getLocations(currentOrg.id),
      inventoryService.getCategories(currentOrg.id),
    ]);
    setSuppliers(supplierData);
    setItems(itemData);
    setLocations(locationData);
    setCategories(categoryData);
    setItemForm(prev => ({
      ...prev,
      categoryId: prev.categoryId || categoryData[0]?.id || '',
    }));

    if (!selectedLocation) {
      const def = locationData.find(location => location.isDefault || location.type === 'warehouse');
      if (def) setSelectedLocation(def.id);
    }
  };

  const totalAmount = purchaseItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const numericPaidAmount = typeof paidAmount === 'number' ? paidAmount : 0;
  const normalizedPaidAmount = paymentType === 'cash'
    ? totalAmount
    : Math.min(Math.max(numericPaidAmount, 0), totalAmount);
  const outstandingAmount = Math.max(totalAmount - normalizedPaidAmount, 0);

  const addItem = (item: Item) => {
    const existing = purchaseItems.find(pi => pi.itemId === item.id);
    if (existing) return;

    setPurchaseItems([...purchaseItems, {
      itemId: item.id,
      quantity: 1,
      unitCost: item.basePrice,
      subtotal: item.basePrice
    }]);
    setSearchTerm('');
  };

  const updateItem = (index: number, updates: Partial<PurchaseLine>) => {
    const newItems = [...purchaseItems];
    const item = { ...newItems[index], ...updates };
    if (item.quantity && item.unitCost) {
      item.subtotal = item.quantity * item.unitCost;
    }
    newItems[index] = item;
    setPurchaseItems(newItems);
  };

  const removeItem = (index: number) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  const openItemModal = () => {
    setItemForm({
      ...emptyItemForm,
      categoryId: categories[0]?.id || '',
    });
    setShowItemModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !selectedSupplier || !selectedLocation || purchaseItems.length === 0) return;

    setLoading(true);
    try {
      await purchaseService.createPurchase(currentOrg.id, {
        orgId: currentOrg.id,
        supplierId: selectedSupplier,
        locationId: selectedLocation,
        items: purchaseItems as PurchaseLine[],
        totalAmount,
        paidAmount: normalizedPaidAmount,
        paymentType: outstandingAmount > 0 ? 'credit' : 'cash',
        status: 'completed',
        userId: user.uid,
        notes
      });
      success('Purchase recorded successfully');
      setPurchaseItems([]);
      setSelectedSupplier('');
      setNotes('');
      setPaidAmount('');
      setPaymentType('cash');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to record purchase');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSetupSubmitting(true);
    try {
      const supplier = await purchaseService.createSupplier(currentOrg.id, supplierForm);
      setSuppliers(prev => [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSupplier(supplier.id);
      setShowSupplierModal(false);
      setSupplierForm(emptySupplierForm);
      success('Supplier added successfully');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to add supplier');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSetupSubmitting(true);
    try {
      const location = await inventoryService.createLocation(currentOrg.id, locationForm);
      setLocations(prev => [...prev, location].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedLocation(location.id);
      setShowLocationModal(false);
      setLocationForm(emptyLocationForm);
      success('Location added successfully');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to add location');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setSetupSubmitting(true);
    try {
      const newItem = await inventoryService.createItem(currentOrg.id, itemForm);
      setItems(prev => [...prev, newItem as Item].sort((a, b) => a.name.localeCompare(b.name)));
      addItem(newItem as Item);
      setShowItemModal(false);
      setItemForm({
        ...emptyItemForm,
        categoryId: categories[0]?.id || '',
      });
      success('Item added successfully');
    } catch (error: any) {
      console.error(error);
      notifyError(error.message || 'Failed to add item');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">New Purchase</h1>
          <p className="text-sm text-zinc-500">Receive stock into a warehouse, cold storage, or any custom location.</p>
        </div>
        <Link
          to="/purchases"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <PackagePlus className="w-4 h-4" />
          View Purchases
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">Supplier</label>
              <button
                type="button"
                onClick={() => setShowSupplierModal(true)}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                + Add Supplier
              </button>
            </div>
            <AppSelect
              value={selectedSupplier}
              onChange={setSelectedSupplier}
              placeholder="Select Supplier"
              searchable
              emptyMessage="No suppliers found."
              options={[
                { value: '', label: 'Select Supplier' },
                ...suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: `${supplier.name} (Bal: ${supplier.balance})`,
                  keywords: `${supplier.companyName || ''} ${supplier.contactPerson || ''} ${supplier.phone || ''} ${supplier.email || ''}`,
                })),
              ]}
              buttonClassName="rounded-lg"
            />
            <p className="text-xs text-zinc-500">Suppliers track where incoming stock came from and how much is payable.</p>
          </div>

          {multiLocationEnabled && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700">Destination Location</label>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(true)}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                >
                  + Add Location
                </button>
              </div>
              <AppSelect
                value={selectedLocation}
                onChange={setSelectedLocation}
                placeholder="Select Location"
                options={[
                  { value: '', label: 'Select Location' },
                  ...locations.map((location) => ({
                    value: location.id,
                    label: `${location.name} (${location.type})`,
                  })),
                ]}
                buttonClassName="rounded-lg"
              />
              <p className="text-xs text-zinc-500">Examples: Main Warehouse, Cold Storage, Return Holding, Backup Store.</p>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-gray-700">Items</label>
            <button
              type="button"
              onClick={openItemModal}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              + Add Item
            </button>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search items to add..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            {searchTerm && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-0"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500">SKU: {item.sku || 'N/A'} | Current Total Stock: {item.currentStock}</div>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <div className="px-4 py-3 text-sm text-zinc-500">No items matched your search.</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {purchaseItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                Add items you are receiving into stock.
              </div>
            )}
            {purchaseItems.map((pi, index) => {
              const item = items.find(i => i.id === pi.itemId);
              return (
                <div key={pi.itemId} className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{getItemDisplayName(item)}</div>
                    <div className="text-xs text-gray-500">Subtotal: {pi.subtotal?.toFixed(2)}</div>
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] uppercase text-gray-400 font-bold">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={formatNumericInput(pi.quantity)}
                      placeholder="0"
                      onChange={(e) => updateItem(index, { quantity: parseNumericInput(e.target.value) })}
                      className="w-full p-1 border rounded"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] uppercase text-gray-400 font-bold">Cost</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formatNumericInput(pi.unitCost)}
                      placeholder="0"
                      onChange={(e) => updateItem(index, { unitCost: parseNumericInput(e.target.value) })}
                      className="w-full p-1 border rounded"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mt-4 p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('cash');
                    setPaidAmount(totalAmount);
                  }}
                  className={`flex-1 py-2 rounded-lg border ${paymentType === 'cash' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200'}`}
                >
                  Paid in Full
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType('credit');
                    setPaidAmount(current => Math.min(current, totalAmount));
                  }}
                  className={`flex-1 py-2 rounded-lg border ${paymentType === 'credit' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200'}`}
                >
                  Partial / Credit
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount Now</label>
              <input
                type="number"
                min="0"
                max={totalAmount}
                value={formatNumericInput(paymentType === 'cash' ? totalAmount : numericPaidAmount)}
                onChange={(e) => {
                  const parsedValue = parseNumericInput(e.target.value);
                  const nextValue = Math.min(Math.max(parsedValue ?? 0, 0), totalAmount);
                  setPaidAmount(parsedValue === undefined ? '' : nextValue);
                  setPaymentType(nextValue >= totalAmount ? 'cash' : 'credit');
                }}
                disabled={paymentType === 'cash'}
                placeholder="0"
                className="w-full p-2 border rounded-lg disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {paymentType === 'cash'
                  ? 'Full amount will be marked as paid.'
                  : 'Enter the amount paid now. The remaining amount will be saved as supplier credit.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Paid Now</p>
              <p className="text-lg font-bold text-green-600">{normalizedPaidAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Due Later</p>
              <p className={`text-lg font-bold ${outstandingAmount > 0 ? 'text-orange-600' : 'text-zinc-900'}`}>{outstandingAmount.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border rounded-lg min-h-24"
              placeholder="Invoice number, batch info, damaged cartons, temperature notes, etc."
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-gray-500">Total Amount</div>
            <div className="text-2xl font-bold text-blue-600">{totalAmount.toFixed(2)}</div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || purchaseItems.length === 0 || !selectedSupplier || !selectedLocation}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Complete Purchase
        </button>
      </form>

      <AnimatePresence>
        {showSupplierModal && (
          <EntityModal title="Add Supplier" onClose={() => setShowSupplierModal(false)}>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Supplier Name</label>
                <input
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Company Name</label>
                  <input
                    value={supplierForm.companyName}
                    onChange={(e) => setSupplierForm({ ...supplierForm, companyName: e.target.value })}
                    className="w-full px-4 py-2 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Contact Person</label>
                  <input
                    value={supplierForm.contactPerson}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                    className="w-full px-4 py-2 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Phone</label>
                  <input
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Address</label>
                <textarea
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl min-h-20"
                />
              </div>
              <button
                type="submit"
                disabled={setupSubmitting}
                className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
              >
                {setupSubmitting ? 'Saving...' : 'Save Supplier'}
              </button>
            </form>
          </EntityModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLocationModal && multiLocationEnabled && (
          <EntityModal title="Add Destination Location" onClose={() => setShowLocationModal(false)}>
            <form onSubmit={handleCreateLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Location Name</label>
                <input
                  required
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-xl"
                  placeholder="Main Warehouse, Cold Storage 1, Backup Store"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Type</label>
                <AppSelect
                  value={locationForm.type}
                  onChange={(value) => setLocationForm({ ...locationForm, type: value as InventoryLocation['type'] })}
                  placeholder="Select Type"
                  options={[
                    { value: 'warehouse', label: 'Warehouse' },
                    { value: 'cold-storage', label: 'Cold Storage' },
                    { value: 'return-holding', label: 'Return Holding' },
                    { value: 'damaged-zone', label: 'Damaged Zone' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                <input
                  type="checkbox"
                  checked={locationForm.isDefault}
                  onChange={(e) => setLocationForm({ ...locationForm, isDefault: e.target.checked })}
                />
                <span className="text-sm text-zinc-700">Set as default receive location</span>
              </label>
              <button
                type="submit"
                disabled={setupSubmitting}
                className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold disabled:opacity-50"
              >
                {setupSubmitting ? 'Saving...' : 'Save Location'}
              </button>
            </form>
          </EntityModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showItemModal && (
          <EntityModal title="Add Item" onClose={() => setShowItemModal(false)}>
            <form onSubmit={handleCreateItem} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Item Name</label>
                <input
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full rounded-xl border px-4 py-2"
                  placeholder="e.g. Plate 10"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">SKU</label>
                  <input
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    className="w-full rounded-xl border px-4 py-2"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Category</label>
                  <AppSelect
                    value={itemForm.categoryId || ''}
                    onChange={(value) => setItemForm({ ...itemForm, categoryId: value })}
                    placeholder="Select Category"
                    options={[
                      { value: '', label: 'Select Category' },
                      ...categories.map((category) => ({
                        value: category.id,
                        label: category.name,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Unit</label>
                  <input
                    required
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Reorder Level</label>
                  <input
                    required
                    min="0"
                    type="number"
                    value={formatNumericInput(itemForm.reorderThreshold)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, reorderThreshold: parseNumericInput(e.target.value) })}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Base Cost</label>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={formatNumericInput(itemForm.basePrice)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, basePrice: parseNumericInput(e.target.value) })}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Selling Price</label>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={formatNumericInput(itemForm.sellingPrice)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseNumericInput(e.target.value) })}
                    className="w-full rounded-xl border px-4 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-zinc-400">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="min-h-24 w-full rounded-xl border px-4 py-2"
                  placeholder="Optional notes about pack size, brand, or handling"
                />
              </div>
              <button
                type="submit"
                disabled={setupSubmitting}
                className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50"
              >
                {setupSubmitting ? 'Saving...' : 'Save Item'}
              </button>
            </form>
          </EntityModal>
        )}
      </AnimatePresence>
    </div>
  );
};

function EntityModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 p-6">
          <h3 className="text-xl font-bold text-zinc-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  );
}
