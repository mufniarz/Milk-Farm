import { ScenarioChanges, ScenarioSnapshot } from './scenario.model';

export interface ScenarioRow {
  id: string;
  name: string;
  baseSource: 'saved-recipe' | 'workbook' | 'builder';
  baseRecipeId: string | null;
  baseHash?: string | null;
  changes: ScenarioChanges;
  snapshot: ScenarioSnapshot;
  savedAt: Date | null;
  /** null until the server recompute compares snapshot vs current truth. */
  diverged: boolean | null;
}

export interface SaveScenarioInput {
  farmId: string;
  scenarioId: string;
  name: string;
  baseRecipeId: string | null;
  baseHash?: string | null;
  changes: ScenarioChanges;
}

export interface SaveScenarioResult {
  scenarioId: string;
  snapshot: ScenarioSnapshot;
  serverTime: string;
}
