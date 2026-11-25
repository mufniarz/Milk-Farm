import { calculateRation } from './ration-calculator';
import { FIBRE_TARGET_CODES } from './target-safety';
import {
  ScenarioBase,
  ScenarioBaseTarget,
  ScenarioChanges,
  ScenarioCompliance,
  ScenarioSnapshot,
  ScenarioWarning,
} from '../models/scenario.model';

const BOUNDARY_EPS = 0.001;

/**
 * Apply a saved scenario's changes to a base ration and recompute everything
 * from the pure calculator. No Firestore, no solver.
 */
export function applyScenario(
  base: ScenarioBase,
  changes: ScenarioChanges,
  now: Date = new Date(),
): ScenarioSnapshot {
  const feeds = base.feeds.map((feed) => ({
    ...feed,
    pricePerKg: changes.feedPrices?.[feed.id] ?? feed.pricePerKg,
    kgAsFed: changes.inclusions?.[feed.id] ?? feed.kgAsFed,
  }));

  const targets = effectiveTargets(base.targets, changes);
  const result = calculateRation(feeds, feeds.map((feed) => feed.kgAsFed));

  if (result.totalDM <= 0) {
    return {
      status: 'infeasible',
      totalAsFed: 0,
      totalDM: 0,
      totalCost: 0,
      nutrients: {},
      targets,
      compliance: {},
      warnings: [],
      computedAt: now.toISOString(),
    };
  }

  const compliance: Record<string, ScenarioCompliance> = {};
  const warnings: ScenarioWarning[] = [];
  for (const target of targets) {
    if (!target.isActive) continue;
    const value = result.nutrients[target.nutrientCode];
    if (value === undefined) continue;
    const evaluated = evaluateTarget(target, value);
    compliance[target.nutrientCode] = evaluated.status;
    if (evaluated.warning) warnings.push(evaluated.warning);
  }

  return {
    status: 'computed',
    totalAsFed: result.totalAsFed,
    totalDM: result.totalDM,
    totalCost: result.totalCost,
    nutrients: result.nutrients,
    targets,
    compliance,
    warnings,
    computedAt: now.toISOString(),
  };
}

function effectiveTargets(
  targets: ScenarioBaseTarget[],
  changes: ScenarioChanges,
): ScenarioBaseTarget[] {
  return targets.map((target) => {
    const override = changes.targetOverrides?.[target.nutrientCode];
    if (!override) return target;
    return {
      ...target,
      minValue: override.min,
      maxValue: override.max,
      source: 'override',
    };
  });
}

function evaluateTarget(
  target: ScenarioBaseTarget,
  value: number,
): { status: ScenarioCompliance; warning?: ScenarioWarning } {
  const min = target.minValue;
  const max = target.maxValue;
  if (min !== null && value < min) {
    return {
      status: 'below_min',
      warning: {
        code: target.nutrientCode,
        value,
        min,
        max,
        issue: 'below_min',
      },
    };
  }
  if (max !== null && value > max) {
    return {
      status: 'above_max',
      warning: {
        code: target.nutrientCode,
        value,
        min,
        max,
        issue: 'above_max',
      },
    };
  }
  if (FIBRE_TARGET_CODES.has(target.nutrientCode)) {
    if (min !== null && Math.abs(value - min) <= BOUNDARY_EPS) {
      return {
        status: 'at_boundary',
        warning: {
          code: target.nutrientCode,
          value,
          min,
          max,
          issue: 'at_boundary',
          boundary: 'min',
        },
      };
    }
    if (max !== null && Math.abs(value - max) <= BOUNDARY_EPS) {
      return {
        status: 'at_boundary',
        warning: {
          code: target.nutrientCode,
          value,
          min,
          max,
          issue: 'at_boundary',
          boundary: 'max',
        },
      };
    }
  }
  return { status: 'met' };
}
