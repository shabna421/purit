import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useTenancy } from '../contexts';
import { useRealtimeData } from '../contexts/RealtimeDataContext';
import { inventoryService } from '../services/inventoryService';
import { purchaseService } from '../services/purchaseService';
import { Item, ItemCategory, InventoryLocation, Purchase, Supplier } from '../types';
import { Plus, Search, Filter, Package, Tag, X, Loader2, Pencil, ArrowUpDown, Warehouse, Banknote, AlertTriangle, TrendingUp, Clock3, Trash2, Barcode, Printer, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { formatCurrency } from '../utils/currency';
import { format } from 'date-fns';
import { TableDisplayToggle } from '../components/TableDisplayToggle';
import { useOrgTableDisplayMode } from '../hooks/useOrgTableDisplayMode';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';
import Barcode2 from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { openBarcodePrintBlob } from '../utils/barcodePrint';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';
import { buildInventoryPdfBlob, printPdfBlob, downloadCsv } from '../utils/reporting';

const emptyItemForm = {
  name: '',
  sku: '',
  categoryId: '',
  unit: 'pcs',
  basePrice: 0,
  sellingPrice: 0,
  reorderThreshold: 5,
  description: '',
  hsnSac: '',
};

export default function ItemsPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const { items: rawItems, categories, locations, purchases, suppliers, loading } = useRealtimeData();

  const handlePrintInventoryReport = () => {
    if (!currentOrg) return;
    const blob = buildInventoryPdfBlob(currentOrg.name, items, categories);
    printPdfBlob(blob, `inventory-status-report.pdf`);
  };

  const handleExportInventoryCsv = () => {
    if (!currentOrg) return;
    const sorted = [...items].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    const headers = ['SKU', 'Item Name', 'Category', 'Current Stock', 'Unit', 'Base Price (Cost)', 'Selling Price', 'Reorder Threshold'];
    const rows = sorted.map((item) => [
      item.sku || '',
      item.name || '',
      categories.find((c) => c.id === item.categoryId)?.name || 'Default',
      item.currentStock,
      item.unit || '',
      item.basePrice,
      item.sellingPrice,
      item.reorderThreshold ?? 5,
    ]);
    downloadCsv(`${currentOrg.name.toLowerCase().replace(/\s+/g, '-')}-inventory-status-report.csv`, headers, rows);
  };

  const items = useMemo(() => {
    const activeItems = rawItems.filter(item => !item.isDeleted);
    if (!currentOrg?.settings?.enableBarcode) return activeItems;
    
    let needsUpdate = false;
    const existingBarcodes = new Set(activeItems.map(i => i.barcode).filter(Boolean));
    
    return activeItems.map(item => {
      if (!item.barcode) {
        needsUpdate = true;
        const code = generateUniqueBarcode(item.id, activeItems);
        existingBarcodes.add(code);
        
        // Asynchronously save to DB
        inventoryService.updateItem(currentOrg.id, item.id, { barcode: code }).catch(console.error);
        return { ...item, barcode: code };
      }
      return item;
    });
  }, [rawItems, currentOrg]);
  const [searchTerm, setSearchTerm] = useState('');

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemForm, setItemForm] = useState<Partial<Item>>(emptyItemForm);
  const [deleteCandidate, setDeleteCandidate] = useState<Item | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [barcodeItem, setBarcodeItem] = useState<Item | null>(null);
  const [localBarcodeFormat, setLocalBarcodeFormat] = useState<'code128' | 'qrcode'>('code128');
  const [isPrintQuantityModalOpen, setIsPrintQuantityModalOpen] = useState(false);
  const [printQuantity, setPrintQuantity] = useState('1');
  // Ref to the barcode preview container so we can grab the rendered <svg> at print time.
  const barcodePrintAreaRef = useRef<HTMLDivElement>(null);

  // ── Barcode helper ──────────────────────────────────────────────────
  const generateUniqueBarcode = (itemId: string, existingItems: Item[]): string => {
    const existingBarcodes = new Set(existingItems.map(i => i.barcode).filter(Boolean));
    const prefix = itemId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'ITEM';
    let code: string;
    do {
      const rand = Math.floor(100000 + Math.random() * 900000);
      code = `PRD-${prefix}-${rand}`;
    } while (existingBarcodes.has(code));
    return code;
  };

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockItem, setStockItem] = useState<Item | null>(null);
  const [stockMode, setStockMode] = useState<'add' | 'remove'>('add');
  const [stockLocationId, setStockLocationId] = useState('');
  const [stockQuantity, setStockQuantity] = useState<number | ''>('');
  const [stockNotes, setStockNotes] = useState('');
  const { tableDisplayMode, setTableDisplayMode, savingTableDisplayMode } = useOrgTableDisplayMode();

  useEffect(() => {
    if (categories.length > 0 && !itemForm.categoryId) {
      setItemForm(prev => ({
        ...prev,
        categoryId: categories[0].id
      }));
    }
  }, [categories, itemForm.categoryId]);

  const defaultLocationId = useMemo(
    () => locations.find(location => location.isDefault || location.type === 'warehouse')?.id || locations[0]?.id || '',
    [locations]
  );

  const resetItemForm = () => {
    setEditingItem(null);
    setItemForm({
      ...emptyItemForm,
      categoryId: categories[0]?.id || '',
    });
    setShowCategoryInput(false);
    setNewCategoryName('');
  };

  const openCreateModal = () => {
    resetItemForm();
    setIsItemModalOpen(true);
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      sku: item.sku || '',
      categoryId: item.categoryId,
      unit: item.unit,
      basePrice: item.basePrice,
      sellingPrice: item.sellingPrice,
      reorderThreshold: item.reorderThreshold,
      description: item.description || '',
      isActive: item.isActive,
      hsnSac: item.hsnSac || '',
    });
    setShowCategoryInput(false);
    setNewCategoryName('');
    setIsItemModalOpen(true);
  };

  const openStockModal = (item: Item, mode: 'add' | 'remove') => {
    setStockItem(item);
    setStockMode(mode);
    setStockLocationId(defaultLocationId);
    setStockQuantity('');
    setStockNotes('');
    setIsStockModalOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!currentOrg || !newCategoryName.trim()) return;
    try {
      const cat = await inventoryService.createCategory(currentOrg.id, newCategoryName.trim());
      setItemForm(prev => ({ ...prev, categoryId: cat.id }));
      setNewCategoryName('');
      setShowCategoryInput(false);
    } catch (error) {
      console.error('Error creating category:', error);
      notifyError('Failed to create category');
      return;
    }
    success('Category created successfully.');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;

    setIsSubmitting(true);
    try {
      const barcodeEnabled = currentOrg?.settings?.enableBarcode ?? false;
      if (editingItem) {
        await inventoryService.updateItem(currentOrg.id, editingItem.id, itemForm);
      } else {
        const newForm = barcodeEnabled
          ? itemForm
          : itemForm;
        await inventoryService.createItem(currentOrg.id, newForm, { autoGenerateBarcode: barcodeEnabled });
      }
      setIsItemModalOpen(false);
      resetItemForm();
      success(editingItem ? 'Item updated successfully.' : 'Item created successfully.');
    } catch (error) {
      console.error('Error saving item:', error);
      notifyError(editingItem ? 'Failed to update item' : 'Failed to create item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !stockItem || !stockLocationId) return;

    setIsSubmitting(true);
    try {
      await inventoryService.adjustItemStock(currentOrg.id, user.uid, {
        itemId: stockItem.id,
        locationId: stockLocationId,
        quantity: typeof stockQuantity === 'number' ? stockQuantity : 0,
        mode: stockMode,
        notes: stockNotes.trim() || `${stockMode === 'add' ? 'Manual stock addition' : 'Manual stock removal'} for ${stockItem.name}`,
      });
      setIsStockModalOpen(false);
      setStockItem(null);
      success(stockMode === 'add' ? 'Stock added successfully.' : 'Stock removed successfully.');
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      notifyError(error.message || 'Failed to adjust stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!currentOrg || !deleteCandidate) return;

    setIsDeleting(true);
    try {
      await inventoryService.deleteItem(currentOrg.id, deleteCandidate.id);
      setDeleteCandidate(null);
      success('Item deleted successfully.');
    } catch (error) {
      console.error('Error deleting item:', error);
      notifyError('Failed to delete item');
    } finally {
      setIsDeleting(false);
    }
  };

  const openPrintQuantityModal = () => {
    if (!barcodeItem?.barcode) return;
    setPrintQuantity('1');
    setIsPrintQuantityModalOpen(true);
  };

  const handleBarcodePrint = () => {
    if (!barcodeItem?.barcode) return;

    const parsedQuantity = Number.parseInt(printQuantity, 10);
    const safeQuantity = Number.isFinite(parsedQuantity)
      ? Math.min(Math.max(parsedQuantity, 1), 100)
      : 1;

    // Grab the <svg> that react-barcode / QRCodeSVG already painted inside the
    // barcode preview area. Both renderers produce an <svg> element.
    const svgElement = barcodePrintAreaRef.current?.querySelector('svg') as SVGElement | null;
    if (!svgElement) {
      notifyError('Barcode preview not ready. Please close and reopen the barcode dialog.');
      return;
    }

    const opened = openBarcodePrintBlob({
      name: barcodeItem.name,
      price: formatCurrency(barcodeItem.sellingPrice, currentOrg?.settings?.currency),
      svgElement,
      quantity: safeQuantity,
    });

    if (!opened) {
      notifyError('Pop-up blocked. Please allow pop-ups for this site and try again.');
      return;
    }

    setIsPrintQuantityModalOpen(false);
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    categories.find(category => category.id === item.categoryId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inventoryMetrics = useMemo(() => {
    const currency = currentOrg?.settings.currency;
    const totalUnits = items.reduce((sum, item) => sum + item.currentStock, 0);
    const totalStockValue = items.reduce((sum, item) => sum + (item.currentStock * item.basePrice), 0);
    const totalRetailValue = items.reduce((sum, item) => sum + (item.currentStock * item.sellingPrice), 0);
    const expectedMarginValue = totalRetailValue - totalStockValue;
    const lowStockCount = items.filter((item) => item.currentStock <= item.reorderThreshold && item.isActive).length;
    const inactiveCount = items.filter((item) => !item.isActive).length;
    const outstandingPurchases = purchases.filter((purchase) => purchase.totalAmount > purchase.paidAmount);
    const outstandingPayables = suppliers.reduce((sum, supplier) => sum + (supplier.balance || 0), 0);
    const oldestOutstandingPurchase = outstandingPurchases.reduce<Purchase | null>((oldest, purchase) => {
      if (!oldest) return purchase;
      return purchase.timestamp < oldest.timestamp ? purchase : oldest;
    }, null);

    return [
      {
        label: 'Stock Value',
        value: formatCurrency(totalStockValue, currency),
        note: `${totalUnits.toLocaleString()} units across all items`,
        icon: Banknote,
        tone: 'text-emerald-700 bg-emerald-50',
      },
      {
        label: 'Retail Value',
        value: formatCurrency(totalRetailValue, currency),
        note: `Projected margin ${formatCurrency(expectedMarginValue, currency)}`,
        icon: TrendingUp,
        tone: 'text-blue-700 bg-blue-50',
      },
      {
        label: 'Supplier Credit',
        value: formatCurrency(outstandingPayables, currency),
        note: oldestOutstandingPurchase
          ? `Oldest unpaid purchase: ${format(oldestOutstandingPurchase.timestamp, 'dd MMM yyyy')}`
          : 'No unpaid purchases right now',
        icon: Clock3,
        tone: 'text-orange-700 bg-orange-50',
      },
      {
        label: 'Stock Alerts',
        value: `${lowStockCount} low / ${inactiveCount} inactive`,
        note: `${items.length} total products in inventory`,
        icon: AlertTriangle,
        tone: 'text-rose-700 bg-rose-50',
      },
    ];
  }, [currentOrg?.settings.currency, items, purchases, suppliers]);

  if (loading) return <div className="p-8 text-center">Loading items...</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Inventory</h2>
          <p className="text-sm text-zinc-500">Manage your product catalog, stock value, and replenishment risks.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handlePrintInventoryReport}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print Report (PDF)
          </button>
          <button
            onClick={handleExportInventoryCsv}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <Link
            to="/purchases/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-all"
          >
            <Warehouse className="w-4 h-4" />
            Receive Stock
          </Link>
          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-medium shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-zinc-900">Inventory Overview</h3>
          <p className="text-xs text-zinc-500">Compact snapshot of value, credit, and stock health.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {inventoryMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">{metric.label}</p>
                    <p className="text-lg font-bold text-zinc-900 sm:text-xl">{metric.value}</p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${metric.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">{metric.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, barcode, or category..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-600">
          <Filter className="w-4 h-4" />
          {filteredItems.length} items
        </div>
        <TableDisplayToggle
          value={tableDisplayMode}
          onChange={setTableDisplayMode}
          disabled={savingTableDisplayMode}
        />
      </div>

      {/* ── Table mode ── */}
      {tableDisplayMode === 'table' && (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400">Item Details</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400">Category</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400 text-right">Pricing</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400 text-right">Stock</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400 text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-mono uppercase tracking-wider text-zinc-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      No items found. Add your first product to get started.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                            <Package className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                            <p className="text-xs text-zinc-500 font-mono">{item.sku || 'NO-SKU'}</p>
                            {(currentOrg?.settings?.enableBarcode) && item.barcode && (
                              <p className="text-xs text-zinc-400 font-mono">{item.barcode}</p>
                            )}
                            {item.description && <p className="text-xs text-zinc-400 mt-1">{item.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                          <Tag className="w-3 h-3" />
                          {categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-bold text-zinc-900">
                          {formatCurrency(item.sellingPrice, currentOrg?.settings.currency)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Cost {formatCurrency(item.basePrice, currentOrg?.settings.currency)}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`text-sm font-bold ${item.currentStock <= item.reorderThreshold ? 'text-red-600' : 'text-zinc-900'}`}>
                          {item.currentStock} {item.unit}
                        </div>
                        <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-tight">
                          Reorder at {item.reorderThreshold}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openStockModal(item, 'add')}
                            className="px-3 py-2 text-xs font-medium bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors"
                          >
                            Add Stock
                          </button>
                          <button
                            onClick={() => openStockModal(item, 'remove')}
                            className="px-3 py-2 text-xs font-medium bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors"
                            title="Edit item"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {(currentOrg?.settings?.enableBarcode) && (
                            <button
                              onClick={() => {
                                setLocalBarcodeFormat(currentOrg.settings?.barcodeFormat || 'code128');
                                setBarcodeItem(item);
                              }}
                              className="px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors"
                              title="Barcode"
                            >
                              Barcode
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteCandidate(item)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Cards mode ── */}
      {tableDisplayMode === 'cards' && (
        filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center text-zinc-500">
            No items found. Add your first product to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const isOutOfStock = item.currentStock === 0;
              const isLowStock = !isOutOfStock && item.currentStock <= item.reorderThreshold;
              const stockStatus = isOutOfStock
                ? { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
                : isLowStock
                  ? { label: 'Low Stock', cls: 'bg-orange-100 text-orange-700' }
                  : { label: 'In Stock', cls: 'bg-green-100 text-green-700' };
              return (
                <div key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                  {/* Card Header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                        <Package className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-900">{item.name}</p>
                        <p className="font-mono text-xs text-zinc-500">{item.sku || 'NO-SKU'}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${stockStatus.cls}`}>
                      {stockStatus.label}
                    </span>
                  </div>

                  {/* Barcode tag (shown only when enabled and barcode exists) */}
                  {(currentOrg?.settings?.enableBarcode) && item.barcode && (
                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-3 py-2">
                      <Barcode className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="font-mono text-xs font-semibold text-zinc-600">{item.barcode}</span>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-zinc-50 p-3">
                    <div className="col-span-2">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Category</p>
                      <p className="mt-0.5 text-sm text-zinc-700">{categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Selling Price</p>
                      <p className="mt-0.5 text-sm font-bold text-zinc-900">{formatCurrency(item.sellingPrice, currentOrg?.settings.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Cost Price</p>
                      <p className="mt-0.5 text-sm text-zinc-700">{formatCurrency(item.basePrice, currentOrg?.settings.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Stock</p>
                      <p className={`mt-0.5 text-sm font-bold ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-zinc-900'}`}>
                        {item.currentStock} {item.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Reorder At</p>
                      <p className="mt-0.5 text-sm text-zinc-700">{item.reorderThreshold} {item.unit}</p>
                    </div>
                  </div>

                  {item.description && (
                    <p className="mt-3 text-xs text-zinc-500 line-clamp-2">{item.description}</p>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => openStockModal(item, 'add')}
                      className="flex-1 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                    >
                      + Stock
                    </button>
                    <button
                      onClick={() => openStockModal(item, 'remove')}
                      className="flex-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                    >
                      − Stock
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                    {(currentOrg?.settings?.enableBarcode) && (
                      <button
                        onClick={() => {
                          setLocalBarcodeFormat(currentOrg.settings?.barcodeFormat || 'code128');
                          setBarcodeItem(item);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                        Barcode
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <AnimatePresence>
        {isItemModalOpen && (
          <ModalShell onClose={() => setIsItemModalOpen(false)}>
            <div className="flex items-center justify-between border-b border-zinc-100 p-4 sm:p-6">
              <h3 className="text-xl font-bold text-zinc-900">{editingItem ? 'Edit Item' : 'Add New Item'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Item Name</label>
                  <input
                    required
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Premium Dates 1kg"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">SKU</label>
                  <input
                    type="text"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Optional"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">HSN/SAC Code</label>
                  <input
                    type="text"
                    value={itemForm.hsnSac || ''}
                    onChange={(e) => setItemForm({ ...itemForm, hsnSac: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. 8414"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Category</label>
                  {showCategoryInput ? (
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="min-w-0 flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="New category..."
                      />
                      <button type="button" onClick={handleCreateCategory} className="px-3 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold">
                        Add
                      </button>
                      <button type="button" onClick={() => setShowCategoryInput(false)} className="px-3 py-2 bg-zinc-100 text-zinc-500 rounded-xl text-xs font-bold">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <AppSelect
                          value={itemForm.categoryId || ''}
                          onChange={(value) => setItemForm({ ...itemForm, categoryId: value })}
                          placeholder="Select Category"
                          options={[
                            { value: '', label: 'Select Category' },
                            ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                          ]}
                        />
                      </div>
                      <button type="button" onClick={() => setShowCategoryInput(true)} className="shrink-0 p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-colors">
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Unit</label>
                  <input
                    required
                    type="text"
                    value={itemForm.unit}
                    onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Reorder Level</label>
                  <input
                    required
                    min="0"
                    type="number"
                    value={formatNumericInput(itemForm.reorderThreshold)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, reorderThreshold: parseNumericInput(e.target.value) })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Base Cost</label>
                  <input
                    required
                    min="0"
                    type="number"
                    step="0.01"
                    value={formatNumericInput(itemForm.basePrice)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, basePrice: parseNumericInput(e.target.value) })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Selling Price</label>
                  <input
                    required
                    min="0"
                    type="number"
                    step="0.01"
                    value={formatNumericInput(itemForm.sellingPrice)}
                    placeholder="0"
                    onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseNumericInput(e.target.value) })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Description</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-24"
                    placeholder="Optional notes about pack size, brand, or handling"
                  />
                </div>
                {editingItem && (
                  <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-zinc-900">Item Availability</p>
                      <p className="text-xs text-zinc-500">Inactive items stay in reports but are hidden from future operations.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, isActive: !itemForm.isActive })}
                      className={`px-4 py-2 rounded-xl text-sm font-medium ${itemForm.isActive ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-600'}`}
                    >
                      {itemForm.isActive ? 'Active' : 'Inactive'}
                    </button>
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
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isStockModalOpen && stockItem && (
          <ModalShell onClose={() => setIsStockModalOpen(false)}>
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-zinc-900">{stockMode === 'add' ? 'Add Stock' : 'Remove Stock'}</h3>
                <p className="text-sm text-zinc-500">{stockItem.name}</p>
              </div>
              <button onClick={() => setIsStockModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                  <p className="text-xs uppercase font-bold text-zinc-400 mb-1">Current Total Stock</p>
                  <p className="text-2xl font-bold text-zinc-900">{stockItem.currentStock} {stockItem.unit}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Location</label>
                  <AppSelect
                    value={stockLocationId}
                    onChange={setStockLocationId}
                    placeholder="Select Location"
                    options={[
                      { value: '', label: 'Select Location' },
                      ...locations.map((location) => ({
                        value: location.id,
                        label: `${location.name} (${location.type})`,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={formatNumericInput(typeof stockQuantity === 'number' ? stockQuantity : undefined)}
                    onChange={(e) => setStockQuantity(parseNumericInput(e.target.value) ?? '')}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Notes</label>
                  <textarea
                    value={stockNotes}
                    onChange={(e) => setStockNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-24"
                    placeholder="Reason for this manual stock adjustment"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !stockLocationId || (typeof stockQuantity !== 'number' || stockQuantity <= 0)}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${stockMode === 'add' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUpDown className="w-5 h-5" />}
                {stockMode === 'add' ? 'Confirm Stock Addition' : 'Confirm Stock Removal'}
              </button>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={handleDeleteItem}
        title="Delete Catalog Item?"
        message={`Are you sure you want to permanently delete item "${deleteCandidate?.name}" (${deleteCandidate?.sku || 'NO-SKU'})? All inventory tracking for this item will be archived. This action cannot be undone.`}
      />

      {/* ─── Barcode Modal ─── */}
      <AnimatePresence>
        {barcodeItem && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBarcodeItem(null)}
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Product Barcode</h3>
                  <p className="text-sm text-zinc-500 truncate max-w-[220px]">{barcodeItem.name}</p>
                </div>
                <button
                  onClick={() => setBarcodeItem(null)}
                  className="rounded-full p-2 hover:bg-zinc-100 transition-colors"
                >
                  <X className="h-5 w-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                {/* Barcode value display */}
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3">
                  <Barcode className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="font-mono text-sm font-bold text-zinc-800">
                    {barcodeItem.barcode || 'No barcode assigned'}
                  </span>
                </div>

                {/* Visual barcode preview */}
                {barcodeItem.barcode ? (
                  <div className="flex flex-col gap-4">
                    <div id="barcode-print-area" ref={barcodePrintAreaRef} className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-6">
                      <div className="text-center mb-1">
                        <p className="text-sm font-bold text-black">{barcodeItem.name}</p>
                        <p className="text-xs font-medium text-black">{formatCurrency(barcodeItem.sellingPrice, currentOrg?.settings?.currency)}</p>
                      </div>
                      {localBarcodeFormat === 'qrcode' ? (
                        <QRCodeSVG value={barcodeItem.barcode} size={120} level="M" includeMargin={true} />
                      ) : (
                        <Barcode2
                          value={barcodeItem.barcode}
                          width={1.6}
                          height={60}
                          fontSize={12}
                          margin={0}
                          displayValue={true}
                        />
                      )}
                    </div>

                    {/* Format switch */}
                    <div className="flex bg-zinc-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setLocalBarcodeFormat('code128')}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${localBarcodeFormat === 'code128' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
                      >
                        Code 128
                      </button>
                      <button 
                        onClick={() => setLocalBarcodeFormat('qrcode')}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${localBarcodeFormat === 'qrcode' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}
                      >
                        QR Code
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center">
                    <Barcode className="h-10 w-10 text-zinc-300" />
                    <p className="text-sm text-zinc-500">No barcode generated yet.</p>
                    <p className="text-xs text-zinc-400">This item does not have a saved barcode yet.</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid grid-cols-2 gap-1 col-span-2">
                    <button
                      type="button"
                      disabled={!barcodeItem.barcode}
                      onClick={openPrintQuantityModal}
                      className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </button>
                    <button
                      type="button"
                      disabled={!barcodeItem.barcode}
                      onClick={() => {
                        const svgElement = document.querySelector('#barcode-print-area svg') as SVGElement;
                        if (!svgElement) return;
                        const svgData = new XMLSerializer().serializeToString(svgElement);
                        const blob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `barcode-${barcodeItem.barcode}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 text-blue-700 px-4 py-2.5 text-sm font-semibold transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 border border-blue-200"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPrintQuantityModalOpen && barcodeItem?.barcode && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPrintQuantityModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            >
              <div className="mb-4">
                <h3 className="text-lg font-bold text-zinc-900">Print Labels</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Enter how many copies you want to print for {barcodeItem.name}.
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Quantity</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={printQuantity}
                  onChange={(event) => setPrintQuantity(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-base font-semibold text-zinc-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </label>

              <p className="mt-3 text-xs text-zinc-500">
                After confirming, the browser print dialog will open. Select your label printer there.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPrintQuantityModalOpen(false)}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBarcodePrint}
                  className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Confirm Print
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]"
      >
        {children}
      </motion.div>
    </div>
  );
}
