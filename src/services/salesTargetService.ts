import { supabase } from '../supabaseClient';
import { SalesTarget } from '../types';

export const salesTargetService = {
  /** Generate a deterministic document ID for a user/month target */
  makeId(orgId: string, userId: string, year: number, month: number): string {
    return `${orgId}_${userId}_${year}_${month}`;
  },

  async getTarget(
    orgId: string,
    userId: string,
    year: number,
    month: number
  ): Promise<SalesTarget | null> {
    const id = this.makeId(orgId, userId, year, month);
    const { data, error } = await supabase
      .from('sales_targets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching sales target:', error);
      throw new Error(error.message);
    }
    return data as SalesTarget | null;
  },

  async setTarget(
    orgId: string,
    userId: string,
    year: number,
    month: number,
    targetAmount: number
  ): Promise<SalesTarget> {
    const id = this.makeId(orgId, userId, year, month);
    const now = Date.now();
    const existing = await this.getTarget(orgId, userId, year, month);

    const target: SalesTarget = {
      id,
      orgId,
      userId,
      year,
      month,
      targetAmount,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const { error } = await supabase
      .from('sales_targets')
      .upsert(target);

    if (error) {
      console.error('Error saving sales target:', error);
      throw new Error(error.message);
    }

    return target;
  },
};
