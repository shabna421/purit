import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
    const ref = doc(db, 'organizations', orgId, 'salesTargets', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as SalesTarget;
  },

  async setTarget(
    orgId: string,
    userId: string,
    year: number,
    month: number,
    targetAmount: number
  ): Promise<SalesTarget> {
    const id = this.makeId(orgId, userId, year, month);
    const ref = doc(db, 'organizations', orgId, 'salesTargets', id);
    const now = Date.now();
    const existing = (await getDoc(ref)).data() as SalesTarget | undefined;
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
    await setDoc(ref, target);
    return target;
  },
};
