import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AnimalGroupId } from '../models/recipe.model';
import {
  EffectiveNutrientTarget,
  TargetOverrideDoc,
  TargetOverrideEntry,
} from '../models/nutrient.model';
import { TARGET_RANGES } from '../data/initial-data';

/** Input for the set_target_override callable. */
export interface SetTargetOverrideInput {
  farmId: string;
  animalGroupId: AnimalGroupId;
  nutrientCode: string;
  minValue: number | null;
  maxValue: number | null;
  reason: string;
}

/** Input for the clear_target_override callable. */
export interface ClearTargetOverrideInput {
  farmId: string;
  animalGroupId: AnimalGroupId;
  nutrientCode: string;
}

/**
 * Resolves the effective nutrient targets for a farm: the workbook reference
 * ranges with any farm-level override layered on top.
 *
 * Targets are no longer read straight from the generated TARGET_RANGES
 * constant. Every consumer (builder, optimizer, export) must go through this
 * service so the source badge and the audit trail stay truthful.
 */
@Injectable({ providedIn: 'root' })
export class TargetService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  /**
   * Reference targets merged with the farm's overrides. If the override
   * document is unreadable (for example during the membership migration),
   * the reference ranges are returned rather than failing the builder.
   */
  async getEffectiveTargets(
    farmId: string,
    animalGroupId: AnimalGroupId,
  ): Promise<EffectiveNutrientTarget[]> {
    const reference = TARGET_RANGES[animalGroupId] ?? [];
    const overrides = await this.loadOverrides(farmId, animalGroupId);

    return reference.map((target) => {
      const override = overrides[target.nutrientCode];
      if (!override) {
        return { ...target, source: 'reference' as const };
      }
      return {
        ...target,
        minValue: override.minValue,
        maxValue: override.maxValue,
        referenceMinValue: target.minValue,
        referenceMaxValue: target.maxValue,
        source: 'override' as const,
        reason: override.reason,
        updatedBy: override.updatedBy,
        updatedAt: toDate(override.updatedAt),
      };
    });
  }

  /** True when at least one nutrient uses a farm override. */
  hasOverrides(targets: EffectiveNutrientTarget[]): boolean {
    return targets.some((target) => target.source === 'override');
  }

  async setOverride(input: SetTargetOverrideInput): Promise<void> {
    const callable = httpsCallable<SetTargetOverrideInput, { ok: boolean }>(
      this.functions,
      'set_target_override',
    );
    await callable(input);
  }

  async clearOverride(input: ClearTargetOverrideInput): Promise<void> {
    const callable = httpsCallable<ClearTargetOverrideInput, { ok: boolean }>(
      this.functions,
      'clear_target_override',
    );
    await callable(input);
  }

  private async loadOverrides(
    farmId: string,
    animalGroupId: AnimalGroupId,
  ): Promise<Record<string, TargetOverrideEntry>> {
    if (!farmId) return {};
    try {
      const snapshot = await getDoc(
        doc(this.firestore, 'farms', farmId, 'targetOverrides', animalGroupId),
      );
      if (!snapshot.exists()) return {};
      const data = snapshot.data() as TargetOverrideDoc;
      return data.nutrients ?? {};
    } catch (error) {
      console.warn('Could not load target overrides; using reference ranges', error);
      return {};
    }
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const candidate = (value as { toDate?: () => Date }).toDate;
    if (typeof candidate === 'function') return candidate.call(value);
  }
  return null;
}
