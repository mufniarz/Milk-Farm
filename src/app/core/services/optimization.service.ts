import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Feed } from '../models/feed.model';
import { NutrientTarget } from '../models/nutrient.model';

/**
 * Input payload for the optimize_ration Cloud Function.
 */
export interface OptimizationRequest {
  feeds: OptimizationFeed[];
  targets: OptimizationTarget[];
  constraints?: OptimizationConstraints;
}

export interface OptimizationFeed {
  id: string;
  name: string;
  dmFactor: number;
  nutrients: Record<string, number>;
  pricePerKg: number;
  category: string;
}

export interface OptimizationTarget {
  code: string;
  min: number | null;
  max: number | null;
}

export interface OptimizationConstraints {
  totalDM?: number;
  minForageRatio?: number;
  maxForageRatio?: number;
}

/**
 * Result from the optimize_ration Cloud Function.
 */
export interface OptimizationResult {
  status: 'optimal' | 'infeasible' | 'error';
  feeds?: OptimizationResultFeed[];
  totalCost?: number;
  totalDM?: number;
  totalAsFed?: number;
  nutrientAnalysis?: Record<string, number>;
  message: string;
}

export interface OptimizationResultFeed {
  feedId: string;
  feedName: string;
  kgAsFed: number;
  kgDM: number;
  cost: number;
}

@Injectable({ providedIn: 'root' })
export class OptimizationService {
  private functions = inject(Functions);

  /**
   * Call the Cloud Function to solve the LP optimization.
   *
   * @param feeds - Available feeds for the ration
   * @param targets - Nutrient target ranges
   * @param constraints - Optional global constraints (total DM, forage ratio)
   */
  async optimize(
    feeds: Feed[],
    targets: NutrientTarget[],
    constraints?: OptimizationConstraints
  ): Promise<OptimizationResult> {
    const callable = httpsCallable<OptimizationRequest, OptimizationResult>(
      this.functions,
      'optimize_ration'
    );

    // Transform feeds into the format expected by the Cloud Function
    const optimizationFeeds: OptimizationFeed[] = feeds.map((f) => ({
      id: f.id!,
      name: f.name,
      dmFactor: 1 - f.moisturePct / 100,
      nutrients: f.nutrients,
      pricePerKg: f.pricePerKg,
      category: f.category,
    }));

    // Transform targets
    const optimizationTargets: OptimizationTarget[] = targets
      .filter((t) => t.isActive)
      .map((t) => ({
        code: t.nutrientCode,
        min: t.minValue,
        max: t.maxValue,
      }));

    const result = await callable({
      feeds: optimizationFeeds,
      targets: optimizationTargets,
      constraints: constraints || {},
    });

    return result.data;
  }
}
