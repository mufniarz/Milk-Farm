/**
 * Represents a single nutrient definition (master list, shared across all farms).
 * Stored in Firestore: /nutrients/{code}
 */
export interface Nutrient {
  /** Unique code, e.g. 'proteina', 'ee', 'amido', 'aNDF' */
  code: string;
  /** Italian display name */
  nameIt: string;
  /** English display name */
  nameEn: string;
  /** Unit of measurement, e.g. '% DM', 'g/kg DM', 'Mcal/kg DM' */
  unit: string;
  /** Whether this nutrient is derived from other nutrient values */
  isDerived: boolean;
  /** Optional formula expression if isDerived is true, e.g. 'NFC = 100 - proteina - ee - ceneri - aNDF' */
  derivedFormula?: string;
}

/**
 * A nutrient target range for a specific animal group.
 * Stored in Firestore: /animalGroups/{groupId}/targets/{nutrientCode}
 */
export interface NutrientTarget {
  /** Reference to the nutrient code */
  nutrientCode: string;
  /** Minimum acceptable value (on DM basis) */
  minValue: number | null;
  /** Maximum acceptable value (on DM basis) */
  maxValue: number | null;
  /** Whether this target is actively used in optimization */
  isActive: boolean;
}

/** Where an effective target came from. */
export type TargetSource = 'reference' | 'override';

/**
 * A target after the farm override layer has been applied. `source` lets the
 * builder, optimizer and export show whether the workbook reference or the
 * farm's own range is being used.
 */
export interface EffectiveNutrientTarget extends NutrientTarget {
  source: TargetSource;
  /** The workbook reference, kept when an override is active. */
  referenceMinValue?: number | null;
  referenceMaxValue?: number | null;
  /** Required when source is 'override'. */
  reason?: string;
  updatedBy?: string;
  updatedAt?: Date | null;
}

/** One nutrient override stored inside a farm's target-override document. */
export interface TargetOverrideEntry {
  minValue: number | null;
  maxValue: number | null;
  reason: string;
  updatedBy: string;
  updatedAt?: unknown;
}

/**
 * Stored at `/farms/{farmId}/targetOverrides/{animalGroupId}`. The document
 * id is the nutritional category, not a herd-group id.
 */
export interface TargetOverrideDoc {
  groupId?: string;
  nutrients: Record<string, TargetOverrideEntry>;
  updatedAt?: unknown;
  version?: number;
}
