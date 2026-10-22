import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { Organization, OrganizationSettings, Membership, Role, User } from '../types';

export const orgService = {
  async getOrganization(orgId: string) {
    const docRef = doc(db, 'organizations', orgId);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() as Organization : null;
  },

  async updateSettings(orgId: string, settings: Partial<OrganizationSettings>) {
    const docRef = doc(db, 'organizations', orgId);
    const snap = await getDoc(docRef);
    const currentSettings: Partial<OrganizationSettings> = snap.exists()
      ? ((snap.data() as Organization).settings || {})
      : {};
    const nextSettings = {
      ...currentSettings,
      ...settings,
      modules: {
        ...(currentSettings.modules || {}),
        ...(settings.modules || {}),
      },
    };
    await updateDoc(docRef, {
      settings: nextSettings
    });
  },

  async getMemberships(orgId: string) {
    const q = query(collection(db, 'memberships'), where('orgId', '==', orgId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Membership);
  },

  async updateMemberRole(membershipId: string, role: Role) {
    const docRef = doc(db, 'memberships', membershipId);
    await updateDoc(docRef, { role });
  },

  async createOrganization(ownerId: string, name: string, slug: string) {
    const orgId = doc(collection(db, 'organizations')).id;
    const org: Organization = {
      id: orgId,
      name,
      slug,
      ownerId,
      createdAt: Date.now(),
      settings: {
        currency: 'INR',
        taxEnabled: false,
        taxRate: 0,
        lastGstInvoiceNumber: '',
        multiLocationEnabled: false,
        enableBarcode: false,
        barcodeFormat: 'code128',
        tableDisplayMode: 'table',
        modules: {
          purchases: true,
          sales: true,
          inventory: true,
          finance: true,
          expenseTracker: true,
          returns: true,
          damages: true,
          customerCredit: true,
          supplierCredit: true,
          pdfInvoices: true,
          truckInventory: false,
          staffManagement: true,
          advancedReports: true,
          alerts: true
        }
      }
    };

    const membership: Membership = {
      id: `${ownerId}_${orgId}`,
      orgId,
      userId: ownerId,
      role: 'owner',
      joinedAt: Date.now()
    };

    await runTransaction(db, async (transaction) => {
      transaction.set(doc(db, 'organizations', orgId), org);
      transaction.set(doc(db, 'memberships', membership.id), membership);
    });

    return org;
  }
};
