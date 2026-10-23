import { supabase } from '../supabaseClient';
import {
  InventoryTransaction,
  TransactionType,
  Item,
  StockSummary,
  InventoryLocation,
  ItemCategory,
} from '../types';
import { generateId, stripUndefined } from './dbUtils';

function buildBarcodeValue(itemId: string) {
  const prefix = itemId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'ITEM';
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PRD-${prefix}-${rand}`;
}

export const inventoryService = {
  /**
   * Core Transaction Engine
   * Handles all stock movements and ensures item currentStock and location-wise stock are updated.
   */
  async createTransaction(
    orgId: string,
    userId: string,
    params: {
      itemId: string;
      type: TransactionType;
      quantity: number;
      sourceLocationId?: string;
      destinationLocationId?: string;
      unitCost?: number;
      unitSellPrice?: number;
      referenceId?: string;
      notes?: string;
    }
  ): Promise<InventoryTransaction> {
    if (!params.itemId) {
      throw new Error('Item is required');
    }
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    // 1. Fetch item
    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', params.itemId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (itemError || !itemData) {
      throw new Error('Item not found');
    }

    let stockChange = 0;
    let sourceDelta = 0;
    let destinationDelta = 0;

    switch (params.type) {
      case 'PURCHASE_IN':
      case 'ADJUSTMENT_IN':
      case 'CUSTOMER_RETURN':
        stockChange = params.quantity;
        destinationDelta = params.quantity;
        break;
      case 'SALE_OUT':
      case 'ADJUSTMENT_OUT':
      case 'DAMAGE_OUT':
        stockChange = -params.quantity;
        sourceDelta = -params.quantity;
        break;
      case 'TRANSFER':
      case 'TRUCK_ASSIGNMENT':
      case 'TRUCK_RETURN':
        stockChange = 0;
        sourceDelta = -params.quantity;
        destinationDelta = params.quantity;
        break;
    }

    if (sourceDelta !== 0 && !params.sourceLocationId) {
      throw new Error('A source location is required for this stock movement');
    }
    if (destinationDelta !== 0 && !params.destinationLocationId) {
      throw new Error('A destination location is required for this stock movement');
    }
    if (
      params.sourceLocationId &&
      params.destinationLocationId &&
      params.sourceLocationId === params.destinationLocationId &&
      sourceDelta !== 0 &&
      destinationDelta !== 0
    ) {
      throw new Error('Source and destination locations must be different');
    }

    // Guard against negative total stock (unless adjustment)
    if (params.type !== 'ADJUSTMENT_IN' && params.type !== 'ADJUSTMENT_OUT') {
      if ((itemData.currentStock || 0) + stockChange < 0) {
        throw new Error('Insufficient stock for this operation');
      }
    }

    // Check location stock if taking from a source location
    if (sourceDelta < 0 && params.sourceLocationId) {
      const sourceSummaryId = `${params.itemId}_${params.sourceLocationId}`;
      const { data: sourceSummary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', sourceSummaryId)
        .maybeSingle();

      const sourceStock = sourceSummary?.quantity || 0;
      if (sourceStock < params.quantity) {
        throw new Error(`Insufficient stock at the selected source location. Available: ${sourceStock}`);
      }
    }

    // Create transaction record
    const newTransactionId = generateId();
    const transactionData: InventoryTransaction = stripUndefined({
      id: newTransactionId,
      orgId,
      itemId: params.itemId,
      type: params.type,
      sourceLocationId: params.sourceLocationId,
      destinationLocationId: params.destinationLocationId,
      quantity: params.quantity,
      unitCost: params.unitCost,
      unitSellPrice: params.unitSellPrice,
      referenceId: params.referenceId,
      userId,
      timestamp: Date.now(),
      notes: params.notes,
      status: 'completed',
    });

    const { error: transInsertError } = await supabase
      .from('transactions')
      .insert(transactionData);

    if (transInsertError) {
      console.error('Error inserting inventory transaction:', transInsertError);
      throw new Error(transInsertError.message);
    }

    // Update item stock
    if (stockChange !== 0) {
      const nextStock = (itemData.currentStock || 0) + stockChange;
      const { error: updateItemError } = await supabase
        .from('items')
        .update({ currentStock: nextStock })
        .eq('id', params.itemId)
        .eq('orgId', orgId);

      if (updateItemError) {
        console.error('Error updating item stock:', updateItemError);
        throw new Error(updateItemError.message);
      }
    }

    // Update location-wise stock summaries
    if (params.sourceLocationId && sourceDelta !== 0) {
      const sourceSummaryId = `${params.itemId}_${params.sourceLocationId}`;
      const { data: sourceSummary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', sourceSummaryId)
        .maybeSingle();

      const nextQuantity = (sourceSummary?.quantity || 0) + sourceDelta;
      await supabase.from('stock_summaries').upsert({
        id: sourceSummaryId,
        orgId,
        itemId: params.itemId,
        locationId: params.sourceLocationId,
        quantity: nextQuantity,
      });
    }

    if (params.destinationLocationId && destinationDelta !== 0) {
      const destSummaryId = `${params.itemId}_${params.destinationLocationId}`;
      const { data: destSummary } = await supabase
        .from('stock_summaries')
        .select('*')
        .eq('id', destSummaryId)
        .maybeSingle();

      const nextQuantity = (destSummary?.quantity || 0) + destinationDelta;
      await supabase.from('stock_summaries').upsert({
        id: destSummaryId,
        orgId,
        itemId: params.itemId,
        locationId: params.destinationLocationId,
        quantity: nextQuantity,
      });
    }

    return transactionData;
  },

  async getStockByLocation(orgId: string, locationId: string): Promise<StockSummary[]> {
    const { data, error } = await supabase
      .from('stock_summaries')
      .select('*')
      .eq('orgId', orgId)
      .eq('locationId', locationId);

    if (error) {
      console.error('Error fetching stock by location:', error);
      throw new Error(error.message);
    }
    return (data || []) as StockSummary[];
  },

  async getStockSummary(orgId: string, itemId: string, locationId: string): Promise<StockSummary | undefined> {
    const { data, error } = await supabase
      .from('stock_summaries')
      .select('*')
      .eq('orgId', orgId)
      .eq('itemId', itemId)
      .eq('locationId', locationId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching stock summary:', error);
      throw new Error(error.message);
    }
    return (data || undefined) as StockSummary | undefined;
  },

  async getTransactions(orgId: string, limitCount = 50): Promise<InventoryTransaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('orgId', orgId)
      .order('timestamp', { ascending: false })
      .limit(limitCount);

    if (error) {
      console.error('Error fetching transactions:', error);
      throw new Error(error.message);
    }
    return (data || []) as InventoryTransaction[];
  },

  async getItems(orgId: string, options?: { includeDeleted?: boolean }): Promise<Item[]> {
    let q = supabase
      .from('items')
      .select('*')
      .eq('orgId', orgId)
      .order('name');

    if (!options?.includeDeleted) {
      q = q.eq('isDeleted', false);
    }

    const { data, error } = await q;

    if (error) {
      console.error('Error fetching items:', error);
      throw new Error(error.message);
    }
    return (data || []) as Item[];
  },

  async getLocations(orgId: string): Promise<InventoryLocation[]> {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('orgId', orgId)
      .order('name');

    if (error) {
      console.error('Error fetching locations:', error);
      throw new Error(error.message);
    }
    return (data || []) as InventoryLocation[];
  },

  async getCategories(orgId: string): Promise<ItemCategory[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('orgId', orgId)
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      throw new Error(error.message);
    }
    return (data || []) as ItemCategory[];
  },

  async createItem(
    orgId: string,
    item: Partial<Item>,
    options?: { autoGenerateBarcode?: boolean }
  ): Promise<Item> {
    const newId = generateId();
    let barcode = item.barcode;
    if (!barcode && options?.autoGenerateBarcode) {
      barcode = buildBarcodeValue(newId);
    }

    if (barcode) {
      let attempts = 0;
      let { data: existingBarcode } = await supabase
        .from('barcode_registry')
        .select('*')
        .eq('barcode', barcode)
        .maybeSingle();

      while (existingBarcode && options?.autoGenerateBarcode && attempts < 5) {
        barcode = buildBarcodeValue(newId);
        const res = await supabase
          .from('barcode_registry')
          .select('*')
          .eq('barcode', barcode)
          .maybeSingle();
        existingBarcode = res.data;
        attempts += 1;
      }

      if (existingBarcode) {
        throw new Error('Barcode already exists. Please try again.');
      }

      await supabase.from('barcode_registry').insert({
        barcode,
        orgId,
        itemId: newId,
        createdAt: Date.now(),
      });
    }

    const newItem = stripUndefined({
      ...item,
      id: newId,
      orgId,
      barcode,
      currentStock: item.currentStock || 0,
      createdAt: Date.now(),
      isActive: true,
      isDeleted: false,
    }) as Item;

    const { error: insertError } = await supabase
      .from('items')
      .insert(newItem);

    if (insertError) {
      console.error('Error creating item:', insertError);
      throw new Error(insertError.message);
    }

    return {
      ...newItem,
      barcode,
    };
  },

  async updateItem(orgId: string, itemId: string, item: Partial<Item>): Promise<void> {
    const updates = stripUndefined(item);

    // Fetch existing item
    const { data: existingItem, error: fetchError } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchError || !existingItem) {
      throw new Error('Item not found');
    }

    const nextBarcode = updates.barcode;
    if (nextBarcode && nextBarcode !== existingItem.barcode) {
      const { data: nextBarcodeRecord } = await supabase
        .from('barcode_registry')
        .select('*')
        .eq('barcode', nextBarcode)
        .maybeSingle();

      if (nextBarcodeRecord && nextBarcodeRecord.itemId !== itemId) {
        throw new Error('Barcode already exists. Please try again.');
      }

      if (existingItem.barcode) {
        await supabase
          .from('barcode_registry')
          .delete()
          .eq('barcode', existingItem.barcode);
      }

      await supabase.from('barcode_registry').upsert({
        barcode: nextBarcode,
        orgId,
        itemId,
        createdAt: Date.now(),
      });
    }

    const { error: updateError } = await supabase
      .from('items')
      .update(updates)
      .eq('id', itemId)
      .eq('orgId', orgId);

    if (updateError) {
      console.error('Error updating item:', updateError);
      throw new Error(updateError.message);
    }
  },

  async deleteItem(orgId: string, itemId: string): Promise<void> {
    const { data: item, error: fetchError } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .eq('orgId', orgId)
      .maybeSingle();

    if (fetchError || !item) {
      throw new Error('Item not found');
    }

    const { error: updateError } = await supabase
      .from('items')
      .update({
        isDeleted: true,
        isActive: false,
        deletedAt: Date.now(),
      })
      .eq('id', itemId)
      .eq('orgId', orgId);

    if (updateError) {
      console.error('Error soft-deleting item:', updateError);
      throw new Error(updateError.message);
    }

    if (item.barcode) {
      await supabase
        .from('barcode_registry')
        .delete()
        .eq('barcode', item.barcode);
    }
  },

  async adjustItemStock(
    orgId: string,
    userId: string,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      mode: 'add' | 'remove';
      notes?: string;
    }
  ): Promise<InventoryTransaction> {
    return this.createTransaction(orgId, userId, {
      itemId: params.itemId,
      type: params.mode === 'add' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: params.quantity,
      sourceLocationId: params.mode === 'remove' ? params.locationId : undefined,
      destinationLocationId: params.mode === 'add' ? params.locationId : undefined,
      notes: params.notes,
    });
  },

  async createCategory(orgId: string, name: string, description?: string): Promise<ItemCategory> {
    const id = generateId();
    const newCat = stripUndefined({
      id,
      orgId,
      name,
      description,
    }) as ItemCategory;

    const { error } = await supabase
      .from('categories')
      .insert(newCat);

    if (error) {
      console.error('Error creating category:', error);
      throw new Error(error.message);
    }
    return newCat;
  },

  async createLocation(
    orgId: string,
    location: {
      name: string;
      type: InventoryLocation['type'];
      isDefault?: boolean;
    }
  ): Promise<InventoryLocation> {
    const id = generateId();
    const newLocation = stripUndefined({
      id,
      orgId,
      name: location.name,
      type: location.type,
      isDefault: location.isDefault ?? false,
    }) as InventoryLocation;

    const { error } = await supabase
      .from('locations')
      .insert(newLocation);

    if (error) {
      console.error('Error creating location:', error);
      throw new Error(error.message);
    }
    return newLocation;
  },

  async updateLocation(
    orgId: string,
    locationId: string,
    location: Partial<InventoryLocation>
  ): Promise<void> {
    const { error } = await supabase
      .from('locations')
      .update(stripUndefined(location))
      .eq('id', locationId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error updating location:', error);
      throw new Error(error.message);
    }
  },
};
