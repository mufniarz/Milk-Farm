import cases from '../../../assets/scenario-base-hash-cases.json';
import {
  normalizeScenarioBaseLines,
  scenarioBaseHash,
} from './scenario-base-hash';

describe('scenario base hash', () => {
  it('matches the shared canonical form and SHA-256', async () => {
    for (const entry of cases) {
      expect(normalizeScenarioBaseLines(entry.lines)).toBe(entry.canonical);
      expect(await scenarioBaseHash(entry.lines)).toBe(entry.hash);
    }
  });
});
