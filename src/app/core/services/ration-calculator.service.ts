import { Injectable } from '@angular/core';
import { Feed } from '../models/feed.model';

/**
 * Result of a ration calculation — either manual or from the optimizer.
 */
export interface RationResult {
  /** Total dry matter in kg */
  totalDM: number;
  /** Total as-fed in kg */
  totalAsFed: number;
  /** Nutrient analysis on DM basis (code → value) */
  nutrients: Record<string, number>;
  /** Total cost in € */
  totalCost: number;
  /** Overall moisture percentage of the TMR */
  moisturePct: number;
  /** DM from forages / total DM */
  forageRatio: number;
}

@Injectable({ providedIn: 'root' })
export class RationCalculatorService {
  /**
   * Calculate the ration result from given feeds and their as-fed quantities.
   * This is the client-side calculation engine for manual editing.
   *
   * @param feeds - Array of feed objects with nutrient compositions
   * @param quantities - Array of kg as-fed quantities (same order as feeds)
   * @returns Complete ration analysis
   */
  calculateRation(feeds: Feed[], quantities: number[]): RationResult {
    if (feeds.length !== quantities.length) {
      throw new Error('Feeds and quantities arrays must have the same length');
    }

    // Calculate DM for each feed
    const dmQuantities = feeds.map(
      (f, i) => quantities[i] * (1 - f.moisturePct / 100),
    );

    const totalDM = dmQuantities.reduce((sum, dm) => sum + dm, 0);
    const totalAsFed = quantities.reduce((sum, q) => sum + q, 0);

    if (totalDM === 0) {
      return {
        totalDM: 0,
        totalAsFed: 0,
        nutrients: {},
        totalCost: 0,
        moisturePct: 0,
        forageRatio: 0,
      };
    }

    // Calculate weighted nutrient averages on DM basis
    const allCodes = new Set<string>();
    feeds.forEach((f) => {
      Object.keys(f.nutrients || {}).forEach((code) => allCodes.add(code));
    });

    const nutrients: Record<string, number> = {};
    for (const code of allCodes) {
      const weightedSum = feeds.reduce((sum, f, i) => {
        return sum + (f.nutrients?.[code] || 0) * dmQuantities[i];
      }, 0);
      nutrients[code] = weightedSum / totalDM;
    }

    // Calculate total cost
    const totalCost = feeds.reduce(
      (sum, f, i) => sum + f.pricePerKg * quantities[i],
      0,
    );

    // Calculate overall moisture
    const moisturePct = ((totalAsFed - totalDM) / totalAsFed) * 100;

    // Calculate forage ratio (DM from forages / total DM)
    const forageDM = feeds.reduce((sum, f, i) => {
      return f.category === 'forage' ? sum + dmQuantities[i] : sum;
    }, 0);
    const forageRatio = totalDM > 0 ? forageDM / totalDM : 0;

    // Derived nutrients computed from the blended ration (override any averaged values).
    this.computeDerivedNutrients(nutrients);
    nutrients['umidita'] = moisturePct;
    nutrients['foraggiPct'] = forageRatio * 100;
    nutrients['concentratiPct'] = 100 - forageRatio * 100;

    return {
      totalDM: Math.round(totalDM * 1000) / 1000,
      totalAsFed: Math.round(totalAsFed * 1000) / 1000,
      nutrients: Object.fromEntries(
        Object.entries(nutrients).map(([k, v]) => [
          k,
          Math.round(v * 10000) / 10000,
        ]),
      ),
      totalCost: Math.round(totalCost * 10000) / 10000,
      moisturePct: Math.round(moisturePct * 100) / 100,
      forageRatio: Math.round(forageRatio * 10000) / 10000,
    };
  }

  /**
   * Compute derived nutrients from the blended ration and merge them into the
   * nutrient map. Order matters: NFC is computed before pectine, which depends
   * on it. All values are percentages on a dry-matter basis.
   */
  private computeDerivedNutrients(nutrients: Record<string, number>): void {
    const g = (code: string): number => nutrients[code] ?? 0;
    const aNDF = g('aNDF');

    nutrients['NFC'] = 100 - (g('proteina') + g('ee') + g('ceneri') + aNDF);
    nutrients['emicellulosa'] = aNDF - g('ADF');
    nutrients['pectine'] = nutrients['NFC'] - g('amido') - g('zuccheri');
    nutrients['ADF_aNDF'] = aNDF > 0 ? (g('ADF') / aNDF) * 100 : 0;
    nutrients['uNDF_aNDF'] = aNDF > 0 ? (g('uNDF') / aNDF) * 100 : 0;
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
    if (min !== null && value < min) {
      // How far below minimum?
      const deficit = ((min - value) / min) * 100;
      return deficit > 5 ? 'danger' : 'warning';
    }
    if (max !== null && value > max) {
      // How far above maximum?
      const excess = ((value - max) / max) * 100;
      return excess > 5 ? 'danger' : 'warning';
    }
    return 'good';
  }
}
