/**
 * Stockii -> Purit: Single-User Data Migration Script
 *
 * This script safely migrates ONLY ONE specific user's data from Firebase Firestore
 * to the Purit Supabase PostgreSQL database.
 *
 * Modes of Operation:
 * 1. Admin Mode (Recommended):
 *    node scripts/migrate-user.mjs --service-account ./serviceAccountKey.json --email taharakerala@gmail.com
 *
 * 2. Client Auth Mode (Using user password):
 *    node scripts/migrate-user.mjs --email taharakerala@gmail.com --password <password>
 *
 * Options:
 *    --dry-run       Preview data to be migrated without inserting anything into Supabase
 *    --uid <uid>     Explicitly provide full Firebase UID if known
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Setup paths and load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Look for .env in current folder, stockii, or purit
const possibleEnvPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../purit/.env'),
  'c:/Users/my pcc/Desktop/purit/.env',
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// Command-line argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    serviceAccount: null,
    email: 'taharakerala@gmail.com',
    password: null,
    uid: null,
    dryRun: false,
    supabaseUrl: process.env.VITE_SUPABASE_URL || 'https://ddhpwqwgjlndmrqeojde.supabase.co',
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--service-account' && args[i + 1]) {
      params.serviceAccount = args[++i];
    } else if (arg === '--email' && args[i + 1]) {
      params.email = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      params.password = args[++i];
    } else if (arg === '--uid' && args[i + 1]) {
      params.uid = args[++i];
    } else if (arg === '--dry-run') {
      params.dryRun = true;
    } else if (arg === '--supabase-url' && args[i + 1]) {
      params.supabaseUrl = args[++i];
    } else if (arg === '--supabase-key' && args[i + 1]) {
      params.supabaseKey = args[++i];
    }
  }

  return params;
}

const config = parseArgs();

console.log('====================================================');
console.log('   STOCKII -> PURIT SINGLE-USER MIGRATION SCRIPT    ');
console.log('====================================================');
console.log(`Target User Email : ${config.email}`);
if (config.uid) console.log(`Target User UID   : ${config.uid}`);
console.log(`Dry Run Mode      : ${config.dryRun ? 'YES (Preview only, no DB writes)' : 'NO (Will write to Supabase)'}`);
console.log(`Supabase URL      : ${config.supabaseUrl}`);
console.log('====================================================\n');

if (!config.supabaseKey) {
  console.error('❌ Error: VITE_SUPABASE_ANON_KEY is not defined in .env or passed via --supabase-key');
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// Batch upsert utility into Supabase
async function safeBatchUpsert(tableName, rows, keyField = 'id') {
  if (!rows || rows.length === 0) return 0;
  if (config.dryRun) {
    console.log(`  [DRY-RUN] Would upsert ${rows.length} rows into table '${tableName}'`);
    return rows.length;
  }

  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict: keyField });
    if (error) {
      console.error(`  ❌ Error upserting into '${tableName}' (batch ${i / BATCH_SIZE + 1}):`, error.message);
      throw error;
    }
    inserted += batch.length;
  }

  console.log(`  ✅ Successfully upserted ${inserted} rows into '${tableName}'`);
  return inserted;
}

// -------------------------------------------------------------------
// EXECUTION METHOD 1: Firebase Admin SDK
// -------------------------------------------------------------------
async function runWithAdminSdk(serviceAccountPath) {
  console.log(`🔐 Initializing Firebase Admin SDK with credentials from: ${serviceAccountPath}`);

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found at: ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  let app;
  let auth;
  let db;

  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');

    const apps = typeof getApps === 'function' ? getApps() : [];
    app = apps.length > 0 ? apps[0] : initializeApp({ credential: cert(serviceAccount) });
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (_modularErr) {
    const adminModule = await import('firebase-admin');
    const admin = adminModule.default || adminModule;
    const apps = admin.apps || (typeof admin.getApps === 'function' ? admin.getApps() : []);
    if (!apps || !apps.length) {
      app = admin.initializeApp({
        credential: admin.credential ? admin.credential.cert(serviceAccount) : undefined,
      });
    } else {
      app = apps[0];
    }
    auth = typeof admin.auth === 'function' ? admin.auth() : (await import('firebase-admin/auth')).getAuth(app);
    db = typeof admin.firestore === 'function' ? admin.firestore() : (await import('firebase-admin/firestore')).getFirestore(app);
  }

  // 1. Resolve Target User
  let targetUserRecord;
  try {
    if (config.uid) {
      targetUserRecord = await auth.getUser(config.uid);
    } else {
      targetUserRecord = await auth.getUserByEmail(config.email);
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not find user via Admin Auth (${err.message}). Searching /users in Firestore...`);
  }

  const targetUid = targetUserRecord ? targetUserRecord.uid : config.uid;
  if (!targetUid) {
    throw new Error(`Could not determine Firebase UID for user: ${config.email}. Please provide --uid.`);
  }

  console.log(`\n👤 Located Target User:`);
  console.log(`   Email : ${config.email}`);
  console.log(`   UID   : ${targetUid}`);

  // 2. Fetch User Profile Doc
  const userDocRef = db.collection('users').doc(targetUid);
  const userDocSnap = await userDocRef.get();
  const userData = userDocSnap.exists
    ? userDocSnap.data()
    : {
        uid: targetUid,
        email: config.email,
        displayName: targetUserRecord?.displayName || config.email.split('@')[0],
        photoURL: targetUserRecord?.photoURL || null,
        createdAt: Date.now(),
      };

  const userRow = {
    uid: targetUid,
    email: userData.email || config.email,
    displayName: userData.displayName || 'User',
    photoURL: userData.photoURL || null,
    createdAt: userData.createdAt || Date.now(),
  };

  // 3. Find User's Organizations & Memberships
  console.log(`\n🏢 Locating User Organizations & Memberships...`);
  const membershipsSnap = await db.collection('memberships').where('userId', '==', targetUid).get();
  const memberships = [];
  const orgIdsSet = new Set();

  membershipsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    memberships.push({
      id: docSnap.id,
      orgId: data.orgId,
      userId: targetUid,
      role: data.role || 'owner',
      joinedAt: data.joinedAt || Date.now(),
      allowedModules: data.allowedModules || {},
    });
    if (data.orgId) orgIdsSet.add(data.orgId);
  });

  // Also check organizations where ownerId == targetUid
  const ownedOrgsSnap = await db.collection('organizations').where('ownerId', '==', targetUid).get();
  const orgs = [];

  ownedOrgsSnap.forEach((docSnap) => {
    orgIdsSet.add(docSnap.id);
  });

  for (const orgId of orgIdsSet) {
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (orgDoc.exists) {
      const d = orgDoc.data();
      orgs.push({
        id: orgDoc.id,
        name: d.name || 'My Organization',
        slug: d.slug || 'my-organization',
        ownerId: d.ownerId || targetUid,
        createdAt: d.createdAt || Date.now(),
        settings: d.settings || {},
      });
    }
  }

  console.log(`   Found ${orgs.length} organization(s) and ${memberships.length} membership(s) for user.`);

  // 4. Fetch all subcollections for each organization
  const allItems = [];
  const allCategories = [];
  const allLocations = [];
  const allStockSummaries = [];
  const allTransactions = [];
  const allPurchases = [];
  const allSales = [];
  const allCustomers = [];
  const allSuppliers = [];
  const allPayments = [];
  const allCashLedger = [];
  const allExpenses = [];
  const allTrucks = [];
  const allCustomerReturns = [];
  const allSalesTargets = [];
  const allBarcodes = [];

  for (const org of orgs) {
    const orgId = org.id;
    console.log(`\n📦 Reading Subcollections for Organization '${org.name}' (${orgId})...`);

    // Helper to get subcollection docs
    const getSub = async (collName) => {
      const snap = await db.collection(`organizations/${orgId}/${collName}`).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    };

    // Items
    const items = await getSub('items');
    for (const item of items) {
      allItems.push({
        id: item.id,
        orgId,
        sku: item.sku || null,
        barcode: item.barcode || null,
        name: item.name,
        description: item.description || null,
        categoryId: item.categoryId || null,
        unit: item.unit || 'pcs',
        basePrice: Number(item.basePrice) || 0,
        sellingPrice: Number(item.sellingPrice) || 0,
        currentStock: Number(item.currentStock) || 0,
        reorderThreshold: Number(item.reorderThreshold) || 0,
        isActive: item.isActive !== false,
        isDeleted: Boolean(item.isDeleted),
        deletedAt: item.deletedAt || null,
        createdAt: item.createdAt || Date.now(),
        hsnSac: item.hsnSac || null,
      });
    }

    // Categories
    const categories = await getSub('categories');
    for (const cat of categories) {
      allCategories.push({
        id: cat.id,
        orgId,
        name: cat.name,
        description: cat.description || null,
      });
    }

    // Locations
    const locations = await getSub('locations');
    for (const loc of locations) {
      allLocations.push({
        id: loc.id,
        orgId,
        name: loc.name,
        type: loc.type || 'warehouse',
        isDefault: Boolean(loc.isDefault),
      });
    }

    // Stock Summaries
    const summaries = await getSub('stockSummaries');
    for (const s of summaries) {
      allStockSummaries.push({
        id: s.id || `${s.itemId}_${s.locationId}`,
        orgId,
        itemId: s.itemId,
        locationId: s.locationId,
        quantity: Number(s.quantity) || 0,
      });
    }

    // Transactions
    const transactions = await getSub('transactions');
    for (const tx of transactions) {
      allTransactions.push({
        id: tx.id,
        orgId,
        itemId: tx.itemId,
        type: tx.type,
        sourceLocationId: tx.sourceLocationId || null,
        destinationLocationId: tx.destinationLocationId || null,
        quantity: Number(tx.quantity) || 0,
        unitCost: tx.unitCost != null ? Number(tx.unitCost) : null,
        unitSellPrice: tx.unitSellPrice != null ? Number(tx.unitSellPrice) : null,
        referenceId: tx.referenceId || null,
        userId: tx.userId || targetUid,
        timestamp: tx.timestamp || Date.now(),
        notes: tx.notes || null,
        status: tx.status || 'completed',
      });
    }

    // Purchases
    const purchases = await getSub('purchases');
    for (const p of purchases) {
      allPurchases.push({
        id: p.id,
        orgId,
        supplierId: p.supplierId,
        locationId: p.locationId,
        items: p.items || [],
        previousDueAmount: Number(p.previousDueAmount) || 0,
        totalAmount: Number(p.totalAmount) || 0,
        paidAmount: Number(p.paidAmount) || 0,
        paymentType: p.paymentType || 'cash',
        status: p.status || 'completed',
        timestamp: p.timestamp || Date.now(),
        userId: p.userId || targetUid,
        notes: p.notes || null,
      });
    }

    // Sales
    const sales = await getSub('sales');
    for (const s of sales) {
      allSales.push({
        id: s.id,
        orgId,
        customerId: s.customerId,
        locationId: s.locationId,
        items: s.items || [],
        previousDueAmount: Number(s.previousDueAmount) || 0,
        totalAmount: Number(s.totalAmount) || 0,
        paidAmount: Number(s.paidAmount) || 0,
        taxAmount: Number(s.taxAmount) || 0,
        paymentType: s.paymentType || 'cash',
        status: s.status || 'completed',
        timestamp: s.timestamp || Date.now(),
        userId: s.userId || targetUid,
        notes: s.notes || null,
        isGstBill: Boolean(s.isGstBill),
        gstAmount: Number(s.gstAmount) || 0,
        taxRate: Number(s.taxRate) || 0,
        gstBillNumber: s.gstBillNumber || null,
      });
    }

    // Customers
    const customers = await getSub('customers');
    for (const c of customers) {
      allCustomers.push({
        id: c.id,
        orgId,
        name: c.name,
        shopName: c.shopName || null,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        route: c.route || null,
        balance: Number(c.balance) || 0,
        gstin: c.gstin || null,
      });
    }

    // Suppliers
    const suppliers = await getSub('suppliers');
    for (const sup of suppliers) {
      allSuppliers.push({
        id: sup.id,
        orgId,
        name: sup.name,
        companyName: sup.companyName || null,
        contactPerson: sup.contactPerson || null,
        phone: sup.phone || null,
        email: sup.email || null,
        address: sup.address || null,
        balance: Number(sup.balance) || 0,
      });
    }

    // Payments
    const payments = await getSub('payments');
    for (const pay of payments) {
      allPayments.push({
        id: pay.id,
        orgId,
        entityType: pay.entityType || 'customer',
        entityId: pay.entityId,
        amount: Number(pay.amount) || 0,
        direction: pay.direction || null,
        balanceAfter: pay.balanceAfter != null ? Number(pay.balanceAfter) : null,
        paymentMethod: pay.paymentMethod || 'cash',
        referenceId: pay.referenceId || null,
        timestamp: pay.timestamp || Date.now(),
        userId: pay.userId || targetUid,
        notes: pay.notes || null,
      });
    }

    // Cash Ledger
    const ledger = await getSub('cashLedger');
    for (const l of ledger) {
      allCashLedger.push({
        id: l.id,
        orgId,
        saleId: l.saleId,
        type: l.type || 'receipt',
        amount: Number(l.amount) || 0,
        timestamp: l.timestamp || Date.now(),
        description: l.description || '',
      });
    }

    // Expense Entries
    const expenses = await getSub('expenseEntries');
    for (const exp of expenses) {
      allExpenses.push({
        id: exp.id,
        orgId,
        amount: Number(exp.amount) || 0,
        entryDate: exp.entryDate || Date.now(),
        name: exp.name || 'Expense',
        type: exp.type || 'expense',
        category: exp.category || 'Petrol',
        note: exp.note || null,
        attachmentName: exp.attachmentName || null,
        attachmentDataUrl: exp.attachmentDataUrl || null,
        createdAt: exp.createdAt || Date.now(),
        userId: exp.userId || targetUid,
        userRole: exp.userRole || null,
      });
    }

    // Trucks
    const trucks = await getSub('trucks');
    for (const t of trucks) {
      allTrucks.push({
        id: t.id,
        orgId,
        locationId: t.locationId,
        name: t.name,
        plateNumber: t.plateNumber || null,
        driverId: t.driverId || null,
        isActive: t.isActive !== false,
        createdAt: t.createdAt || Date.now(),
      });
    }

    // Customer Returns
    const returns = await getSub('customerReturns');
    for (const ret of returns) {
      allCustomerReturns.push({
        id: ret.id,
        orgId,
        saleId: ret.saleId || null,
        customerId: ret.customerId,
        locationId: ret.locationId,
        items: ret.items || [],
        totalAmount: Number(ret.totalAmount) || 0,
        reason: ret.reason || null,
        timestamp: ret.timestamp || Date.now(),
        userId: ret.userId || targetUid,
      });
    }

    // Sales Targets
    const targets = await getSub('salesTargets');
    for (const tgt of targets) {
      allSalesTargets.push({
        id: tgt.id,
        orgId,
        userId: tgt.userId || targetUid,
        year: Number(tgt.year),
        month: Number(tgt.month),
        targetAmount: Number(tgt.targetAmount) || 0,
        createdAt: tgt.createdAt || Date.now(),
        updatedAt: tgt.updatedAt || Date.now(),
      });
    }

    // Barcode Registry
    const barcodes = await getSub('barcodeRegistry');
    for (const b of barcodes) {
      allBarcodes.push({
        barcode: b.barcode || b.id,
        orgId,
        itemId: b.itemId,
        createdAt: b.createdAt || Date.now(),
      });
    }
  }

  // 5. Execute Migration into Supabase
  console.log('\n🚀 Starting Upsert into Purit Supabase...');

  await safeBatchUpsert('users', [userRow], 'uid');
  await safeBatchUpsert('organizations', orgs, 'id');
  await safeBatchUpsert('memberships', memberships, 'id');
  await safeBatchUpsert('categories', allCategories, 'id');
  await safeBatchUpsert('locations', allLocations, 'id');
  await safeBatchUpsert('items', allItems, 'id');
  await safeBatchUpsert('stock_summaries', allStockSummaries, 'id');
  await safeBatchUpsert('customers', allCustomers, 'id');
  await safeBatchUpsert('suppliers', allSuppliers, 'id');
  await safeBatchUpsert('trucks', allTrucks, 'id');
  await safeBatchUpsert('sales', allSales, 'id');
  await safeBatchUpsert('purchases', allPurchases, 'id');
  await safeBatchUpsert('payments', allPayments, 'id');
  await safeBatchUpsert('transactions', allTransactions, 'id');
  await safeBatchUpsert('cash_ledger', allCashLedger, 'id');
  await safeBatchUpsert('expense_entries', allExpenses, 'id');
  await safeBatchUpsert('customer_returns', allCustomerReturns, 'id');
  await safeBatchUpsert('sales_targets', allSalesTargets, 'id');
  await safeBatchUpsert('barcode_registry', allBarcodes, 'barcode');

  if (config.dryRun) {
    console.log('\n🔍 [DRY-RUN] Preview completed successfully for user:', config.email);
    console.log('   ⚠️  NOTE: No changes were written to Supabase because --dry-run was active.');
    console.log('   To actually write this data into Supabase, re-run the command without --dry-run.\n');
  } else {
    console.log('\n🎉 Migration completed successfully for user:', config.email);
    console.log('   ✅ All records have been written to your Supabase tables!\n');
  }
}

// -------------------------------------------------------------------
// EXECUTION METHOD 2: Firebase Client SDK (Email & Password)
// -------------------------------------------------------------------
async function runWithClientSdk(email, password) {
  console.log(`🔑 Authenticating with Firebase Client SDK as: ${email}...`);
  const { initializeApp } = await import('firebase/app');
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  const { getFirestore, doc, getDoc, getDocs, collection, query, where } = await import('firebase/firestore');

  const firebaseConfig = {
    apiKey: 'AIzaSyBycgkpXfqXRvR7xcYpGyDAwwV-G3Zi-Fo',
    authDomain: 'stockiiapp.firebaseapp.com',
    projectId: 'stockiiapp',
    storageBucket: 'stockiiapp.firebasestorage.app',
    messagingSenderId: '1050515511880',
    appId: '1:1050515511880:web:209bbe0ff76f6708f6967d',
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const targetUid = cred.user.uid;
  console.log(`✅ Authenticated! Target User UID: ${targetUid}`);

  // Fetch User Doc
  const userSnap = await getDoc(doc(db, 'users', targetUid));
  const userData = userSnap.exists()
    ? userSnap.data()
    : {
        uid: targetUid,
        email,
        displayName: cred.user.displayName || email.split('@')[0],
        photoURL: cred.user.photoURL || null,
        createdAt: Date.now(),
      };

  const userRow = {
    uid: targetUid,
    email: userData.email || email,
    displayName: userData.displayName || 'User',
    photoURL: userData.photoURL || null,
    createdAt: userData.createdAt || Date.now(),
  };

  // Find User's Memberships & Organizations
  console.log(`\n🏢 Loading Memberships & Organizations...`);
  const mSnap = await getDocs(query(collection(db, 'memberships'), where('userId', '==', targetUid)));
  const memberships = [];
  const orgIdsSet = new Set();

  mSnap.forEach((docSnap) => {
    const data = docSnap.data();
    memberships.push({
      id: docSnap.id,
      orgId: data.orgId,
      userId: targetUid,
      role: data.role || 'owner',
      joinedAt: data.joinedAt || Date.now(),
      allowedModules: data.allowedModules || {},
    });
    if (data.orgId) orgIdsSet.add(data.orgId);
  });

  const orgs = [];
  for (const orgId of orgIdsSet) {
    const orgSnap = await getDoc(doc(db, 'organizations', orgId));
    if (orgSnap.exists()) {
      const d = orgSnap.data();
      orgs.push({
        id: orgSnap.id,
        name: d.name || 'My Organization',
        slug: d.slug || 'my-organization',
        ownerId: d.ownerId || targetUid,
        createdAt: d.createdAt || Date.now(),
        settings: d.settings || {},
      });
    }
  }

  console.log(`   Found ${orgs.length} organization(s) and ${memberships.length} membership(s).`);

  // Subcollection containers
  const allItems = [];
  const allCategories = [];
  const allLocations = [];
  const allStockSummaries = [];
  const allTransactions = [];
  const allPurchases = [];
  const allSales = [];
  const allCustomers = [];
  const allSuppliers = [];
  const allPayments = [];
  const allCashLedger = [];
  const allExpenses = [];
  const allTrucks = [];
  const allCustomerReturns = [];
  const allSalesTargets = [];
  const allBarcodes = [];

  for (const org of orgs) {
    const orgId = org.id;
    console.log(`\n📦 Reading Subcollections for Organization '${org.name}' (${orgId})...`);

    const getSubDocs = async (collPath) => {
      try {
        const snap = await getDocs(collection(db, `organizations/${orgId}/${collPath}`));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn(`  ⚠️ Could not read ${collPath}: ${e.message}`);
        return [];
      }
    };

    // Items
    const items = await getSubDocs('items');
    for (const item of items) {
      allItems.push({
        id: item.id,
        orgId,
        sku: item.sku || null,
        barcode: item.barcode || null,
        name: item.name,
        description: item.description || null,
        categoryId: item.categoryId || null,
        unit: item.unit || 'pcs',
        basePrice: Number(item.basePrice) || 0,
        sellingPrice: Number(item.sellingPrice) || 0,
        currentStock: Number(item.currentStock) || 0,
        reorderThreshold: Number(item.reorderThreshold) || 0,
        isActive: item.isActive !== false,
        isDeleted: Boolean(item.isDeleted),
        deletedAt: item.deletedAt || null,
        createdAt: item.createdAt || Date.now(),
        hsnSac: item.hsnSac || null,
      });
    }

    // Categories
    const categories = await getSubDocs('categories');
    for (const cat of categories) {
      allCategories.push({
        id: cat.id,
        orgId,
        name: cat.name,
        description: cat.description || null,
      });
    }

    // Locations
    const locations = await getSubDocs('locations');
    for (const loc of locations) {
      allLocations.push({
        id: loc.id,
        orgId,
        name: loc.name,
        type: loc.type || 'warehouse',
        isDefault: Boolean(loc.isDefault),
      });
    }

    // Stock Summaries
    const summaries = await getSubDocs('stockSummaries');
    for (const s of summaries) {
      allStockSummaries.push({
        id: s.id || `${s.itemId}_${s.locationId}`,
        orgId,
        itemId: s.itemId,
        locationId: s.locationId,
        quantity: Number(s.quantity) || 0,
      });
    }

    // Transactions
    const transactions = await getSubDocs('transactions');
    for (const tx of transactions) {
      allTransactions.push({
        id: tx.id,
        orgId,
        itemId: tx.itemId,
        type: tx.type,
        sourceLocationId: tx.sourceLocationId || null,
        destinationLocationId: tx.destinationLocationId || null,
        quantity: Number(tx.quantity) || 0,
        unitCost: tx.unitCost != null ? Number(tx.unitCost) : null,
        unitSellPrice: tx.unitSellPrice != null ? Number(tx.unitSellPrice) : null,
        referenceId: tx.referenceId || null,
        userId: tx.userId || targetUid,
        timestamp: tx.timestamp || Date.now(),
        notes: tx.notes || null,
        status: tx.status || 'completed',
      });
    }

    // Purchases
    const purchases = await getSubDocs('purchases');
    for (const p of purchases) {
      allPurchases.push({
        id: p.id,
        orgId,
        supplierId: p.supplierId,
        locationId: p.locationId,
        items: p.items || [],
        previousDueAmount: Number(p.previousDueAmount) || 0,
        totalAmount: Number(p.totalAmount) || 0,
        paidAmount: Number(p.paidAmount) || 0,
        paymentType: p.paymentType || 'cash',
        status: p.status || 'completed',
        timestamp: p.timestamp || Date.now(),
        userId: p.userId || targetUid,
        notes: p.notes || null,
      });
    }

    // Sales
    const sales = await getSubDocs('sales');
    for (const s of sales) {
      allSales.push({
        id: s.id,
        orgId,
        customerId: s.customerId,
        locationId: s.locationId,
        items: s.items || [],
        previousDueAmount: Number(s.previousDueAmount) || 0,
        totalAmount: Number(s.totalAmount) || 0,
        paidAmount: Number(s.paidAmount) || 0,
        taxAmount: Number(s.taxAmount) || 0,
        paymentType: s.paymentType || 'cash',
        status: s.status || 'completed',
        timestamp: s.timestamp || Date.now(),
        userId: s.userId || targetUid,
        notes: s.notes || null,
        isGstBill: Boolean(s.isGstBill),
        gstAmount: Number(s.gstAmount) || 0,
        taxRate: Number(s.taxRate) || 0,
        gstBillNumber: s.gstBillNumber || null,
      });
    }

    // Customers
    const customers = await getSubDocs('customers');
    for (const c of customers) {
      allCustomers.push({
        id: c.id,
        orgId,
        name: c.name,
        shopName: c.shopName || null,
        phone: c.phone || null,
        email: c.email || null,
        address: c.address || null,
        route: c.route || null,
        balance: Number(c.balance) || 0,
        gstin: c.gstin || null,
      });
    }

    // Suppliers
    const suppliers = await getSubDocs('suppliers');
    for (const sup of suppliers) {
      allSuppliers.push({
        id: sup.id,
        orgId,
        name: sup.name,
        companyName: sup.companyName || null,
        contactPerson: sup.contactPerson || null,
        phone: sup.phone || null,
        email: sup.email || null,
        address: sup.address || null,
        balance: Number(sup.balance) || 0,
      });
    }

    // Payments
    const payments = await getSubDocs('payments');
    for (const pay of payments) {
      allPayments.push({
        id: pay.id,
        orgId,
        entityType: pay.entityType || 'customer',
        entityId: pay.entityId,
        amount: Number(pay.amount) || 0,
        direction: pay.direction || null,
        balanceAfter: pay.balanceAfter != null ? Number(pay.balanceAfter) : null,
        paymentMethod: pay.paymentMethod || 'cash',
        referenceId: pay.referenceId || null,
        timestamp: pay.timestamp || Date.now(),
        userId: pay.userId || targetUid,
        notes: pay.notes || null,
      });
    }

    // Cash Ledger
    const ledger = await getSubDocs('cashLedger');
    for (const l of ledger) {
      allCashLedger.push({
        id: l.id,
        orgId,
        saleId: l.saleId,
        type: l.type || 'receipt',
        amount: Number(l.amount) || 0,
        timestamp: l.timestamp || Date.now(),
        description: l.description || '',
      });
    }

    // Expense Entries
    const expenses = await getSubDocs('expenseEntries');
    for (const exp of expenses) {
      allExpenses.push({
        id: exp.id,
        orgId,
        amount: Number(exp.amount) || 0,
        entryDate: exp.entryDate || Date.now(),
        name: exp.name || 'Expense',
        type: exp.type || 'expense',
        category: exp.category || 'Petrol',
        note: exp.note || null,
        attachmentName: exp.attachmentName || null,
        attachmentDataUrl: exp.attachmentDataUrl || null,
        createdAt: exp.createdAt || Date.now(),
        userId: exp.userId || targetUid,
        userRole: exp.userRole || null,
      });
    }

    // Trucks
    const trucks = await getSubDocs('trucks');
    for (const t of trucks) {
      allTrucks.push({
        id: t.id,
        orgId,
        locationId: t.locationId,
        name: t.name,
        plateNumber: t.plateNumber || null,
        driverId: t.driverId || null,
        isActive: t.isActive !== false,
        createdAt: t.createdAt || Date.now(),
      });
    }

    // Customer Returns
    const returns = await getSubDocs('customerReturns');
    for (const ret of returns) {
      allCustomerReturns.push({
        id: ret.id,
        orgId,
        saleId: ret.saleId || null,
        customerId: ret.customerId,
        locationId: ret.locationId,
        items: ret.items || [],
        totalAmount: Number(ret.totalAmount) || 0,
        reason: ret.reason || null,
        timestamp: ret.timestamp || Date.now(),
        userId: ret.userId || targetUid,
      });
    }

    // Sales Targets
    const targets = await getSubDocs('salesTargets');
    for (const tgt of targets) {
      allSalesTargets.push({
        id: tgt.id,
        orgId,
        userId: tgt.userId || targetUid,
        year: Number(tgt.year),
        month: Number(tgt.month),
        targetAmount: Number(tgt.targetAmount) || 0,
        createdAt: tgt.createdAt || Date.now(),
        updatedAt: tgt.updatedAt || Date.now(),
      });
    }

    // Barcode Registry
    const barcodes = await getSubDocs('barcodeRegistry');
    for (const b of barcodes) {
      allBarcodes.push({
        barcode: b.barcode || b.id,
        orgId,
        itemId: b.itemId,
        createdAt: b.createdAt || Date.now(),
      });
    }
  }

  // Upsert into Purit Supabase
  console.log('\n🚀 Starting Upsert into Purit Supabase...');

  await safeBatchUpsert('users', [userRow], 'uid');
  await safeBatchUpsert('organizations', orgs, 'id');
  await safeBatchUpsert('memberships', memberships, 'id');
  await safeBatchUpsert('categories', allCategories, 'id');
  await safeBatchUpsert('locations', allLocations, 'id');
  await safeBatchUpsert('items', allItems, 'id');
  await safeBatchUpsert('stock_summaries', allStockSummaries, 'id');
  await safeBatchUpsert('customers', allCustomers, 'id');
  await safeBatchUpsert('suppliers', allSuppliers, 'id');
  await safeBatchUpsert('trucks', allTrucks, 'id');
  await safeBatchUpsert('sales', allSales, 'id');
  await safeBatchUpsert('purchases', allPurchases, 'id');
  await safeBatchUpsert('payments', allPayments, 'id');
  await safeBatchUpsert('transactions', allTransactions, 'id');
  await safeBatchUpsert('cash_ledger', allCashLedger, 'id');
  await safeBatchUpsert('expense_entries', allExpenses, 'id');
  await safeBatchUpsert('customer_returns', allCustomerReturns, 'id');
  await safeBatchUpsert('sales_targets', allSalesTargets, 'id');
  await safeBatchUpsert('barcode_registry', allBarcodes, 'barcode');

  if (config.dryRun) {
    console.log('\n🔍 [DRY-RUN] Preview completed successfully for user:', email);
    console.log('   ⚠️  NOTE: No changes were written to Supabase because --dry-run was active.');
    console.log('   To actually write this data into Supabase, re-run the command without --dry-run.\n');
  } else {
    console.log('\n🎉 Migration completed successfully for user:', email);
    console.log('   ✅ All records have been written to your Supabase tables!\n');
  }
}

// -------------------------------------------------------------------
// MAIN ENTRY POINT
// -------------------------------------------------------------------
async function main() {
  try {
    if (config.serviceAccount) {
      await runWithAdminSdk(config.serviceAccount);
    } else if (config.password) {
      await runWithClientSdk(config.email, config.password);
    } else {
      console.log('ℹ️ No service account key or password provided.\n');
      console.log('Please run the script using ONE of these two methods:\n');
      console.log('Method 1 (Firebase Admin SDK - Easiest & Most Reliable):');
      console.log('  1. Download your service account key JSON from Firebase Console:');
      console.log('     Project settings > Service accounts > "Generate new private key"');
      console.log('  2. Save it as "serviceAccountKey.json" in this directory');
      console.log('  3. Run:');
      console.log(`     node scripts/migrate-user.mjs --service-account ./serviceAccountKey.json --email ${config.email}\n`);
      console.log('Method 2 (Using User Email & Password):');
      console.log(`     node scripts/migrate-user.mjs --email ${config.email} --password YOUR_PASSWORD\n`);
      console.log('Tip: Add `--dry-run` to preview the records without modifying Supabase.');
    }
  } catch (error) {
    console.error('\n❌ Migration Failed:', error);
    process.exit(1);
  }
}

main();
