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
