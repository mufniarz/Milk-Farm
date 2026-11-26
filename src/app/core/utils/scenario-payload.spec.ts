import { buildBuilderScenarioPayload } from './scenario-payload';

describe('buildBuilderScenarioPayload', () => {
  it('defaults the name and captures positive lines', () => {
    const payload = buildBuilderScenarioPayload({
      farmId: 'f1',
      recipeName: 'Mix',
      animalGroupId: 'lactating',
      baseLines: [
        { feedId: 'a', kgAsFed: 10 },
        { feedId: 'b', kgAsFed: 0 },
      ],
      now: new Date('2026-11-27T10:30:00Z'),
      scenarioId: '00000000-0000-4000-8000-000000000001',
    });
    expect(payload.baseSource).toBe('builder');
    expect(payload.name).toBe('Mix — 2026-11-27 10:30');
    expect(payload.baseLines).toEqual([{ feedId: 'a', kgAsFed: 10 }]);
    expect(payload.changes).toEqual({});
    expect(payload.animalGroupId).toBe('lactating');
  });
});
