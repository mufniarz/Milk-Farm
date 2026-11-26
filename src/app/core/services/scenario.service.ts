import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  SaveScenarioInput,
  SaveScenarioResult,
  ScenarioRow,
} from '../models/scenario-row.model';
import { ScenarioSnapshot } from '../models/scenario.model';

/** Firestore-backed scenario reads plus callable-only writes. */
@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  async list(farmId: string): Promise<ScenarioRow[]> {
    const scenarios = collection(this.firestore, 'farms', farmId, 'scenarios');
    const rows = await getDocs(
      query(
        scenarios,
        where('deletedAt', '==', null),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
    );
    return rows.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        name: data['name'] ?? '',
        baseSource: data['baseSource'] ?? 'saved-recipe',
        baseRecipeId: data['baseRecipeId'] ?? '',
        changes: data['changes'] ?? {},
        snapshot: data['resultSnapshot'] as ScenarioSnapshot,
        savedAt: toDate(data['savedAt']),
        diverged: false,
      };
    });
  }

  async get(farmId: string, scenarioId: string): Promise<ScenarioRow | null> {
    const ref = doc(
      this.firestore,
      'farms',
      farmId,
      'scenarios',
      scenarioId,
    );
    const entry = await getDoc(ref);
    if (!entry.exists()) return null;
    const data = entry.data();
    return {
      id: entry.id,
      name: data['name'] ?? '',
      baseSource: data['baseSource'] ?? 'saved-recipe',
      baseRecipeId: data['baseRecipeId'] ?? '',
      changes: data['changes'] ?? {},
      snapshot: data['resultSnapshot'] as ScenarioSnapshot,
      savedAt: toDate(data['savedAt']),
      diverged: false,
    };
  }

  async save(input: SaveScenarioInput): Promise<SaveScenarioResult> {
    const callable = httpsCallable<SaveScenarioInput, SaveScenarioResult>(
      this.functions,
      'save_scenario',
    );
    const result = await callable(input);
    return result.data;
  }

  async remove(farmId: string, scenarioId: string): Promise<void> {
    const callable = httpsCallable<
      { farmId: string; scenarioId: string },
      { ok: boolean; alreadyDeleted?: boolean }
    >(this.functions, 'delete_scenario');
    await callable({ farmId, scenarioId });
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    return new Timestamp(
      (value as { seconds: number }).seconds,
      (value as { nanoseconds?: number }).nanoseconds ?? 0,
    ).toDate();
  }
  return null;
}
