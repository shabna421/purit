import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTenancy, useAuth } from '../contexts';
import { truckService } from '../services/truckService';
import { inventoryService } from '../services/inventoryService';
import { Truck, Item, InventoryLocation, StockSummary } from '../types';
import { ArrowLeft, Package, ArrowUpRight, ArrowDownLeft, Search, Plus, Minus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { TableDisplayToggle } from '../components/TableDisplayToggle';
import { useOrgTableDisplayMode } from '../hooks/useOrgTableDisplayMode';
import { getItemDisplayName } from '../utils/items';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';

export default function TruckStockPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  
  const [truck, setTruck] = useState<Truck | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [stock, setStock] = useState<StockSummary[]>([]);
  const [sourceStock, setSourceStock] = useState<StockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isUnloadModalOpen, setIsUnloadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destLocationId, setDestLocationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { tableDisplayMode, setTableDisplayMode, savingTableDisplayMode } = useOrgTableDisplayMode();

  useEffect(() => {
    if (currentOrg && id) {
      fetchData();
    }
  }, [currentOrg, id]);

  useEffect(() => {
    if (!currentOrg || !sourceLocationId || !isLoadModalOpen) return;
    inventoryService.getStockByLocation(currentOrg.id, sourceLocationId).then(setSourceStock).catch(console.error);
  }, [currentOrg, sourceLocationId, isLoadModalOpen]);

  const fetchData = async () => {
    if (!currentOrg || !id) return;
    try {
      const [truckData, itemsData, locationsData] = await Promise.all([
        truckService.getTruck(currentOrg.id, id),
        inventoryService.getItems(currentOrg.id, { includeDeleted: true }),
        inventoryService.getLocations(currentOrg.id)
      ]);
      
      if (truckData) {
        setTruck(truckData);
        const stockData = await inventoryService.getStockByLocation(currentOrg.id, truckData.locationId);
        setStock(stockData);
      }
      
      setItems(itemsData);
      setLocations(locationsData);
      
      // Set default source/dest
      const defaultWarehouse = locationsData.find(l => l.type === 'warehouse' || l.isDefault);
      if (defaultWarehouse) {
        setSourceLocationId(defaultWarehouse.id);
        setDestLocationId(defaultWarehouse.id);
      }
    } catch (error) {
      console.error('Error fetching truck stock data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockAction = async (type: 'load' | 'unload') => {
    if (!currentOrg || !user || !truck || !selectedItem) return;

    setSubmitting(true);
    try {
      await inventoryService.createTransaction(currentOrg.id, user.uid, {
        itemId: selectedItem.id,
        type: type === 'load' ? 'TRUCK_ASSIGNMENT' : 'TRUCK_RETURN',
        quantity: typeof quantity === 'number' ? quantity : 0,
        sourceLocationId: type === 'load' ? sourceLocationId : truck.locationId,
        destinationLocationId: type === 'load' ? truck.locationId : destLocationId,
        notes: `${type === 'load' ? 'Loading' : 'Unloading'} stock for ${truck.name}`
      });
      
      setIsLoadModalOpen(false);
      setIsUnloadModalOpen(false);
      setSelectedItem(null);
      setQuantity('');
      setSearchQuery('');
      fetchData();
      success(`Stock ${type === 'load' ? 'loaded to' : 'unloaded from'} ${truck.name}.`);
    } catch (error: any) {
      notifyError(error.message || 'Error performing stock action');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (isLoadModalOpen && item.isDeleted) return false;

    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (!truck) return true;

    const locationToCheck = isLoadModalOpen ? sourceLocationId : truck.locationId;
    const summary = isLoadModalOpen
      ? sourceStock.find(entry => entry.itemId === item.id && entry.locationId === locationToCheck)
      : stock.find(entry => entry.itemId === item.id && entry.locationId === locationToCheck);

    if (isUnloadModalOpen || isLoadModalOpen) {
      return (summary?.quantity || 0) > 0;
    }

    return true;
  });

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading truck stock...</div>;
  if (!truck) return <div className="p-8 text-center text-zinc-500">Truck not found.</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/trucks')}
            className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">{truck.name} Stock</h2>
            <p className="text-sm text-zinc-500">Current inventory on this vehicle.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsUnloadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Unload Stock</span>
          </button>
          <button
            onClick={() => setIsLoadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors shadow-sm"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Load Stock</span>
          </button>
        </div>
      </header>

      <div className="flex justify-end">
        <TableDisplayToggle
          value={tableDisplayMode}
          onChange={setTableDisplayMode}
          disabled={savingTableDisplayMode}
        />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {tableDisplayMode === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Quantity</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stock.filter(s => s.quantity > 0).map((s) => {
                const item = items.find(i => i.id === s.itemId);
                return (
                  <tr key={s.itemId} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-zinc-500 uppercase tracking-wider">
                      {item?.sku || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-lg font-bold text-zinc-900">{s.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-500">
                      {item?.unit}
                    </td>
                  </tr>
                );
              })}
              {stock.filter(s => s.quantity > 0).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                    <Package className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                    <p>This truck is currently empty.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {stock.filter(s => s.quantity > 0).length === 0 ? (
              <div className="px-6 py-12 text-center text-zinc-500">
                <Package className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p>This truck is currently empty.</p>
              </div>
            ) : (
              stock.filter(s => s.quantity > 0).map((s) => {
                const item = items.find(i => i.id === s.itemId);
                return (
                  <div key={s.itemId} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                        <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">{item?.sku || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-zinc-900">{s.quantity}</p>
                        <p className="text-xs text-zinc-500">{item?.unit}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Load/Unload Modal */}
      <AnimatePresence>
        {(isLoadModalOpen || isUnloadModalOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-xl font-bold text-zinc-900">
                  {isLoadModalOpen ? 'Load Stock to Truck' : 'Unload Stock from Truck'}
                </h3>
              </div>
              
              <div className="p-6 space-y-6">
                {!selectedItem ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {filteredItems.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-zinc-100 hover:border-orange-200 hover:bg-orange-50 transition-all"
                        >
                          <div className="text-left">
                            <p className="font-bold text-zinc-900">{getItemDisplayName(item)}</p>
                            <p className="text-xs text-zinc-500">{item.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-zinc-400 uppercase">{isLoadModalOpen ? 'Available' : 'Truck Stock'}</p>
                            <p className="text-sm font-bold text-zinc-900">
                              {(isLoadModalOpen
                                ? sourceStock.find(entry => entry.itemId === item.id && entry.locationId === sourceLocationId)?.quantity
                                : stock.find(entry => entry.itemId === item.id && entry.locationId === truck.locationId)?.quantity) || 0} {item.unit}
                            </p>
                          </div>
                        </button>
                      ))}
                      {filteredItems.length === 0 && (
                        <div className="p-4 text-sm text-zinc-500 text-center">
                          {isLoadModalOpen ? 'No items found for this source location.' : 'This truck has no matching stock to unload.'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Selected Item</p>
                        <p className="font-bold text-zinc-900">{getItemDisplayName(selectedItem)}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedItem(null)}
                        className="text-xs font-bold text-orange-600 hover:underline"
                      >
                        Change
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">
                        {isLoadModalOpen ? 'Source Warehouse' : 'Destination Warehouse'}
                      </label>
                      <AppSelect
                        value={isLoadModalOpen ? sourceLocationId : destLocationId}
                        onChange={(value) => isLoadModalOpen ? setSourceLocationId(value) : setDestLocationId(value)}
                        placeholder={isLoadModalOpen ? 'Select Source Warehouse' : 'Select Destination Warehouse'}
                        options={locations
                          .filter((location) => location.type !== 'truck')
                          .map((location) => ({ value: location.id, label: location.name }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Quantity to {isLoadModalOpen ? 'Load' : 'Unload'}</label>
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setQuantity(Math.max(1, (typeof quantity === 'number' ? quantity : 1) - 1))}
                          className="w-12 h-12 flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-colors"
                        >
                          <Minus className="w-5 h-5" />
                        </button>
                        <input
                          type="number"
                          value={formatNumericInput(typeof quantity === 'number' ? quantity : undefined)}
                          onChange={(e) => setQuantity(parseNumericInput(e.target.value) ?? '')}
                          placeholder="0"
                          className="flex-1 text-center text-2xl font-bold bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setQuantity((typeof quantity === 'number' ? quantity : 0) + 1)}
                          className="w-12 h-12 flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => {
                          setIsLoadModalOpen(false);
                          setIsUnloadModalOpen(false);
                          setSelectedItem(null);
                        }}
                        className="flex-1 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl hover:bg-zinc-200 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleStockAction(isLoadModalOpen ? 'load' : 'unload')}
                        disabled={submitting || (typeof quantity !== 'number' || quantity <= 0)}
                        className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>{submitting ? 'Saving...' : `Confirm ${isLoadModalOpen ? 'Load' : 'Unload'}`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
