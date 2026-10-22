import React, { useState, useEffect } from 'react';
import { useTenancy, useAuth } from '../contexts';
import { truckService } from '../services/truckService';
import { Truck } from '../types';
import { Plus, Truck as TruckIcon, User as UserIcon, Trash2, Edit2, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../notifications';
import SuperDeleteConfirmModal from '../components/SuperDeleteConfirmModal';

export default function TrucksPage() {
  const { currentOrg } = useTenancy();
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTruck, setNewTruck] = useState({ name: '', plateNumber: '', driverId: '' });
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [truckToDelete, setTruckToDelete] = useState<Truck | null>(null);

  useEffect(() => {
    if (currentOrg) {
      fetchTrucks();
    }
  }, [currentOrg]);

  const fetchTrucks = async () => {
    if (!currentOrg) return;
    try {
      const data = await truckService.getTrucks(currentOrg.id);
      setTrucks(data);
    } catch (error) {
      console.error('Error fetching trucks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    try {
      if (editingTruck) {
        await truckService.updateTruck(currentOrg.id, editingTruck.id, {
          name: newTruck.name,
          plateNumber: newTruck.plateNumber,
          driverId: newTruck.driverId || undefined,
        });
      } else {
        await truckService.createTruck(currentOrg.id, {
          ...newTruck,
          isActive: true
        });
      }
      setIsModalOpen(false);
      setNewTruck({ name: '', plateNumber: '', driverId: '' });
      setEditingTruck(null);
      fetchTrucks();
      success(editingTruck ? 'Truck updated successfully.' : 'Truck created successfully.');
    } catch (error) {
      console.error('Error creating truck:', error);
      notifyError(editingTruck ? 'Failed to update truck' : 'Failed to create truck');
    }
  };

  const handleDeleteTruck = async (truckId: string, locationId: string) => {
    if (!currentOrg) return;
    try {
      await truckService.deleteTruck(currentOrg.id, truckId, locationId);
      fetchTrucks();
    } catch (error: any) {
      console.error('Error deleting truck:', error);
      notifyError(error.message || 'Failed to delete truck');
    }
  };

  const openEditModal = (truck: Truck) => {
    setEditingTruck(truck);
    setNewTruck({
      name: truck.name,
      plateNumber: truck.plateNumber || '',
      driverId: truck.driverId || '',
    });
    setIsModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading trucks...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Truck Fleet</h2>
          <p className="text-sm text-zinc-500">Manage your distribution vehicles and mobile inventory.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Truck</span>
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trucks.map((truck) => (
          <motion.div
            key={truck.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:border-orange-200 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                <TruckIcon className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(truck)}
                  className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setTruckToDelete(truck)}
                  className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1 mb-6">
              <h3 className="text-lg font-bold text-zinc-900">{truck.name}</h3>
              <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">{truck.plateNumber || 'No Plate'}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl mb-6">
              <UserIcon className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">{truck.driverId || 'Unassigned'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                to={`/trucks/${truck.id}/stock`}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-50 transition-colors text-sm font-medium"
              >
                <Package className="w-4 h-4" />
                <span>Stock</span>
              </Link>
              <Link
                to={`/sales/new?locationId=${truck.locationId}`}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Sale</span>
              </Link>
            </div>
          </motion.div>
        ))}

        {trucks.length === 0 && (
          <div className="col-span-full p-12 text-center bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
            <TruckIcon className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500">No trucks registered yet.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100">
                <h3 className="text-xl font-bold text-zinc-900">{editingTruck ? 'Edit Truck' : 'Add New Truck'}</h3>
              </div>
              <form onSubmit={handleCreateTruck} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Truck Name</label>
                  <input
                    type="text"
                    required
                    value={newTruck.name}
                    onChange={(e) => setNewTruck({ ...newTruck, name: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. Truck A, Delivery Van 1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Plate Number</label>
                  <input
                    type="text"
                    value={newTruck.plateNumber}
                    onChange={(e) => setNewTruck({ ...newTruck, plateNumber: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g. ABC-1234"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingTruck(null);
                      setNewTruck({ name: '', plateNumber: '', driverId: '' });
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-xl hover:bg-zinc-200 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-medium"
                  >
                    {editingTruck ? 'Save Changes' : 'Create Truck'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SuperDeleteConfirmModal
        isOpen={!!truckToDelete}
        onClose={() => setTruckToDelete(null)}
        onConfirm={async () => {
          if (truckToDelete) {
            await handleDeleteTruck(truckToDelete.id, truckToDelete.locationId);
            setTruckToDelete(null);
          }
        }}
        title="Delete Truck Fleet Entry?"
        message={`Are you sure you want to permanently delete truck "${truckToDelete?.name}" (${truckToDelete?.plateNumber || 'No Plate'})? This action cannot be undone.`}
      />
    </div>
  );
}
