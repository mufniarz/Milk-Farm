import { ScenarioChanges, ScenarioSnapshot } from './scenario.model';

export interface ScenarioRow {
  id: string;
  name: string;
  baseSource: 'saved-recipe' | 'workbook';
  baseRecipeId: string;
  changes: ScenarioChanges;
  snapshot: ScenarioSnapshot;
  savedAt: Date | null;
  diverged: boolean;
}

export interface SaveScenarioInput {
  farmId: string;
  scenarioId: string;
  name: string;
  baseRecipeId: string;
  changes: ScenarioChanges;
}

export interface SaveScenarioResult {
  scenarioId: string;
  snapshot: ScenarioSnapshot;
  serverTime: string;
}
