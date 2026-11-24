import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDoc,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { HerdGroup } from '../models/group.model';
import { AnimalGroupId } from '../models/recipe.model';
import { FarmContextService } from './farm-context.service';

/**
 * Herd groups at `/farms/{farmId}/groups`.
 *
 * A group carries the head count and the active recipe; the group's
 * `animalGroupId` is the link to the nutritional target category.
 */
@Injectable({ providedIn: 'root' })
export class GroupService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);

  readonly loading = signal(false);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getGroups(): Observable<HerdGroup[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const groups = collection(this.firestore, 'farms', farmId, 'groups');
        return collectionData(query(groups), {
          idField: 'id',
        }) as Observable<HerdGroup[]>;
      }),
    );
  }

  async getGroup(groupId: string): Promise<HerdGroup | null> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) return null;
    const snapshot = await getDoc(
      doc(this.firestore, 'farms', farmId, 'groups', groupId),
    );
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as HerdGroup) };
  }

  async createGroup(input: {
    name: string;
    animalGroupId: AnimalGroupId;
    headCount: number;
    activeRecipeId?: string | null;
    externalId?: string | null;
  }): Promise<string> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    this.loading.set(true);
    try {
      const ref = await addDoc(
        collection(this.firestore, 'farms', farmId, 'groups'),
        {
          farmId,
          name: input.name.trim(),
          animalGroupId: input.animalGroupId,
          headCount: Math.max(0, Math.round(input.headCount)),
          activeRecipeId: input.activeRecipeId ?? null,
          externalId: input.externalId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );
      return ref.id;
    } finally {
      this.loading.set(false);
    }
  }

  async updateGroup(
    groupId: string,
    updates: Partial<
      Pick<HerdGroup, 'name' | 'animalGroupId' | 'headCount' | 'activeRecipeId' | 'externalId'>
    >,
  ): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    this.loading.set(true);
    try {
      await updateDoc(
        doc(this.firestore, 'farms', farmId, 'groups', groupId),
        { ...updates, updatedAt: new Date() },
      );
    } finally {
      this.loading.set(false);
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) throw new Error('No active farm');
    this.loading.set(true);
    try {
      await deleteDoc(doc(this.firestore, 'farms', farmId, 'groups', groupId));
    } finally {
      this.loading.set(false);
    }
  }
}
