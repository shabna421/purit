import { supabase } from '../supabaseClient';
import { Truck, InventoryLocation } from '../types';
import { inventoryService } from './inventoryService';
import { generateId, stripUndefined } from './dbUtils';

export const truckService = {
  async createTruck(orgId: string, data: Omit<Truck, 'id' | 'orgId' | 'createdAt'>): Promise<Truck> {
    // 1. Create the InventoryLocation first
    const locationId = generateId();
    const locationData: InventoryLocation = {
      id: locationId,
      orgId,
      name: data.name,
      type: 'truck',
      isDefault: false,
    };

    const { error: locError } = await supabase
      .from('locations')
      .insert(locationData);

    if (locError) {
      console.error('Error creating truck inventory location:', locError);
      throw new Error(locError.message);
    }

    // 2. Create the Truck record
    const truckId = generateId();
    const truckData: Truck = {
      ...data,
      id: truckId,
      orgId,
      locationId,
      createdAt: Date.now(),
    };

    const { error: truckError } = await supabase
      .from('trucks')
      .insert(truckData);

    if (truckError) {
      console.error('Error creating truck:', truckError);
      throw new Error(truckError.message);
    }

    return truckData;
  },

  async getTrucks(orgId: string): Promise<Truck[]> {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('orgId', orgId)
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('Error fetching trucks:', error);
      throw new Error(error.message);
    }
    return (data || []) as Truck[];
  },

  async getTruck(orgId: string, truckId: string): Promise<Truck | null> {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching truck:', error);
      throw new Error(error.message);
    }
    return data as Truck | null;
  },

  async updateTruck(orgId: string, truckId: string, data: Partial<Truck>): Promise<void> {
    const currentTruck = await this.getTruck(orgId, truckId);
    if (!currentTruck) {
      throw new Error('Truck not found');
    }

    const { error } = await supabase
      .from('trucks')
      .update(stripUndefined(data))
      .eq('id', truckId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error updating truck:', error);
      throw new Error(error.message);
    }

    // If name changed, update the location name too
    if (data.name) {
      const { error: locError } = await supabase
        .from('locations')
        .update({ name: data.name })
        .eq('id', currentTruck.locationId)
        .eq('orgId', orgId);

      if (locError) {
        console.error('Error updating truck location name:', locError);
      }
    }
  },

  async deleteTruck(orgId: string, truckId: string, locationId: string): Promise<void> {
    const stock = await inventoryService.getStockByLocation(orgId, locationId);
    const hasStock = stock.some((summary) => summary.quantity > 0);
    if (hasStock) {
      throw new Error('Unload all truck stock before deleting this truck');
    }

    const { error: truckError } = await supabase
      .from('trucks')
      .delete()
      .eq('id', truckId)
      .eq('orgId', orgId);

    if (truckError) {
      console.error('Error deleting truck:', truckError);
      throw new Error(truckError.message);
    }

    const { error: locError } = await supabase
      .from('locations')
      .delete()
      .eq('id', locationId)
      .eq('orgId', orgId);

    if (locError) {
      console.error('Error deleting truck location:', locError);
      throw new Error(locError.message);
    }
  },
};
