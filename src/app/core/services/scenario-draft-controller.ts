import { Injectable, signal } from '@angular/core';
import {
  ScenarioChangeDraft,
  draftToChanges,
  emptyScenarioDraft,
  setFeedPrice,
  setInclusion,
  setTargetOverride,
} from '../utils/scenario-change-draft';
import { ScenarioChanges, ScenarioTargetOverride } from '../models/scenario.model';

/** Holds the scenario editor draft and the dirty flag; no Angular view deps. */
@Injectable({ providedIn: 'root' })
export class ScenarioDraftController {
  readonly draft = signal<ScenarioChangeDraft>(emptyScenarioDraft());
  readonly dirty = signal(false);

  setFeedPrice(feedId: string, price: number): void {
    this.draft.update((draft) => setFeedPrice(draft, feedId, price));
    this.dirty.set(true);
  }

  setInclusion(feedId: string, kgAsFed: number): void {
    this.draft.update((draft) => setInclusion(draft, feedId, kgAsFed));
    this.dirty.set(true);
  }

  setTargetOverride(
    nutrientCode: string,
    override: ScenarioTargetOverride,
  ): void {
    this.draft.update((draft) =>
      setTargetOverride(draft, nutrientCode, override),
    );
    this.dirty.set(true);
  }

  clear(): void {
    this.draft.set(emptyScenarioDraft());
    this.dirty.set(true);
  }

  load(changes: ScenarioChanges): void {
    this.draft.set({
      feedPrices: { ...(changes.feedPrices ?? {}) },
      inclusions: { ...(changes.inclusions ?? {}) },
      targetOverrides: { ...(changes.targetOverrides ?? {}) },
    });
    this.dirty.set(false);
  }

  saved(): void {
    this.dirty.set(false);
  }

  toChanges(): ScenarioChanges {
    return draftToChanges(this.draft());
  }
}
