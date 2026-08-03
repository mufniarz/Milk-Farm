/**
 * Represents a single feed ingredient.
 * Stored in Firestore: /feeds/{feedId}
 */
export interface Feed {
  /** Firestore document ID (auto-generated) */
  id?: string;
  /** Feed name, e.g. 'Silomais', 'Farina di soia' */
  name: string;
  /** Category for grouping and forage-ratio constraints */
  category: FeedCategory;
  /** Price per kg as-fed (€/kg) */
  pricePerKg: number;
  /** Moisture percentage (0–100). DM factor = 1 - moisturePct/100 */
  moisturePct: number;
  /** Whether this feed is currently available for ration formulation */
  isAvailable: boolean;
  /** Farm ownership for multi-tenancy isolation */
  farmId: string;
  /**
   * Nutrient composition on DM basis.
   * Keys are nutrient codes (e.g. 'proteina', 'ee', 'amido', 'aNDF').
   * Values are percentages or concentrations in the unit defined by the nutrient.
   */
  nutrients: Record<string, number>;
  /** Optional notes about the feed source, batch, etc. */
  notes?: string;
  /** Timestamp of last update */
  updatedAt?: Date;
}

export type FeedCategory = 'forage' | 'concentrate';

/**
 * A feed included in a recipe, with its assigned quantity.
 * Stored in Firestore: /recipes/{recipeId}/feeds/{feedEntryId}
 */
export interface RecipeFeed {
  /** Firestore document ID */
  id?: string;
  /** Reference to the feed document ID */
  feedId: string;
  /** Denormalized feed name for display without extra reads */
  feedName: string;
  /** Denormalized feed category */
  feedCategory: FeedCategory;
  /** Quantity in kg as-fed */
  kgAsFed: number;
  /** Computed: kgAsFed * (1 - moisturePct/100) */
  kgDM: number;
  /** Computed: kgAsFed * pricePerKg */
  cost: number;
}
