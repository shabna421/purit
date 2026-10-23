-- ==============================================================================
-- Purit Database Schema for Supabase (PostgreSQL)
-- Run this in your Supabase Project's SQL Editor (Dashboard > SQL Editor)
-- ==============================================================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Memberships
CREATE TABLE IF NOT EXISTS public.memberships (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL,
  "joinedAt" BIGINT NOT NULL,
  "allowedModules" JSONB DEFAULT '{}'::jsonb
);

-- 3. Users Profile
CREATE TABLE IF NOT EXISTS public.users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "photoURL" TEXT,
  "createdAt" BIGINT NOT NULL
);

-- 4. Invitations
CREATE TABLE IF NOT EXISTS public.invitations (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL
);

-- 5. Items (Products / SKUs)
CREATE TABLE IF NOT EXISTS public.items (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  "categoryId" TEXT,
  unit TEXT NOT NULL,
  "basePrice" NUMERIC NOT NULL DEFAULT 0,
  "sellingPrice" NUMERIC NOT NULL DEFAULT 0,
  "currentStock" NUMERIC NOT NULL DEFAULT 0,
  "reorderThreshold" NUMERIC NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "hsnSac" TEXT
);

-- 6. Item Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

-- 7. Inventory Locations
CREATE TABLE IF NOT EXISTS public.locations (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false
);

-- 8. Stock Summaries (Location Stock)
CREATE TABLE IF NOT EXISTS public.stock_summaries (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0
);

-- 9. Inventory Transactions (Stock Audit Trail)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  type TEXT NOT NULL,
  "sourceLocationId" TEXT,
  "destinationLocationId" TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  "unitCost" NUMERIC,
  "unitSellPrice" NUMERIC,
  "referenceId" TEXT,
  "userId" TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
);

-- 10. Purchases
CREATE TABLE IF NOT EXISTS public.purchases (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  "previousDueAmount" NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC NOT NULL DEFAULT 0,
  "paidAmount" NUMERIC NOT NULL DEFAULT 0,
  "paymentType" TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'completed',
  timestamp BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  notes TEXT
);

-- 11. Sales
CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  "previousDueAmount" NUMERIC DEFAULT 0,
  "totalAmount" NUMERIC NOT NULL DEFAULT 0,
  "paidAmount" NUMERIC NOT NULL DEFAULT 0,
  "taxAmount" NUMERIC NOT NULL DEFAULT 0,
  "paymentType" TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'completed',
  timestamp BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  notes TEXT,
  "isGstBill" BOOLEAN DEFAULT false,
  "gstAmount" NUMERIC DEFAULT 0,
  "taxRate" NUMERIC DEFAULT 0,
  "gstBillNumber" TEXT
);

-- 12. Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "shopName" TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  route TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  gstin TEXT
);

-- 13. Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "companyName" TEXT,
  "contactPerson" TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  balance NUMERIC NOT NULL DEFAULT 0
);

-- 14. Payments (Customer / Supplier Ledger)
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  direction TEXT,
  "balanceAfter" NUMERIC,
  "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
  "referenceId" TEXT,
  timestamp BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  notes TEXT
);

-- 15. Cash Ledger
CREATE TABLE IF NOT EXISTS public.cash_ledger (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  timestamp BIGINT NOT NULL,
  description TEXT
);

-- 16. Expense Entries
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  "entryDate" BIGINT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  category TEXT NOT NULL,
  note TEXT,
  "attachmentName" TEXT,
  "attachmentDataUrl" TEXT,
  "createdAt" BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  "userRole" TEXT
);

-- 17. Trucks
CREATE TABLE IF NOT EXISTS public.trucks (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "plateNumber" TEXT,
  "driverId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" BIGINT NOT NULL
);

-- 18. Customer Returns
CREATE TABLE IF NOT EXISTS public.customer_returns (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "saleId" TEXT,
  "customerId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalAmount" NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  timestamp BIGINT NOT NULL,
  "userId" TEXT NOT NULL
);

-- 19. Sales Targets
CREATE TABLE IF NOT EXISTS public.sales_targets (
  id TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  "targetAmount" NUMERIC NOT NULL DEFAULT 0,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

-- 20. Barcode Registry
CREATE TABLE IF NOT EXISTS public.barcode_registry (
  barcode TEXT PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL
);

-- ==============================================================================
-- INDEXES for High-Performance Queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_items_orgId ON public.items ("orgId");
CREATE INDEX IF NOT EXISTS idx_items_barcode ON public.items (barcode);
CREATE INDEX IF NOT EXISTS idx_categories_orgId ON public.categories ("orgId");
CREATE INDEX IF NOT EXISTS idx_locations_orgId ON public.locations ("orgId");
CREATE INDEX IF NOT EXISTS idx_stock_summaries_org ON public.stock_summaries ("orgId", "locationId");
CREATE INDEX IF NOT EXISTS idx_transactions_orgId ON public.transactions ("orgId", timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_ref ON public.transactions ("referenceId");
CREATE INDEX IF NOT EXISTS idx_purchases_orgId ON public.purchases ("orgId", timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases ("supplierId");
CREATE INDEX IF NOT EXISTS idx_sales_orgId ON public.sales ("orgId", timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales ("customerId");
CREATE INDEX IF NOT EXISTS idx_customers_orgId ON public.customers ("orgId");
CREATE INDEX IF NOT EXISTS idx_suppliers_orgId ON public.suppliers ("orgId");
CREATE INDEX IF NOT EXISTS idx_payments_orgId ON public.payments ("orgId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_payments_ref ON public.payments ("referenceId");
CREATE INDEX IF NOT EXISTS idx_cash_ledger_orgId ON public.cash_ledger ("orgId");
CREATE INDEX IF NOT EXISTS idx_expense_entries_orgId ON public.expense_entries ("orgId", "entryDate" DESC);
CREATE INDEX IF NOT EXISTS idx_trucks_orgId ON public.trucks ("orgId");
CREATE INDEX IF NOT EXISTS idx_customer_returns_orgId ON public.customer_returns ("orgId", "customerId");
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.memberships ("userId");
CREATE INDEX IF NOT EXISTS idx_memberships_org ON public.memberships ("orgId");
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations (email);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Defaulting to permissive policies so public anon key can perform operations
-- ==============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'organizations', 'memberships', 'users', 'invitations', 'items', 'categories',
      'locations', 'stock_summaries', 'transactions', 'purchases', 'sales', 'customers',
      'suppliers', 'payments', 'cash_ledger', 'expense_entries', 'trucks',
      'customer_returns', 'sales_targets', 'barcode_registry'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public access policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public access policy" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- REALTIME REPLICATION SETUP
-- Enables live synchronization for core application tables
-- ==============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'items', 'locations', 'categories', 'transactions', 'purchases',
      'sales', 'expense_entries', 'customers', 'suppliers', 'stock_summaries',
      'memberships', 'organizations'
    ])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
