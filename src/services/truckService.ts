import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Truck, InventoryLocation } from '../types';
import { inventoryService } from './inventoryService';

export const truckService = {
  async createTruck(orgId: string, data: Omit<Truck, 'id' | 'orgId' | 'createdAt'>) {
    const locationsRef = collection(db, 'organizations', orgId, 'locations');
    const trucksRef = collection(db, 'organizations', orgId, 'trucks');

    // 1. Create the InventoryLocation first
    const newLocationRef = doc(locationsRef);
    const locationData: InventoryLocation = {
      id: newLocationRef.id,
      orgId,
      name: data.name,
      type: 'truck',
      isDefault: false
    };
    await setDoc(newLocationRef, locationData);

    // 2. Create the Truck record
    const newTruckRef = doc(trucksRef);
    const truckData: Truck = {
      ...data,
      id: newTruckRef.id,
      orgId,
      locationId: newLocationRef.id,
      createdAt: Date.now()
    };
    await setDoc(newTruckRef, truckData);

    return truckData;
  },

  async getTrucks(orgId: string) {
    const q = query(collection(db, 'organizations', orgId, 'trucks'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Truck);
  },

  async getTruck(orgId: string, truckId: string) {
    const docRef = doc(db, 'organizations', orgId, 'trucks', truckId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Truck;
  },

  async updateTruck(orgId: string, truckId: string, data: Partial<Truck>) {
    const docRef = doc(db, 'organizations', orgId, 'trucks', truckId);
    const truckSnap = await getDoc(docRef);
    if (!truckSnap.exists()) {
      throw new Error('Truck not found');
    }

    const currentTruck = truckSnap.data() as Truck;
    await updateDoc(docRef, data);

    // If name changed, update the location name too
    if (data.name) {
      const locRef = doc(db, 'organizations', orgId, 'locations', currentTruck.locationId);
      await updateDoc(locRef, { name: data.name });
    }
  },

  async deleteTruck(orgId: string, truckId: string, locationId: string) {
    const stock = await inventoryService.getStockByLocation(orgId, locationId);
    const hasStock = stock.some(summary => summary.quantity > 0);
    if (hasStock) {
      throw new Error('Unload all truck stock before deleting this truck');
    }

    await deleteDoc(doc(db, 'organizations', orgId, 'trucks', truckId));
    await deleteDoc(doc(db, 'organizations', orgId, 'locations', locationId));
  }
};
