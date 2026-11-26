import { sensitivity, topThreeByCostContribution } from './sensitivity';
import { ScenarioSnapshot } from '../models/scenario.model';

function snapshot(
  lines: { feedId: string; kgAsFed: number; unitCostPerKgAsFed: number }[],
  status: 'computed' | 'infeasible' = 'computed',
): ScenarioSnapshot {
  return {
    status,
    totalAsFed: 0, totalDM: 0, totalCost: 0, nutrients: {}, targets: [],
    compliance: {}, warnings: [], computedAt: '2026-11-27T00:00:00Z',
    lines,
  };
}

describe('sensitivity', () => {
  it('ranks top three with feedId tie-break', () => {
    const result = topThreeByCostContribution(
      snapshot([
        { feedId: 'b', kgAsFed: 10, unitCostPerKgAsFed: 1 },
        { feedId: 'a', kgAsFed: 10, unitCostPerKgAsFed: 1 },
        { feedId: 'c', kgAsFed: 1, unitCostPerKgAsFed: 1 },
        { feedId: 'd', kgAsFed: 0.5, unitCostPerKgAsFed: 1 },
      ]),
    );
    expect(result.map((entry) => entry.feedId)).toEqual(['a', 'b', 'c']);
  });

  it('returns 12 one-at-a-time price deltas', () => {
    const result = sensitivity(
      snapshot([{ feedId: 'a', kgAsFed: 10, unitCostPerKgAsFed: 2 }]),
    );
    expect(result.deltas[0]).toBeCloseTo(1);
    expect(result.deltas[1]).toBeCloseTo(-1);
    expect(result.deltas[2]).toBeCloseTo(2);
    expect(result.deltas[3]).toBeCloseTo(-2);
    expect(result.deltas.slice(4)).toEqual(Array(8).fill(null));
  });

  it('returns the empty shape for infeasible input', () => {
    const result = sensitivity(snapshot([], 'infeasible'));
    expect(result.ranking).toEqual([]);
    expect(result.deltas).toEqual(Array(12).fill(null));
  });
});
