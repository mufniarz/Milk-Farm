import { Injectable, inject, signal } from '@angular/core';
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
import { Feed } from '../models/feed.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class FeedService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  /** Loading state */
  readonly loading = signal(false);

  /**
   * Get all feeds for the current farm as an observable stream.
   */
  getFeeds(): Observable<Feed[]> {
    const farmId = this.authService.farmId();
    const feedsRef = collection(this.firestore, 'feeds');
    const q = query(
      feedsRef,
      where('farmId', '==', farmId),
      orderBy('name', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Feed[]>;
  }

  /**
   * Get available feeds only (for recipe building).
   */
  getAvailableFeeds(): Observable<Feed[]> {
    const farmId = this.authService.farmId();
    const feedsRef = collection(this.firestore, 'feeds');
    const q = query(
      feedsRef,
      where('farmId', '==', farmId),
      where('isAvailable', '==', true),
      orderBy('name', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<Feed[]>;
  }

  /**
   * Add a new feed to the current farm.
   */
  async addFeed(feed: Omit<Feed, 'id' | 'farmId'>): Promise<string> {
    this.loading.set(true);
    try {
      const farmId = this.authService.farmId();
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
      const farmId = this.authService.farmId();
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
