import { loadScenarioFlow } from './scenario-load-flow';
import { ScenarioRow } from '../models/scenario-row.model';

function row(): ScenarioRow {
  return {
    id: 's1',
    name: 'S',
    baseSource: 'builder',
    baseRecipeId: null,
    changes: { inclusions: { corn: 5 } },
    baseLines: [{ feedId: 'corn', kgAsFed: 10 }],
    diverged: null,
    savedAt: null,
    snapshot: {
      status: 'computed', totalAsFed: 10, totalDM: 5, totalCost: 2,
      nutrients: {}, lines: [], targets: [], compliance: {}, warnings: [],
      computedAt: '2026-11-27T00:00:00Z',
    },
  };
}

describe('loadScenarioFlow', () => {
  it('applies baseLines and changes when clean', async () => {
    const applied: unknown[] = [];
    const changes: unknown[] = [];
    const result = await loadScenarioFlow({
      isDirty: () => false,
      confirmDiscard: () => true,
      getScenario: async () => row(),
      applyBaseLines: (lines) => applied.push(lines),
      loadChanges: (value) => changes.push(value),
    });
    expect(result).toBe('loaded');
    expect(applied).toEqual([[{ feedId: 'corn', kgAsFed: 10 }]]);
    expect(changes).toEqual([{ inclusions: { corn: 5 } }]);
  });

  it('aborts when dirty and discard is cancelled', async () => {
    let loaded = false;
    const result = await loadScenarioFlow({
      isDirty: () => true,
      confirmDiscard: () => false,
      getScenario: async () => row(),
      applyBaseLines: () => { loaded = true; },
      loadChanges: () => { loaded = true; },
    });
    expect(result).toBe('cancelled');
    expect(loaded).toBeFalse();
  });

  it('proceeds when dirty and discard is confirmed', async () => {
    let loaded = false;
    const result = await loadScenarioFlow({
      isDirty: () => true,
      confirmDiscard: () => true,
      getScenario: async () => row(),
      applyBaseLines: () => { loaded = true; },
      loadChanges: () => { loaded = true; },
    });
    expect(result).toBe('loaded');
    expect(loaded).toBeTrue();
  });
});
