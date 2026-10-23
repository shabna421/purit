import { supabase } from '../supabaseClient';
import { Organization, OrganizationSettings, Membership, Role } from '../types';
import { generateId } from './dbUtils';

export const orgService = {
  async getOrganization(orgId: string): Promise<Organization | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching organization:', error);
      throw new Error(error.message);
    }
    return data as Organization | null;
  },

  async updateSettings(orgId: string, settings: Partial<OrganizationSettings>): Promise<void> {
    const org = await this.getOrganization(orgId);
    const currentSettings: Partial<OrganizationSettings> = org?.settings || {};
    const nextSettings = {
      ...currentSettings,
      ...settings,
      modules: {
        ...(currentSettings.modules || {}),
        ...(settings.modules || {}),
      },
    };

    const { error } = await supabase
      .from('organizations')
      .update({ settings: nextSettings })
      .eq('id', orgId);

    if (error) {
      console.error('Error updating organization settings:', error);
      throw new Error(error.message);
    }
  },

  async getMemberships(orgId: string): Promise<Membership[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('orgId', orgId);

    if (error) {
      console.error('Error fetching memberships:', error);
      throw new Error(error.message);
    }
    return (data || []) as Membership[];
  },

  async updateMemberRole(membershipId: string, role: Role): Promise<void> {
    const { error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('id', membershipId);

    if (error) {
      console.error('Error updating member role:', error);
      throw new Error(error.message);
    }
  },

  async createOrganization(ownerId: string, name: string, slug: string): Promise<Organization> {
    const orgId = generateId();
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
          alerts: true,
        },
      },
    };

    const membership: Membership = {
      id: `${ownerId}_${orgId}`,
      orgId,
      userId: ownerId,
      role: 'owner',
      joinedAt: Date.now(),
    };

    const { error: orgError } = await supabase
      .from('organizations')
      .insert(org);

    if (orgError) {
      console.error('Error creating organization:', orgError);
      throw new Error(orgError.message);
    }

    const { error: memError } = await supabase
      .from('memberships')
      .insert(membership);

    if (memError) {
      console.error('Error creating owner membership:', memError);
      throw new Error(memError.message);
    }

    return org;
  },
};
