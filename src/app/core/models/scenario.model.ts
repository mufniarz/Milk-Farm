export type ScenarioBaseSource = 'saved-recipe' | 'workbook';

export interface ScenarioTargetOverride {
  min: number | null;
  max: number | null;
}

export interface ScenarioChanges {
  /** feedId -> new €/kg as fed. Unknown feed ids are ignored. */
  feedPrices?: Record<string, number>;
  /** feedId -> replacement kg as fed per head (not additive). Zero removes the line. */
  inclusions?: Record<string, number>;
  /** nutrientCode -> new min/max; both null removes the constraint. */
  targetOverrides?: Record<string, ScenarioTargetOverride>;
}

export interface Scenario {
  id?: string;
  name: string;
  baseSource: ScenarioBaseSource;
  baseRecipeId: string;
  changes: ScenarioChanges;
  resultSnapshot: ScenarioSnapshot;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScenarioBaseFeed {
  id: string;
  name: string;
  moisturePct: number;
  nutrients: Record<string, number>;
  pricePerKg: number;
  category: string;
  kgAsFed: number;
}

export interface ScenarioBaseTarget {
  nutrientCode: string;
  minValue: number | null;
  maxValue: number | null;
  isActive: boolean;
  source?: 'reference' | 'override';
  referenceMinValue?: number | null;
  referenceMaxValue?: number | null;
}

export interface ScenarioBase {
  baseSource: ScenarioBaseSource;
  recipeId: string;
  recipeName: string;
  feeds: ScenarioBaseFeed[];
  targets: ScenarioBaseTarget[];
}

export type ScenarioCompliance =
  | 'met'
  | 'below_min'
  | 'above_max'
  | 'at_boundary';

export interface ScenarioWarning {
  code: string;
  value: number;
  min: number | null;
  max: number | null;
  issue: 'below_min' | 'above_max' | 'at_boundary';
  boundary?: 'min' | 'max';
}

export interface ScenarioSnapshot {
  status: 'computed' | 'infeasible';
  totalAsFed: number;
  totalDM: number;
  totalCost: number;
  nutrients: Record<string, number>;
  /** Effective targets after the scenario overrides (needed by the export). */
  targets: ScenarioBaseTarget[];
  compliance: Record<string, ScenarioCompliance>;
  warnings: ScenarioWarning[];
  /** ISO timestamp of the recomputation that produced this snapshot. */
  computedAt: string;
}
