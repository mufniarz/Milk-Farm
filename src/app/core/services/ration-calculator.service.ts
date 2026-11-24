import { Injectable } from '@angular/core';
import { Feed } from '../models/feed.model';
import {
  RationResult,
  calculateRation,
  evaluateNutrientStatus,
} from '../utils/ration-calculator';

export type { RationResult } from '../utils/ration-calculator';

/**
 * Angular wrapper around the pure ration calculation. The calculation itself
 * lives in `core/utils/ration-calculator.ts` so it can be exercised without
 * the Angular test runner.
 */
@Injectable({ providedIn: 'root' })
export class RationCalculatorService {
  /**
   * Calculate the ration result from given feeds and their as-fed quantities.
   *
   * @param feeds - Array of feed objects with nutrient compositions
   * @param quantities - Array of kg as-fed quantities (same order as feeds)
   * @returns Complete ration analysis
   */
  calculateRation(feeds: Feed[], quantities: number[]): RationResult {
    return calculateRation(feeds, quantities);
  }

  /**
   * Evaluate how a nutrient value compares to its target range.
   * Returns a status for traffic-light display.
   */
  evaluateNutrientStatus(
    value: number,
    min: number | null,
    max: number | null,
  ): 'good' | 'warning' | 'danger' {
    return evaluateNutrientStatus(value, min, max);
  }
}
