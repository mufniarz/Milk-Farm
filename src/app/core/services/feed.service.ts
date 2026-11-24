import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { Feed } from '../models/feed.model';
import { FarmContextService } from './farm-context.service';

@Injectable({ providedIn: 'root' })
export class FeedService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);

  /** Loading state */
  readonly loading = signal(false);

  // Emits only once farmId is resolved; re-emits on re-login.
  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  /**
   * Get all feeds for the current farm as an observable stream.
   */
  getFeeds(): Observable<Feed[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const q = query(
          collection(this.firestore, 'feeds'),
          where('farmId', '==', farmId),
          orderBy('name', 'asc'),
        );
        return collectionData(q, { idField: 'id' }) as Observable<Feed[]>;
      }),
    );
  }

  getAvailableFeeds(): Observable<Feed[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const q = query(
          collection(this.firestore, 'feeds'),
          where('farmId', '==', farmId),
          where('isAvailable', '==', true),
          orderBy('name', 'asc'),
        );
        return collectionData(q, { idField: 'id' }) as Observable<Feed[]>;
      }),
    );
  }

  /**
   * Add a new feed to the current farm.
   */
  async addFeed(feed: Omit<Feed, 'id' | 'farmId'>): Promise<string> {
    this.loading.set(true);
    try {
      const farmId = this.farmContext.activeFarmId();
      const feedsRef = collection(this.firestore, 'feeds');
      const docRef = await addDoc(feedsRef, {
        ...feed,
        farmId,
        updatedAt: new Date(),
      });
      return docRef.id;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing feed.
   */
  async updateFeed(id: string, updates: Partial<Feed>): Promise<void> {
    this.loading.set(true);
    try {
      const feedRef = doc(this.firestore, 'feeds', id);
      await updateDoc(feedRef, {
        ...updates,
        updatedAt: new Date(),
      });
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete a feed.
   */
  async deleteFeed(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const feedRef = doc(this.firestore, 'feeds', id);
      await deleteDoc(feedRef);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Batch import feeds from CSV/Excel data.
   */
  async importFeeds(feeds: Omit<Feed, 'id' | 'farmId'>[]): Promise<number> {
    this.loading.set(true);
    try {
      const farmId = this.farmContext.activeFarmId();
      const batch = writeBatch(this.firestore);
      const feedsRef = collection(this.firestore, 'feeds');

      for (const feed of feeds) {
        const newDocRef = doc(feedsRef);
        batch.set(newDocRef, {
          ...feed,
          farmId,
          updatedAt: new Date(),
        });
      }

      await batch.commit();
      return feeds.length;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Toggle feed availability.
   */
  async toggleAvailability(id: string, isAvailable: boolean): Promise<void> {
    const feedRef = doc(this.firestore, 'feeds', id);
    await updateDoc(feedRef, { isAvailable, updatedAt: new Date() });
  }
}
