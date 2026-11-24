import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { MilkRecord } from '../models/milk.model';
import { FarmContextService } from './farm-context.service';

export interface SaveMilkRecordInput {
  herdGroupId: string;
  date: string;
  milkKg: number;
  milkPricePerKg: number;
  fatPct?: number | null;
  proteinPct?: number | null;
  feedCostPerHeadSnapshot?: number | null;
  headCountSnapshot?: number | null;
  hasFeedingSnapshot?: boolean;
  feedingCountAtSnapshot?: number | null;
}

/** Daily milk records at `/farms/{farmId}/milkRecords`. */
@Injectable({ providedIn: 'root' })
export class MilkService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getMilkRecords(herdGroupId?: string): Observable<MilkRecord[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const ref = collection(this.firestore, 'farms', farmId, 'milkRecords');
        const q = herdGroupId
          ? query(
              ref,
              where('herdGroupId', '==', herdGroupId),
              orderBy('date', 'desc'),
            )
          : query(ref, orderBy('date', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<MilkRecord[]>;
      }),
    );
  }

  /** Upsert one group/day record with a deterministic id. */
  async saveRecord(input: SaveMilkRecordInput): Promise<string> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    const id = `${input.herdGroupId}_${input.date}`;
    await setDoc(
      doc(this.firestore, 'farms', farmId, 'milkRecords', id),
      {
        ...input,
        farmId,
        source: 'manual',
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return id;
  }

  async deleteRecord(herdGroupId: string, date: string): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    await deleteDoc(
      doc(
        this.firestore,
        'farms',
        farmId,
        'milkRecords',
        `${herdGroupId}_${date}`,
      ),
    );
  }
}
