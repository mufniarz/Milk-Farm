/**
 * Golden-data test for the ration calculator.
 *
 * Reconstructs the reference lactating ration from the source spreadsheet
 * (docs/ALIMENTAZIONE.xlsx) and asserts the calculator reproduces the
 * spreadsheet's published "valori stimati" analysis within rounding tolerance.
 */
import { RationCalculatorService } from './ration-calculator.service';
import { Feed } from '../models/feed.model';
import { FEEDS_SEED } from '../data/initial-data';
import {
  GOLDEN_RATION_LACTATING,
  GOLDEN_ANALYSIS_LACTATING,
} from '../data/golden-data';

/** Absolute tolerance (percentage points) for feed values rounded to 2 dp. */
const TOL = 0.1;

describe('RationCalculatorService (golden data)', () => {
  let service: RationCalculatorService;

  beforeEach(() => {
    service = new RationCalculatorService();
  });

  function buildGoldenRation(): { feeds: Feed[]; quantities: number[] } {
    const feeds: Feed[] = [];
    const quantities: number[] = [];
    for (const entry of GOLDEN_RATION_LACTATING) {
      const seed = FEEDS_SEED.find((f) => f.name === entry.name);
      expect(seed)
        .withContext(`feed "${entry.name}" present in FEEDS_SEED`)
        .toBeTruthy();
      feeds.push({ ...seed!, id: entry.name, farmId: 'test' } as Feed);
      quantities.push(entry.kgAsFed);
    }
    return { feeds, quantities };
  }

  it('reproduces the spreadsheet analysis for the reference lactating ration', () => {
    const { feeds, quantities } = buildGoldenRation();
    const result = service.calculateRation(feeds, quantities);

    for (const [code, expected] of Object.entries(GOLDEN_ANALYSIS_LACTATING)) {
      const actual = result.nutrients[code];
      expect(Math.abs(actual - expected))
        .withContext(
          `nutrient "${code}" abs diff (expected ${expected}, got ${actual})`,
        )
        .toBeLessThanOrEqual(TOL);
    }
  });

  it('matches the golden moisture and forage ratio', () => {
    const { feeds, quantities } = buildGoldenRation();
    const result = service.calculateRation(feeds, quantities);

    expect(
      Math.abs(result.moisturePct - GOLDEN_ANALYSIS_LACTATING['umidita']),
    ).toBeLessThanOrEqual(TOL);
    expect(
      Math.abs(
        result.forageRatio * 100 - GOLDEN_ANALYSIS_LACTATING['foraggiPct'],
      ),
    ).toBeLessThanOrEqual(TOL);
  });
});
