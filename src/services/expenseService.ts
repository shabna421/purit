import { supabase } from '../supabaseClient';
import { ExpenseEntry } from '../types';
import { generateId, stripUndefined } from './dbUtils';

export const expenseService = {
  async getEntries(orgId: string): Promise<ExpenseEntry[]> {
    const { data, error } = await supabase
      .from('expense_entries')
      .select('*')
      .eq('orgId', orgId)
      .order('entryDate', { ascending: false });

    if (error) {
      console.error('Error fetching expense entries:', error);
      throw new Error(error.message);
    }
    return (data || []) as ExpenseEntry[];
  },

  async createEntry(
    orgId: string,
    userId: string,
    entry: Omit<ExpenseEntry, 'id' | 'orgId' | 'createdAt' | 'userId'>
  ): Promise<ExpenseEntry> {
    const id = generateId();
    const nextEntry = stripUndefined({
      ...entry,
      id,
      orgId,
      createdAt: Date.now(),
      userId,
    }) as ExpenseEntry;

    const { error } = await supabase
      .from('expense_entries')
      .insert(nextEntry);

    if (error) {
      console.error('Error creating expense entry:', error);
      throw new Error(error.message);
    }

    return nextEntry;
  },

  async updateEntry(
    orgId: string,
    entryId: string,
    updates: Partial<Pick<ExpenseEntry, 'amount' | 'entryDate' | 'name' | 'type' | 'category' | 'note' | 'attachmentName' | 'attachmentDataUrl'>>
  ): Promise<void> {
    const nextUpdates = stripUndefined(updates);
    const { error } = await supabase
      .from('expense_entries')
      .update(nextUpdates)
      .eq('id', entryId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error updating expense entry:', error);
      throw new Error(error.message);
    }
  },

  async deleteEntry(orgId: string, entryId: string): Promise<void> {
    const { error } = await supabase
      .from('expense_entries')
      .delete()
      .eq('id', entryId)
      .eq('orgId', orgId);

    if (error) {
      console.error('Error deleting expense entry:', error);
      throw new Error(error.message);
    }
  },
};
