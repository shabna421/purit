import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ExpenseEntry } from '../types';

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export const expenseService = {
  async getEntries(orgId: string) {
    const q = query(collection(db, `organizations/${orgId}/expenseEntries`), orderBy('entryDate', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as ExpenseEntry));
  },

  async createEntry(
    orgId: string,
    userId: string,
    entry: Omit<ExpenseEntry, 'id' | 'orgId' | 'createdAt' | 'userId'>
  ) {
    const entryRef = doc(collection(db, `organizations/${orgId}/expenseEntries`));
    const nextEntry = stripUndefined({
      ...entry,
      id: entryRef.id,
      orgId,
      createdAt: Date.now(),
      userId,
    }) as ExpenseEntry;

    await setDoc(entryRef, nextEntry);
    return nextEntry;
  },

  async updateEntry(
    orgId: string,
    entryId: string,
    updates: Partial<Pick<ExpenseEntry, 'amount' | 'entryDate' | 'name' | 'type' | 'category' | 'note' | 'attachmentName' | 'attachmentDataUrl'>>
  ) {
    const entryRef = doc(db, `organizations/${orgId}/expenseEntries`, entryId);
    const nextUpdates = stripUndefined(updates);
    await updateDoc(entryRef, nextUpdates);
  },

  async deleteEntry(orgId: string, entryId: string) {
    const entryRef = doc(db, `organizations/${orgId}/expenseEntries`, entryId);
    await deleteDoc(entryRef);
  },
};
