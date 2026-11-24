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
  getDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { filter, switchMap, take } from 'rxjs/operators';
import { Recipe, AnimalGroupId } from '../models/recipe.model';
import { RecipeFeed } from '../models/feed.model';
import { FarmContextService } from './farm-context.service';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private firestore = inject(Firestore);
  private farmContext = inject(FarmContextService);

  readonly loading = signal(false);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  /**
   * Get all recipes for the current farm.
   */
  getRecipes(): Observable<Recipe[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const q = query(
          collection(this.firestore, 'recipes'),
          where('farmId', '==', farmId),
          orderBy('createdAt', 'desc'),
        );
        return collectionData(q, { idField: 'id' }) as Observable<Recipe[]>;
      }),
    );
  }

  getRecipesByGroup(groupId: AnimalGroupId): Observable<Recipe[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const q = query(
          collection(this.firestore, 'recipes'),
          where('farmId', '==', farmId),
          where('animalGroupId', '==', groupId),
          orderBy('createdAt', 'desc'),
        );
        return collectionData(q, { idField: 'id' }) as Observable<Recipe[]>;
      }),
    );
  }

  /**
   * Load a single recipe with its feed entries.
   */
  async getRecipeWithFeeds(recipeId: string): Promise<Recipe | null> {
    const recipeRef = doc(this.firestore, 'recipes', recipeId);
    const snapshot = await getDoc(recipeRef);

    if (!snapshot.exists()) return null;

    const recipe = { id: snapshot.id, ...snapshot.data() } as Recipe;

    // Load feed entries subcollection
    const feedsRef = collection(this.firestore, 'recipes', recipeId, 'feeds');
    const feedsQuery = query(feedsRef, orderBy('feedName', 'asc'));

    return new Promise((resolve) => {
      collectionData(feedsQuery, { idField: 'id' })
        .pipe(take(1))
        .subscribe((feeds) => {
          recipe.feeds = feeds as RecipeFeed[];
          resolve(recipe);
        });
    });
  }

  /**
   * Save a new recipe with its feed entries.
   */
  async saveRecipe(
    recipe: Omit<Recipe, 'id' | 'farmId' | 'createdAt'>,
    feeds: Omit<RecipeFeed, 'id'>[],
  ): Promise<string> {
    this.loading.set(true);
    try {
      const farmId = this.farmContext.activeFarmId();

      // Create recipe document
      const recipesRef = collection(this.firestore, 'recipes');
      const docRef = await addDoc(recipesRef, {
        ...recipe,
        farmId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Batch write feed entries as subcollection
      const batch = writeBatch(this.firestore);
      const feedsRef = collection(
        this.firestore,
        'recipes',
        docRef.id,
        'feeds',
      );

      for (const feed of feeds) {
        const feedDocRef = doc(feedsRef);
        batch.set(feedDocRef, feed);
      }

      await batch.commit();
      return docRef.id;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing recipe and replace its feed entries.
   *
   * Editing a saved recipe must not create a second document: the recipe is
   * updated in place and the subcollection is rewritten in one batch.
   */
  async updateRecipe(
    recipeId: string,
    recipe: Omit<Recipe, 'id' | 'farmId' | 'createdAt'>,
    feeds: Omit<RecipeFeed, 'id'>[],
  ): Promise<string> {
    this.loading.set(true);
    try {
      const recipeRef = doc(this.firestore, 'recipes', recipeId);
      await updateDoc(recipeRef, { ...recipe, updatedAt: new Date() });

      const feedsRef = collection(this.firestore, 'recipes', recipeId, 'feeds');
      const existing = await new Promise<RecipeFeed[]>((resolve) => {
        collectionData(query(feedsRef), { idField: 'id' })
          .pipe(take(1))
          .subscribe((entries) => resolve(entries as RecipeFeed[]));
      });

      const batch = writeBatch(this.firestore);
      for (const entry of existing) {
        batch.delete(doc(feedsRef, entry.id!));
      }
      for (const feed of feeds) {
        batch.set(doc(feedsRef), feed);
      }

      await batch.commit();
      return recipeId;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete a recipe and its feed entries.
   */
  async deleteRecipe(recipeId: string): Promise<void> {
    this.loading.set(true);
    try {
      // Delete feed entries subcollection first
      const feedsRef = collection(this.firestore, 'recipes', recipeId, 'feeds');
      const feedsQuery = query(feedsRef);

      const batch = writeBatch(this.firestore);

      // Note: In production, you'd use a Cloud Function for recursive deletes.
      // For now, we load and delete individually.
      const snapshot = await new Promise<RecipeFeed[]>((resolve) => {
        collectionData(feedsQuery, { idField: 'id' })
          .pipe(take(1))
          .subscribe((feeds) => {
            resolve(feeds as RecipeFeed[]);
          });
      });

      for (const feed of snapshot) {
        const feedDocRef = doc(
          this.firestore,
          'recipes',
          recipeId,
          'feeds',
          feed.id!,
        );
        batch.delete(feedDocRef);
      }

      // Delete recipe document
      const recipeRef = doc(this.firestore, 'recipes', recipeId);
      batch.delete(recipeRef);

      await batch.commit();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Duplicate a recipe.
   */
  async duplicateRecipe(recipeId: string, newName: string): Promise<string> {
    const original = await this.getRecipeWithFeeds(recipeId);
    if (!original) throw new Error('Recipe not found');

    const feeds = (original.feeds || []).map(({ id, ...feed }) => feed);

    const { id, farmId, createdAt, feeds: _, ...recipeData } = original;
    return this.saveRecipe({ ...recipeData, name: newName }, feeds);
  }
}
