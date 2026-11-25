import cases from '../../../assets/boundary-cases.json';
import { classifyScenarioTarget } from './scenario';

describe('boundary classifier parity fixture', () => {
  it('matches the shared Python/TS cases', () => {
    for (const entry of cases) {
      const result = classifyScenarioTarget(
        {
          nutrientCode: entry.code,
          minValue: entry.min,
          maxValue: entry.max,
          isActive: true,
        },
        entry.value,
      );
      const issue = result.warning?.issue ?? 'met';
      const boundary = result.warning?.boundary ?? '';
      expect(issue).toBe(entry.issue);
      expect(boundary).toBe(entry.boundary);
    }
  });
});
