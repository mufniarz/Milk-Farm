/**
 * Pure ration calculation.
 *
 * This module has no Angular imports so it can be exercised directly by the
 * Node smoke test (`scripts/check-calculator.ts`) as well as by the Angular
 * service and component tests. Keep it free of framework dependencies.
 */

/** The feed fields the calculation actually needs. */
export interface RationFeed {
  /** Moisture percentage as fed (0–100). DM factor = 1 - moisturePct / 100. */
  moisturePct: number;
  /** Nutrient composition on a DM basis. */
  nutrients: Record<string, number> | null | undefined;
  /** Price per kg as fed (€/kg). */
  pricePerKg: number;
  /** 'forage' or 'concentrate'. */
  category: string;
}

/** Result of a ration calculation — manual or from the optimizer. */
export interface RationResult {
  /** Total dry matter in kg */
  totalDM: number;
  /** Total as-fed in kg */
  totalAsFed: number;
  /** Nutrient analysis on a DM basis (code → value). */
  nutrients: Record<string, number>;
  /** Total cost in € */
  totalCost: number;
  /** Overall moisture percentage of the TMR. */
  moisturePct: number;
  /** DM from forages / total DM. */
  forageRatio: number;
}

/** Per-head figures for a herd group. */
export interface GroupTotals {
  headCount: number;
  totalLoadAsFed: number;
  totalCost: number;
  costPerKgAsFed: number;
}

/**
 * Calculate the ration result from feed compositions and as-fed quantities.
 * Quantities are per head; the caller multiplies by the group head count for
 * a whole-group load.
 */
export function calculateRation(
  feeds: RationFeed[],
  quantities: number[],
): RationResult {
  if (feeds.length !== quantities.length) {
    throw new Error('Feeds and quantities arrays must have the same length');
  }

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

  const totalCost = feeds.reduce(
    (sum, f, i) => sum + f.pricePerKg * quantities[i],
    0,
  );

  const moisturePct = ((totalAsFed - totalDM) / totalAsFed) * 100;

  const forageDM = feeds.reduce((sum, f, i) => {
    return f.category === 'forage' ? sum + dmQuantities[i] : sum;
  }, 0);
  const forageRatio = totalDM > 0 ? forageDM / totalDM : 0;

  computeDerivedNutrients(nutrients);
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
function computeDerivedNutrients(nutrients: Record<string, number>): void {
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
export function evaluateNutrientStatus(
  value: number,
  min: number | null,
  max: number | null,
): 'good' | 'warning' | 'danger' {
  if (min !== null && value < min) {
    const deficit = ((min - value) / min) * 100;
    return deficit > 5 ? 'danger' : 'warning';
  }
  if (max !== null && value > max) {
    const excess = ((value - max) / max) * 100;
    return excess > 5 ? 'danger' : 'warning';
  }
  return 'good';
}

/**
 * Whole-group totals from a per-head ration. This is the bridge between the
 * per-head recipe cost and the group-level economics (IOFC, inventory usage).
 */
export function groupTotals(
  costPerHead: number,
  headCount: number,
  asFedPerHead: number,
): GroupTotals {
  const totalLoadAsFed = asFedPerHead * headCount;
  const totalCost = costPerHead * headCount;
  return {
    headCount,
    totalLoadAsFed,
    totalCost,
    costPerKgAsFed: totalLoadAsFed > 0 ? totalCost / totalLoadAsFed : 0,
  };
}

/**
 * The client-side guard for feeding edits. Firestore rules are the actual
 * enforcement; this keeps the UI from offering edits the rules would reject.
 */
export function isFeedingEditable(status: 'draft' | 'confirmed'): boolean {
  return status === 'draft';
}
