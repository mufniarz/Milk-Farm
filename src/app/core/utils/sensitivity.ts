import { ScenarioSnapshot } from '../models/scenario.model';

export interface SensitivityRanking {
  feedId: string;
  contribution: number;
}

export interface SensitivityResult {
  ranking: SensitivityRanking[];
  deltas: (number | null)[];
}

const SHOCKS = [0.05, -0.05, 0.1, -0.1];

/** Top 3 feeds by unitCost × kgAsFed, descending; ties by feedId. */
export function topThreeByCostContribution(
  snapshot: ScenarioSnapshot,
): SensitivityRanking[] {
  return snapshot.lines
    .map((line) => ({
      feedId: line.feedId,
      contribution: line.unitCostPerKgAsFed * line.kgAsFed,
    }))
    .sort(
      (a, b) =>
        b.contribution - a.contribution ||
        a.feedId.localeCompare(b.feedId),
    )
    .slice(0, 3);
}

/** 12 deltas: top 3 × ±5/±10% price, one feed shocked at a time. */
export function sensitivity(snapshot: ScenarioSnapshot): SensitivityResult {
  if (snapshot.status === 'infeasible' || snapshot.lines.length === 0) {
    return { ranking: [], deltas: Array(12).fill(null) };
  }
  const ranking = topThreeByCostContribution(snapshot);
  const deltas: (number | null)[] = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const item = ranking[slot];
    if (!item) {
      deltas.push(null, null, null, null);
      continue;
    }
    const line = snapshot.lines.find((entry) => entry.feedId === item.feedId);
    if (!line) {
      deltas.push(null, null, null, null);
      continue;
    }
    for (const shock of SHOCKS) {
      deltas.push(
        line.kgAsFed * line.unitCostPerKgAsFed * shock,
      );
    }
  }
  return { ranking, deltas };
}
