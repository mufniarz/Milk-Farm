import { ScenarioRow } from '../models/scenario-row.model';
import { ScenarioChanges } from '../models/scenario.model';

export interface ScenarioLoadDeps {
  isDirty: () => boolean;
  confirmDiscard: () => boolean;
  getScenario: () => Promise<ScenarioRow | null>;
  applyBaseLines: (lines: { feedId: string; kgAsFed: number }[]) => void;
  loadChanges: (changes: ScenarioChanges) => void;
}

/** Apply a scenario load, honoring the dirty-state confirmation. */
export async function loadScenarioFlow(
  deps: ScenarioLoadDeps,
): Promise<'loaded' | 'cancelled' | 'missing'> {
  if (deps.isDirty() && !deps.confirmDiscard()) {
    return 'cancelled';
  }
  const row = await deps.getScenario();
  if (!row) return 'missing';
  deps.applyBaseLines(row.baseLines ?? []);
  deps.loadChanges(row.changes);
  return 'loaded';
}
