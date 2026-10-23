/**
 * Core Domain Entities for Purit
 */

export type Role = 'owner' | 'admin' | 'manager' | 'warehouse' | 'sales' | 'driver' | 'accountant' | 'viewer' | 'employee';

export interface Permissions {
  manageItems: boolean;
  manageInventory: boolean;
  createPurchases: boolean;
  createSales: boolean;
  viewFinance: boolean;
  managePayments: boolean;
  manageCustomers: boolean;
  manageSuppliers: boolean;
  manageTrucks: boolean;
  manageReturns: boolean;
  manageDamages: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
  viewReports: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  owner: {
    manageItems: true, manageInventory: true, createPurchases: true, createSales: true,
    viewFinance: true, managePayments: true, manageCustomers: true, manageSuppliers: true,
    manageTrucks: true, manageReturns: true, manageDamages: true, manageUsers: true,
    manageSettings: true, viewReports: true
  },
  admin: {
    manageItems: true, manageInventory: true, createPurchases: true, createSales: true,
    viewFinance: true, managePayments: true, manageCustomers: true, manageSuppliers: true,
    manageTrucks: true, manageReturns: true, manageDamages: true, manageUsers: true,
    manageSettings: true, viewReports: true
  },
  manager: {

    manageItems: true, manageInventory: true, createPurchases: true, createSales: true,
    viewFinance: true, managePayments: true, manageCustomers: true, manageSuppliers: true,
    manageTrucks: true, manageReturns: true, manageDamages: true, manageUsers: false,
    manageSettings: false, viewReports: true
  },
  warehouse: {
    manageItems: false, manageInventory: true, createPurchases: false, createSales: false,
    viewFinance: false, managePayments: false, manageCustomers: false, manageSuppliers: false,
    manageTrucks: false, manageReturns: true, manageDamages: true, manageUsers: false,
    manageSettings: false, viewReports: false
  },
  sales: {
    manageItems: false, manageInventory: false, createPurchases: false, createSales: true,
    viewFinance: false, managePayments: true, manageCustomers: true, manageSuppliers: false,
    manageTrucks: true, manageReturns: true, manageDamages: false, manageUsers: false,
    manageSettings: false, viewReports: false
  },
  driver: {
    manageItems: false, manageInventory: false, createPurchases: false, createSales: true,
    viewFinance: false, managePayments: true, manageCustomers: true, manageSuppliers: false,
    manageTrucks: true, manageReturns: true, manageDamages: false, manageUsers: false,
    manageSettings: false, viewReports: false
  },
  accountant: {
    manageItems: false, manageInventory: false, createPurchases: false, createSales: false,
    viewFinance: true, managePayments: true, manageCustomers: false, manageSuppliers: false,
    manageTrucks: false, manageReturns: false, manageDamages: false, manageUsers: false,
    manageSettings: false, viewReports: true
  },
  viewer: {
    manageItems: false, manageInventory: false, createPurchases: false, createSales: false,
    viewFinance: false, managePayments: false, manageCustomers: false, manageSuppliers: false,
    manageTrucks: false, manageReturns: false, manageDamages: false, manageUsers: false,
    manageSettings: false, viewReports: true
  },
  employee: {
    manageItems: false, manageInventory: false, createPurchases: false, createSales: false,
    viewFinance: false, managePayments: false, manageCustomers: false, manageSuppliers: false,
    manageTrucks: false, manageReturns: false, manageDamages: false, manageUsers: false,
    manageSettings: false, viewReports: false
  }
};

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: number;
  settings: OrganizationSettings;
}

export interface OrganizationSettings {
  currency: string;
  taxEnabled: boolean;
  taxRate: number;
  lastGstInvoiceNumber?: string;
  multiLocationEnabled: boolean;
  enableBarcode: boolean;
  barcodeFormat?: 'code128' | 'qrcode';
  tableDisplayMode: 'table' | 'cards';
  storeName?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  modules: {
    purchases: boolean;
    sales: boolean;
    inventory: boolean;
    finance: boolean;
    expenseTracker: boolean;
    returns: boolean;
    damages: boolean;
    customerCredit: boolean;
    supplierCredit: boolean;
    pdfInvoices: boolean;
    truckInventory: boolean;
    staffManagement: boolean;
    advancedReports: boolean;
    alerts: boolean;
  };
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  joinedAt: number;
  allowedModules?: Record<string, boolean>;
}

export interface Item {
  id: string;
  orgId: string;
  sku?: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId: string;
  unit: string;
  basePrice: number;
  sellingPrice: number;
  currentStock: number;
  reorderThreshold: number;
  isActive: boolean;
  isDeleted?: boolean;
  deletedAt?: number;
  createdAt: number;
  hsnSac?: string;
}

export interface ItemCategory {
  id: string;
  orgId: string;
  name: string;
  description?: string;
}

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;
}

export interface Customer {
  id: string;
  orgId: string;
  name: string;
  shopName?: string;
  phone?: string;
  email?: string;
  address?: string;
  route?: string;
  balance: number;
  gstin?: string;
}

export interface InventoryLocation {
  id: string;
  orgId: string;
  name: string;
  type: 'warehouse' | 'cold-storage' | 'truck' | 'return-holding' | 'damaged-zone' | 'custom';
  isDefault: boolean;
}

export type TransactionType = 
  | 'PURCHASE_IN' 
  | 'SALE_OUT' 
  | 'TRANSFER' 
  | 'TRUCK_ASSIGNMENT' 
  | 'TRUCK_RETURN' 
  | 'CUSTOMER_RETURN' 
  | 'DAMAGE_OUT' 
  | 'ADJUSTMENT_IN' 
  | 'ADJUSTMENT_OUT';

export interface InventoryTransaction {
  id: string;
  orgId: string;
  itemId: string;
  type: TransactionType;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity: number;
  unitCost?: number;
  unitSellPrice?: number;
  referenceId?: string; // ID of Purchase, Sale, etc.
  userId: string;
  timestamp: number;
  notes?: string;
  status: 'completed' | 'pending' | 'cancelled';
}

export interface Purchase {
  id: string;
  orgId: string;
  supplierId: string;
  locationId: string; // Destination location for stock
  items: PurchaseLine[];
  previousDueAmount?: number;
  totalAmount: number;
  paidAmount: number;
  paymentType: 'cash' | 'credit';
  status: 'completed' | 'pending' | 'cancelled';
  timestamp: number;
  userId: string;
  notes?: string;
}

export interface PurchaseLine {
  itemId: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  orgId: string;
  customerId: string;
  locationId: string;
  items: SaleLine[];
  previousDueAmount?: number;
  totalAmount: number;
  paidAmount: number;
  taxAmount: number;
  paymentType: 'cash' | 'credit';
  status: 'completed' | 'pending' | 'cancelled';
  timestamp: number;
  userId: string;
  notes?: string;
  isGstBill?: boolean;
  gstAmount?: number;
  taxRate?: number;
  gstBillNumber?: string;
}

export interface SaleLine {
  itemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PaymentRecord {
  id: string;
  orgId: string;
  entityType: 'customer' | 'supplier';
  entityId: string;
  amount: number;
  direction?:
    | 'payment_received'
    | 'balance_added'
    | 'write_off'
    | 'payment_made'
    | 'sale_due_added'
    | 'sale_due_updated'
    | 'return_refund'
    | 'purchase_due_added';
  balanceAfter?: number;
  paymentMethod: 'cash' | 'bank' | 'cheque';
  referenceId?: string; // Sale ID or Purchase ID if applicable
  timestamp: number;
  userId: string;
  notes?: string;
}

export interface CashLedgerTransaction {
  id: string;
  saleId: string;
  type: 'receipt' | 'reversal';
  amount: number;
  timestamp: number | Date;
  description: string;
}

export interface ExpenseEntry {
  id: string;
  orgId: string;
  amount: number;
  entryDate: number;
  name: string;
  type: 'expense' | 'investment';
  category: 'Petrol' | 'Food' | 'Workshop' | 'Bank' | 'Bank to Sister';
  note?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  createdAt: number;
  userId: string;
  userRole?: string;
}

export interface StockSummary {
  itemId: string;
  locationId: string;
  quantity: number;
}

export interface Truck {
  id: string;
  orgId: string;
  locationId: string; // References InventoryLocation of type 'truck'
  name: string;
  plateNumber?: string;
  driverId?: string; // References User UID
  isActive: boolean;
  createdAt: number;
}

export interface CustomerReturn {
  id: string;
  orgId: string;
  saleId?: string;
  customerId: string;
  locationId: string; // Destination location (usually warehouse)
  items: ReturnLine[];
  totalAmount: number;
  reason: string;
  timestamp: number;
  userId: string;
}

export interface ReturnLine {
  itemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface DamageLog {
  id: string;
  orgId: string;
  itemId: string;
  locationId: string; // Where the damage occurred
  quantity: number;
  reason: string;
  notes?: string;
  timestamp: number;
  userId: string;
}

export interface SalesTarget {
  id: string; // `${orgId}_${userId}_${year}_${month}` format
  orgId: string;
  userId: string;
  year: number; // e.g. 2026
  month: number; // 0-indexed (0 = January)
  targetAmount: number;
  createdAt: number;
  updatedAt: number;
}
