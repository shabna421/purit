import React, { useState, useEffect } from 'react';
import { useTenancy, useAuth } from '../contexts';
import { inventoryService } from '../services/inventoryService';
import { Item, InventoryLocation } from '../types';
import { Search, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useNotifications } from '../notifications';
import { AppSelect } from '../components/AppSelect';
import { getItemDisplayName } from '../utils/items';
import { formatNumericInput, parseNumericInput } from '../utils/numbers';

export default function DamagesPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const multiLocationEnabled = currentOrg?.settings?.multiLocationEnabled ?? false;
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (currentOrg) {
      inventoryService.getItems(currentOrg.id, { includeDeleted: true }).then(setItems);
      inventoryService.getLocations(currentOrg.id).then(locs => {
        setLocations(locs);
        const def = locs.find(l => l.isDefault || l.type === 'warehouse');
        if (def) setSelectedLocation(def.id);
      });
    }
  }, [currentOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg || !user || !selectedItem || !selectedLocation || quantity <= 0) return;

    setLoading(true);
    try {
      await inventoryService.createTransaction(currentOrg.id, user.uid, {
        itemId: selectedItem.id,
        type: 'DAMAGE_OUT',
        quantity: typeof quantity === 'number' ? quantity : 0,
        sourceLocationId: selectedLocation,
        notes: `Damage Logged: ${reason}. ${notes}`
      });
      
      success('Damage logged successfully. Stock removed.');
      setSelectedItem(null);
      setQuantity('');
      setReason('');
      setNotes('');
    } catch (error: any) {
      notifyError(error.message || 'Failed to log damage');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-zinc-900">Damage & Spoilage Log</h2>
        <p className="text-sm text-zinc-500">Record damaged stock and remove it from inventory.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          {!selectedItem ? (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Select Damaged Item</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                {searchTerm && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-60 overflow-auto">
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
                      >
                        <div className="font-bold text-zinc-900">{getItemDisplayName(item)}</div>
                        <div className="text-xs text-zinc-500">Stock: {item.currentStock} {item.unit}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-zinc-900">{getItemDisplayName(selectedItem)}</p>
                  <p className="text-xs text-zinc-500">Current Stock: {selectedItem.currentStock} {selectedItem.unit}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedItem(null)}
                className="text-xs font-bold text-red-600 hover:underline"
              >
                Change Item
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {multiLocationEnabled && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase">Location of Damage</label>
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
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-400 uppercase">Quantity Damaged</label>
              <input
                type="number"
                value={formatNumericInput(typeof quantity === 'number' ? quantity : undefined)}
                onChange={(e) => setQuantity(parseNumericInput(e.target.value) ?? '')}
                placeholder="0"
                className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 font-bold"
                required
                min="1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-400 uppercase">Primary Reason</label>
            <AppSelect
              value={reason}
              onChange={setReason}
              placeholder="Select Reason"
              options={[
                { value: '', label: 'Select Reason' },
                { value: 'Spoilage/Expired', label: 'Spoilage / Expired' },
                { value: 'Physical Damage', label: 'Physical Damage' },
                { value: 'Theft/Loss', label: 'Theft / Loss' },
                { value: 'Quality Issue', label: 'Quality Issue' },
                { value: 'Other', label: 'Other' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-400 uppercase">Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide more context if needed..."
              className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 h-24"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !selectedItem || !selectedLocation || (typeof quantity !== 'number' || quantity <= 0)}
          className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-red-200 transition-all active:scale-[0.98]"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
          Log Damage & Remove Stock
        </button>
      </form>
    </div>
  );
}
