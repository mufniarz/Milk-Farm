import { ScenarioChanges, ScenarioTargetOverride } from '../models/scenario.model';

export interface ScenarioChangeDraft {
  feedPrices: Record<string, number>;
  inclusions: Record<string, number>;
  targetOverrides: Record<string, ScenarioTargetOverride>;
}

export function emptyScenarioDraft(): ScenarioChangeDraft {
  return { feedPrices: {}, inclusions: {}, targetOverrides: {} };
}

export function setFeedPrice(
  draft: ScenarioChangeDraft,
  feedId: string,
  price: number,
): ScenarioChangeDraft {
  return {
    ...draft,
    feedPrices: { ...draft.feedPrices, [feedId]: price },
  };
}

export function setInclusion(
  draft: ScenarioChangeDraft,
  feedId: string,
  kgAsFed: number,
): ScenarioChangeDraft {
  return {
    ...draft,
    inclusions: { ...draft.inclusions, [feedId]: kgAsFed },
  };
}

export function setTargetOverride(
  draft: ScenarioChangeDraft,
  nutrientCode: string,
  override: ScenarioTargetOverride,
): ScenarioChangeDraft {
  return {
    ...draft,
    targetOverrides: { ...draft.targetOverrides, [nutrientCode]: override },
  };
}

/** Drop empty maps so the callable sees `{}` for a saved base. */
export function draftToChanges(draft: ScenarioChangeDraft): ScenarioChanges {
  const changes: ScenarioChanges = {};
  if (Object.keys(draft.feedPrices).length) changes.feedPrices = { ...draft.feedPrices };
  if (Object.keys(draft.inclusions).length) changes.inclusions = { ...draft.inclusions };
  if (Object.keys(draft.targetOverrides).length) changes.targetOverrides = { ...draft.targetOverrides };
  return changes;
}
