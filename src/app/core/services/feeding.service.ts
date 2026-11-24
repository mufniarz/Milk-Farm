import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { Feeding, FeedingLine } from '../models/feeding.model';
import { FarmContextService } from './farm-context.service';
import { AuthService } from './auth.service';

export interface CreateFeedingInput {
  date: string;
  herdGroupId: string;
  recipeId: string;
  animalCount: number;
  feederId: string;
  lines: FeedingLine[];
  refusedKgAsFed: number;
  /** Optional; generated when absent. */
  idempotencyKey?: string;
}

/**
 * Feeding drafts and their confirmation.
 *
 * The client creates a draft and confirms it once. After confirmation the
 * document is immutable from the client; the `on_feeding_confirmed` trigger
 * posts the loaded kg to the inventory ledger and sets `inventoryPostedAt`.
 */
@Injectable({ providedIn: 'root' })
export class FeedingService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);
  private auth = inject(AuthService);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getFeedings(herdGroupId?: string): Observable<Feeding[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const ref = collection(this.firestore, 'farms', farmId, 'feedings');
        const q = herdGroupId
          ? query(
              ref,
              where('herdGroupId', '==', herdGroupId),
              orderBy('createdAt', 'desc'),
            )
          : query(ref, orderBy('createdAt', 'desc'));
        return collectionData(q, { idField: 'id' }) as Observable<Feeding[]>;
      }),
    );
  }

  async createDraft(input: CreateFeedingInput): Promise<string> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    const uid = this.auth.currentUser()?.uid ?? '';
    const ref = await addDoc(
      collection(this.firestore, 'farms', farmId, 'feedings'),
      {
        ...input,
        farmId,
        status: 'draft',
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
        createdBy: uid,
        createdAt: new Date(),
        inventoryPostedAt: null,
      },
    );
    return ref.id;
  }

  /** Confirm a draft; the trigger posts inventory from this transition. */
  async confirm(feedingId: string): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    await updateDoc(
      doc(this.firestore, 'farms', farmId, 'feedings', feedingId),
      { status: 'confirmed', confirmedAt: new Date() },
    );
  }

  async deleteDraft(feedingId: string): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    await deleteDoc(
      doc(this.firestore, 'farms', farmId, 'feedings', feedingId),
    );
  }
}
