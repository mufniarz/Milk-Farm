import { SaveScenarioInput } from '../models/scenario-row.model';

export interface BuilderScenarioPayloadInput {
  farmId: string;
  recipeName: string;
  animalGroupId: string;
  baseLines: { feedId: string; kgAsFed: number }[];
  now: Date;
  scenarioId: string;
  name?: string;
}

/** Build the builder-base save payload; pure so it can be tested. */
export function buildBuilderScenarioPayload(
  input: BuilderScenarioPayloadInput,
): SaveScenarioInput {
  const stamp = input.now.toISOString().slice(0, 16).replace('T', ' ');
  return {
    farmId: input.farmId,
    scenarioId: input.scenarioId,
    name: input.name ?? `${input.recipeName || 'Ration'} — ${stamp}`,
    baseSource: 'builder',
    baseLines: input.baseLines.filter((line) => line.kgAsFed > 0),
    animalGroupId: input.animalGroupId,
    changes: {},
  };
}
