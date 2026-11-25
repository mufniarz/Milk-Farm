import fixture from '../../../assets/scenario-parity-cases.json';
import { applyScenario } from './scenario';
import {
  ScenarioBase,
  ScenarioChanges,
  ScenarioCompliance,
} from '../models/scenario.model';

describe('scenario parity fixture', () => {
  const base = fixture.base as ScenarioBase;
  const now = new Date('2026-11-26T00:00:00Z');

  it('matches the shared Python/TS scenario snapshots', () => {
    for (const entry of fixture.cases) {
      const result = applyScenario(
        base,
        entry.changes as ScenarioChanges,
        now,
      );
      const expected = entry.expected;
      expect(result.status).toBe(expected.status);
      expect(result.totalAsFed).toBeCloseTo(expected.totalAsFed, 6);
      expect(result.totalDM).toBeCloseTo(expected.totalDM, 6);
      expect(result.totalCost).toBeCloseTo(expected.totalCost, 6);
      expect(result.compliance).toEqual(
        expected.compliance as Record<string, ScenarioCompliance>,
      );
      expect(result.warnings.map((warning) => warning.code)).toEqual(
        expected.warnings,
      );
    }
  });
});
