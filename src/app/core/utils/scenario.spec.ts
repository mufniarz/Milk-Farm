import { applyScenario } from './scenario';
import { ScenarioBase } from '../models/scenario.model';

const base: ScenarioBase = {
  baseSource: 'saved-recipe',
  recipeId: 'r1',
  recipeName: 'Base',
  feeds: [
    {
      id: 'silage',
      name: 'Silage',
      moisturePct: 50,
      nutrients: { proteina: 10, aNDF: 40, ADF: 25 },
      pricePerKg: 0.1,
      category: 'forage',
      kgAsFed: 10,
    },
    {
      id: 'soy',
      name: 'Soy',
      moisturePct: 10,
      nutrients: { proteina: 40, aNDF: 10, ADF: 5 },
      pricePerKg: 0.5,
      category: 'concentrate',
      kgAsFed: 2,
    },
  ],
  targets: [
    {
      nutrientCode: 'proteina',
      minValue: 14,
      maxValue: 18,
      isActive: true,
      source: 'reference',
    },
    {
      nutrientCode: 'aNDF',
      minValue: 28,
      maxValue: 35,
      isActive: true,
      source: 'reference',
    },
    {
      nutrientCode: 'ADF',
      minValue: 18,
      maxValue: 22,
      isActive: true,
      source: 'reference',
    },
  ],
};

const now = new Date('2026-11-26T00:00:00Z');

describe('applyScenario', () => {
  it('price changes affect cost only', () => {
    const result = applyScenario(
      base,
      { feedPrices: { silage: 0.2 } },
      now,
    );
    const before = applyScenario(base, {}, now);
    expect(result.totalCost).toBeGreaterThan(before.totalCost);
    expect(result.nutrients).toEqual(before.nutrients);
    expect(result.totalDM).toBe(before.totalDM);
  });

  it('inclusion changes affect nutrients and cost', () => {
    const result = applyScenario(
      base,
      { inclusions: { soy: 4 } },
      now,
    );
    const before = applyScenario(base, {}, now);
    expect(result.totalCost).not.toBeCloseTo(before.totalCost, 6);
    expect(result.nutrients['proteina']).not.toBeCloseTo(
      before.nutrients['proteina'],
      6,
    );
  });

  it('target overrides change compliance without changing values', () => {
    const before = applyScenario(base, {}, now);
    const result = applyScenario(
      base,
      { targetOverrides: { aNDF: { min: 40, max: 45 } } },
      now,
    );
    expect(result.totalDM).toBe(before.totalDM);
    expect(result.nutrients['aNDF']).toBe(before.nutrients['aNDF']);
    expect(result.compliance['aNDF']).toBe('below_min');
    expect(
      result.warnings.some(
        (warning) =>
          warning.code === 'aNDF' && warning.issue === 'below_min',
      ),
    ).toBeTrue();
  });

  it('empty changes reproduce the base', () => {
    const baseSnapshot = applyScenario(base, {}, now);
    const empty = applyScenario(base, {}, now);
    expect(empty).toEqual(baseSnapshot);
    expect(empty.status).toBe('computed');
    expect(empty.compliance['proteina']).toBe('met');
  });

  it('composes price, inclusion and target changes', () => {
    const combined = applyScenario(
      base,
      {
        feedPrices: { silage: 0.2 },
        inclusions: { soy: 3 },
        targetOverrides: { aNDF: { min: 40, max: 45 } },
      },
      now,
    );
    const baseSnapshot = applyScenario(base, {}, now);
    expect(combined.totalCost).toBeGreaterThan(baseSnapshot.totalCost);
    expect(combined.nutrients['proteina']).toBeGreaterThan(
      baseSnapshot.nutrients['proteina'],
    );
    expect(combined.compliance['aNDF']).toBe('below_min');
    expect(
      combined.warnings.some((warning) => warning.code === 'aNDF'),
    ).toBeTrue();
  });

  it('ignores unknown feed ids and treats inclusions as replacement', () => {
    const unchanged = applyScenario(
      base,
      { feedPrices: { unknown: 99 }, inclusions: { unknown: 5 } },
      now,
    );
    expect(unchanged).toEqual(applyScenario(base, {}, now));

    const removed = applyScenario(base, { inclusions: { soy: 0 } }, now);
    expect(removed.totalAsFed).toBe(10);
  });

  it('a target with both bounds null is unconstrained', () => {
    const result = applyScenario(
      base,
      { targetOverrides: { aNDF: { min: null, max: null } } },
      now,
    );
    expect(result.compliance['aNDF']).toBe('met');
    expect(
      result.warnings.some((warning) => warning.code === 'aNDF'),
    ).toBeFalse();
  });

  it('does not mutate the base and is deterministic for a fixed clock', () => {
    const snapshot = JSON.stringify(base);
    const first = applyScenario(base, {}, now);
    const second = applyScenario(base, {}, now);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(first).toEqual(second);
    expect(first.computedAt).toBe(now.toISOString());
  });
});
