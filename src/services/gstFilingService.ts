import { supabase } from '../supabaseClient';
import { Customer, Sale, CustomerReturn, Purchase, Item, OrganizationSettings } from '../types';
import { orgService } from './orgService';
import { GstPeriodOption, compileGstFilingReport, GstFilingReport } from '../utils/gstUtils';

export const gstFilingService = {
  async fetchPeriodReport({
    orgId,
    periodOption,
    settings,
  }: {
    orgId: string;
    periodOption: GstPeriodOption;
    settings?: OrganizationSettings;
  }): Promise<GstFilingReport> {
    const { startDate, endDate } = periodOption;

    // 1. Fetch completed & all sales in date range
    const [salesRes, returnsRes, purchasesRes, customersRes, itemsRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*')
        .eq('orgId', orgId)
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .order('timestamp', { ascending: true }),
      supabase
        .from('customer_returns')
        .select('*')
        .eq('orgId', orgId)
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .order('timestamp', { ascending: true }),
      supabase
        .from('purchases')
        .select('*')
        .eq('orgId', orgId)
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .order('timestamp', { ascending: true }),
      supabase
        .from('customers')
        .select('*')
        .eq('orgId', orgId),
      supabase
        .from('items')
        .select('*')
        .eq('orgId', orgId),
    ]);

    const allSales = (salesRes.data || []) as Sale[];
    const returns = (returnsRes.data || []) as CustomerReturn[];
    const purchases = (purchasesRes.data || []) as Purchase[];
    const customers = (customersRes.data || []) as Customer[];
    const items = (itemsRes.data || []) as Item[];

    const activeSales = allSales.filter(s => s.status !== 'cancelled');
    const cancelledSales = allSales.filter(s => s.status === 'cancelled');

    const customersMap = new Map<string, Customer>(customers.map(c => [c.id, c]));
    const itemsMap = new Map<string, Item>(items.map(i => [i.id, i]));

    return compileGstFilingReport({
      sales: activeSales,
      cancelledSales,
      returns,
      purchases,
      customersMap,
      itemsMap,
      settings,
      periodOption,
    });
  },

  async markPeriodAsFiled(
    orgId: string,
    currentSettings: OrganizationSettings,
    periodKey: string,
    filingInfo: { filedAt: number; arn?: string; notes?: string }
  ): Promise<OrganizationSettings> {
    const existingFiled = currentSettings.gstFiledMonths || {};
    const updatedFiled = {
      ...existingFiled,
      [periodKey]: {
        filedAt: filingInfo.filedAt || Date.now(),
        arn: filingInfo.arn?.trim() || undefined,
        notes: filingInfo.notes?.trim() || undefined,
      },
    };

    const nextSettings: OrganizationSettings = {
      ...currentSettings,
      gstFiledMonths: updatedFiled,
    };

    try {
      localStorage.setItem(`purit_gst_filed_${orgId}_${periodKey}`, JSON.stringify(updatedFiled[periodKey]));
    } catch {}

    await orgService.updateSettings(orgId, nextSettings);
    return nextSettings;
  },

  async unmarkPeriodAsFiled(
    orgId: string,
    currentSettings: OrganizationSettings,
    periodKey: string
  ): Promise<OrganizationSettings> {
    const existingFiled = { ...(currentSettings.gstFiledMonths || {}) };
    delete existingFiled[periodKey];

    const nextSettings: OrganizationSettings = {
      ...currentSettings,
      gstFiledMonths: existingFiled,
    };

    try {
      localStorage.removeItem(`purit_gst_filed_${orgId}_${periodKey}`);
    } catch {}

    await orgService.updateSettings(orgId, nextSettings);
    return nextSettings;
  },

  checkIfTimestampInFiledPeriod(
    settings: OrganizationSettings | undefined,
    timestamp: number
  ): { isFiled: boolean; periodKey?: string; filedAt?: number; arn?: string } {
    if (!settings?.gstFiledMonths) return { isFiled: false };

    const date = new Date(timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const filing = settings.gstFiledMonths[monthKey];

    if (filing) {
      return {
        isFiled: true,
        periodKey: monthKey,
        filedAt: filing.filedAt,
        arn: filing.arn,
      };
    }

    return { isFiled: false };
  },
};

