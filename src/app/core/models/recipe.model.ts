import { RecipeFeed } from './feed.model';

/**
 * Represents a saved ration recipe.
 * Stored in Firestore: /recipes/{recipeId}
 */
export interface Recipe {
  /** Firestore document ID */
  id?: string;
  /** User-defined recipe name */
  name: string;
  /** Animal group this recipe targets */
  animalGroupId: AnimalGroupId;
  /** Total kg as-fed across all feeds */
  totalAsFed: number;
  /** Total kg DM across all feeds */
  totalDM: number;
  /** Total cost (€) */
  cost: number;
  /** Computed nutrient analysis on DM basis */
  nutrientAnalysis: Record<string, number>;
  /** Farm ownership for multi-tenancy */
  farmId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt?: Date;
  /** Optional notes */
  notes?: string;
  /**
   * Feed entries included in this recipe.
   * In Firestore these live as a subcollection, but for client-side
   * usage they are loaded together with the recipe.
   */
  feeds?: RecipeFeed[];
}

export type AnimalGroupId = 'lactating' | 'dry' | 'heifer';

/**
 * Represents an animal group definition.
 * Stored in Firestore: /animalGroups/{groupId}
 */
export interface AnimalGroup {
  /** Document ID: 'lactating', 'dry', or 'heifer' */
  id: AnimalGroupId;
  /** Italian display name */
  nameIt: string;
  /** English display name */
  nameEn: string;
}
