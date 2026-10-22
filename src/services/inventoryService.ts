import { 
  collection, 
  doc, 
  runTransaction, 
  increment, 
  setDoc,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { InventoryTransaction, TransactionType, Item, StockSummary, InventoryLocation, ItemCategory } from '../types';

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function buildBarcodeValue(itemId: string) {
  const prefix = itemId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'ITEM';
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PRD-${prefix}-${rand}`;
}

export const inventoryService = {
  /**
   * Core Transaction Engine
   * Handles all stock movements and ensures item currentStock is updated atomically.
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
  ) {
    if (!params.itemId) {
      throw new Error('Item is required');
    }
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    const itemRef = doc(db, 'organizations', orgId, 'items', params.itemId);
    const transactionsRef = collection(db, 'organizations', orgId, 'transactions');

    return runTransaction(db, async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Item not found');
      }

      const itemData = itemSnap.data() as Item;
      let stockChange = 0;
      let sourceDelta = 0;
      let destinationDelta = 0;

      // Logic for stock change based on transaction type
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
          // Transfers don't change total stock, but we might track location-wise stock later
          stockChange = 0;
          sourceDelta = -params.quantity;
          destinationDelta = params.quantity;
          break;
        case 'TRUCK_ASSIGNMENT':
          stockChange = 0;
          sourceDelta = -params.quantity;
          destinationDelta = params.quantity;
          break;
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
        if (itemData.currentStock + stockChange < 0) {
          throw new Error('Insufficient stock for this operation');
        }
      }

      if (sourceDelta < 0 && params.sourceLocationId) {
        const sourceSummaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${params.itemId}_${params.sourceLocationId}`);
        const sourceSummarySnap = await transaction.get(sourceSummaryRef);
        const sourceStock = sourceSummarySnap.exists() ? (sourceSummarySnap.data().quantity || 0) : 0;
        if (sourceStock < params.quantity) {
          throw new Error(`Insufficient stock at the selected source location. Available: ${sourceStock}`);
        }
      }

      // Create transaction record
      const newTransactionRef = doc(transactionsRef);
      const transactionData = stripUndefined({
        id: newTransactionRef.id,
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
        status: 'completed'
      }) as InventoryTransaction;

      transaction.set(newTransactionRef, transactionData);

      // Update item stock
      if (stockChange !== 0) {
        transaction.update(itemRef, {
          currentStock: increment(stockChange)
        });
      }

      // Update location-wise stock summaries
      if (params.sourceLocationId && sourceDelta !== 0) {
        const sourceSummaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${params.itemId}_${params.sourceLocationId}`);
        transaction.set(sourceSummaryRef, {
          itemId: params.itemId,
          locationId: params.sourceLocationId,
          quantity: increment(sourceDelta)
        }, { merge: true });
      }

      if (params.destinationLocationId && destinationDelta !== 0) {
        const destSummaryRef = doc(db, 'organizations', orgId, 'stockSummaries', `${params.itemId}_${params.destinationLocationId}`);
        transaction.set(destSummaryRef, {
          itemId: params.itemId,
          locationId: params.destinationLocationId,
          quantity: increment(destinationDelta)
        }, { merge: true });
      }

      return transactionData;
    });
  },

  async getStockByLocation(orgId: string, locationId: string) {
    const q = query(
      collection(db, 'organizations', orgId, 'stockSummaries'),
      where('locationId', '==', locationId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as StockSummary);
  },

  async getStockSummary(orgId: string, itemId: string, locationId: string) {
    const q = query(
      collection(db, 'organizations', orgId, 'stockSummaries'),
      where('itemId', '==', itemId),
      where('locationId', '==', locationId)
    );
    const snap = await getDocs(q);
    return snap.docs[0]?.data() as StockSummary | undefined;
  },

  async getTransactions(orgId: string, limitCount = 50) {
    const q = query(
      collection(db, 'organizations', orgId, 'transactions'),
      orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as InventoryTransaction);
  },

  async getItems(orgId: string, options?: { includeDeleted?: boolean }) {
    const q = query(collection(db, 'organizations', orgId, 'items'), orderBy('name'));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => d.data() as Item);
    if (options?.includeDeleted) {
      return items;
    }
    return items.filter((item) => !item.isDeleted);
  },

  async getLocations(orgId: string) {
    const q = query(collection(db, 'organizations', orgId, 'locations'), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as InventoryLocation);
  },

  async getCategories(orgId: string) {
    const q = query(collection(db, 'organizations', orgId, 'categories'), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ItemCategory);
  },

  async createItem(orgId: string, item: Partial<Item>, options?: { autoGenerateBarcode?: boolean }) {
    const itemsRef = collection(db, 'organizations', orgId, 'items');
    const newDoc = doc(itemsRef);
    let barcode = item.barcode;
    if (!barcode && options?.autoGenerateBarcode) {
      barcode = buildBarcodeValue(newDoc.id);
    }
    const newItem = stripUndefined({
      ...item,
      id: newDoc.id,
      orgId,
      barcode,
      currentStock: item.currentStock || 0,
      createdAt: Date.now(),
      isActive: true
    }) as Item;

    await runTransaction(db, async (transaction) => {
      if (barcode) {
        let attempts = 0;
        let barcodeRef = doc(db, 'organizations', orgId, 'barcodeRegistry', barcode);
        let existingBarcode = await transaction.get(barcodeRef);
        while (existingBarcode.exists() && options?.autoGenerateBarcode && attempts < 5) {
          barcode = buildBarcodeValue(newDoc.id);
          barcodeRef = doc(db, 'organizations', orgId, 'barcodeRegistry', barcode);
          existingBarcode = await transaction.get(barcodeRef);
          attempts += 1;
        }

        if (existingBarcode.exists()) {
          throw new Error('Barcode already exists. Please try again.');
        }

        transaction.set(barcodeRef, {
          barcode,
          itemId: newDoc.id,
          createdAt: Date.now(),
        });
      }

      transaction.set(newDoc, stripUndefined({ ...newItem, barcode }));
    });

    return {
      ...newItem,
      barcode,
    };
  },

  async updateItem(orgId: string, itemId: string, item: Partial<Item>) {
    const itemRef = doc(db, 'organizations', orgId, 'items', itemId);
    const updates = stripUndefined(item);

    await runTransaction(db, async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Item not found');
      }

      const existingItem = itemSnap.data() as Item;
      const nextBarcode = updates.barcode;

      if (nextBarcode && nextBarcode !== existingItem.barcode) {
        const nextBarcodeRef = doc(db, 'organizations', orgId, 'barcodeRegistry', nextBarcode);
        const nextBarcodeSnap = await transaction.get(nextBarcodeRef);
        if (nextBarcodeSnap.exists() && nextBarcodeSnap.data().itemId !== itemId) {
          throw new Error('Barcode already exists. Please try again.');
        }

        if (existingItem.barcode) {
          const prevBarcodeRef = doc(db, 'organizations', orgId, 'barcodeRegistry', existingItem.barcode);
          transaction.delete(prevBarcodeRef);
        }

        transaction.set(nextBarcodeRef, {
          barcode: nextBarcode,
          itemId,
          createdAt: Date.now(),
        });
      }

      transaction.set(itemRef, updates, { merge: true });
    });
  },

  async deleteItem(orgId: string, itemId: string) {
    const itemRef = doc(db, 'organizations', orgId, 'items', itemId);
    await runTransaction(db, async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Item not found');
      }

      const item = itemSnap.data() as Item;
      transaction.set(itemRef, {
        isDeleted: true,
        isActive: false,
        deletedAt: Date.now(),
      }, { merge: true });

      if (item.barcode) {
        const barcodeRef = doc(db, 'organizations', orgId, 'barcodeRegistry', item.barcode);
        transaction.delete(barcodeRef);
      }
    });
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
  ) {
    return this.createTransaction(orgId, userId, {
      itemId: params.itemId,
      type: params.mode === 'add' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: params.quantity,
      sourceLocationId: params.mode === 'remove' ? params.locationId : undefined,
      destinationLocationId: params.mode === 'add' ? params.locationId : undefined,
      notes: params.notes
    });
  },

  async createCategory(orgId: string, name: string, description?: string) {
    const catsRef = collection(db, 'organizations', orgId, 'categories');
    const newDoc = doc(catsRef);
    const newCat = stripUndefined({
      id: newDoc.id,
      orgId,
      name,
      description,
    });
    await setDoc(newDoc, newCat);
    return newCat;
  },

  async createLocation(
    orgId: string,
    location: {
      name: string;
      type: InventoryLocation['type'];
      isDefault?: boolean;
    }
  ) {
    const locationsRef = collection(db, 'organizations', orgId, 'locations');
    const newDoc = doc(locationsRef);
    const newLocation = stripUndefined({
      id: newDoc.id,
      orgId,
      name: location.name,
      type: location.type,
      isDefault: location.isDefault ?? false,
    });
    await setDoc(newDoc, newLocation);
    return newLocation as InventoryLocation;
  },

  async updateLocation(orgId: string, locationId: string, location: Partial<InventoryLocation>) {
    const locationRef = doc(db, 'organizations', orgId, 'locations', locationId);
    await setDoc(locationRef, stripUndefined(location), { merge: true });
  }
};
