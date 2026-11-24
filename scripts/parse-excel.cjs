/**
 * Generates src/app/core/data/initial-data.ts and golden-data.ts from the
 * source workbook docs/ALIMENTAZIONE.xlsx. Run: node scripts/parse-excel.cjs
 *
 * Excel values for nutrients and moisture are stored as fractions (0.07 = 7%);
 * they are multiplied by 100 here so the app works in percentage units.
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const REPO = process.cwd();
const WB_PATH = path.join(REPO, "docs/ALIMENTAZIONE.xlsx");

const SHEETS = [
  { name: "VACCHE DA LATTE", groupId: "lactating", suffix: "lattazione" },
  { name: "VACCHE ASCIUTTE", groupId: "dry", suffix: "asciutta" },
  { name: "MANZE", groupId: "heifer", suffix: "manze" },
];

// Column indices within the header:1 arrays (arrays start at spreadsheet col B).
const COL = {
  name: 1,
  price: 2,
  kgAsFed: 3,
  moisture: 5,
  nutrients: {
    proteina: 6,
    ee: 7,
    amido: 8,
    zuccheri: 9,
    ceneri: 10,
    aNDF: 11,
    uNDF: 12,
    ADF: 13,
    ADL: 14,
  },
};

const MEASURED_CODES = Object.keys(COL.nutrients);

/** Curated master nutrient list (measured + derived). */
const NUTRIENTS_MASTER = [
  {
    code: "umidita",
    nameIt: "Umidità",
    nameEn: "Moisture",
    unit: "% t.q.",
    isDerived: false,
  },
  {
    code: "proteina",
    nameIt: "Proteina Grezza",
    nameEn: "Crude Protein",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "ee",
    nameIt: "Estratto Etereo",
    nameEn: "Ether Extract",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "amido",
    nameIt: "Amido",
    nameEn: "Starch",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "zuccheri",
    nameIt: "Zuccheri",
    nameEn: "Sugars",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "ceneri",
    nameIt: "Ceneri",
    nameEn: "Ash",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "aNDF",
    nameIt: "aNDFom",
    nameEn: "aNDFom",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "uNDF",
    nameIt: "uNDFom",
    nameEn: "uNDFom",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "ADF",
    nameIt: "ADF",
    nameEn: "ADF",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "ADL",
    nameIt: "ADL",
    nameEn: "Lignin (ADL)",
    unit: "% s.s.",
    isDerived: false,
  },
  {
    code: "NFC",
    nameIt: "NFC",
    nameEn: "Non-Fiber Carbohydrates",
    unit: "% s.s.",
    isDerived: true,
    derivedFormula: "NFC = 100 - (proteina + ee + ceneri + aNDF)",
  },
  {
    code: "emicellulosa",
    nameIt: "Emicellulosa",
    nameEn: "Hemicellulose",
    unit: "% s.s.",
    isDerived: true,
    derivedFormula: "emicellulosa = aNDF - ADF",
  },
  {
    code: "pectine",
    nameIt: "Pectine",
    nameEn: "Pectin",
    unit: "% s.s.",
    isDerived: true,
    derivedFormula: "pectine = NFC - amido - zuccheri",
  },
  {
    code: "ADF_aNDF",
    nameIt: "ADF/aNDFom",
    nameEn: "ADF/aNDFom ratio",
    unit: "% dell'aNDF om",
    isDerived: true,
    derivedFormula: "ADF_aNDF = (ADF / aNDF) * 100",
  },
  {
    code: "uNDF_aNDF",
    nameIt: "uNDF/aNDFom",
    nameEn: "uNDFom/aNDFom ratio",
    unit: "% dell'aNDF om",
    isDerived: true,
    derivedFormula: "uNDF_aNDF = (uNDF / aNDF) * 100",
  },
  {
    code: "foraggiPct",
    nameIt: "% foraggi su s.s.",
    nameEn: "Forage % of DM",
    unit: "% s.s.",
    isDerived: true,
    derivedFormula: "foraggiPct = forageDM / totalDM * 100",
  },
  {
    code: "concentratiPct",
    nameIt: "% concentrati su s.s.",
    nameEn: "Concentrate % of DM",
    unit: "% s.s.",
    isDerived: true,
    derivedFormula: "concentratiPct = 100 - foraggiPct",
  },
];

const ANIMAL_GROUPS = [
  { id: "lactating", nameIt: "Vacche da latte", nameEn: "Lactating Cows" },
  { id: "dry", nameIt: "Vacche asciutte", nameEn: "Dry Cows" },
  { id: "heifer", nameIt: "Manze", nameEn: "Heifers" },
];

const round = (n, d = 2) => {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Map an analysis-row label to a nutrient code (specific patterns first). */
function labelToCode(label) {
  const s = String(label).toLowerCase();
  if (s.includes("concentrati")) return "concentratiPct";
  if (s.includes("foraggi")) return "foraggiPct";
  if (s.includes("emicellulosa")) return "emicellulosa";
  if (s.includes("adf/andf") || s.includes("adf/a ndf")) return "ADF_aNDF";
  if (s.includes("undf/andf") || s.includes("undf/a ndf")) return "uNDF_aNDF";
  if (s.includes("pectine")) return "pectine";
  if (s.includes("nfc")) return "NFC";
  if (s.includes("adl")) return "ADL";
  if (s.startsWith("adf")) return "ADF";
  if (s.includes("u ndf") || s.includes("undf")) return "uNDF";
  if (s.includes("a ndf") || s.includes("andf")) return "aNDF";
  if (s.includes("zuccheri")) return "zuccheri";
  if (s.includes("ceneri")) return "ceneri";
  if (s.includes("amido")) return "amido";
  if (s.includes("proteina")) return "proteina";
  if (s.startsWith("ee")) return "ee";
  if (s.includes("umidit")) return "umidita";
  return null;
}

/** Parse a "valori ideali" range string into { min, max }. */
function parseRange(raw) {
  if (raw === null || raw === undefined) return null;
  const t = String(raw).trim();
  if (t === "" || t === "-") return null;
  const norm = t.replace(/,/g, ".");
  const hasGt = norm.includes(">");
  const hasLt = norm.includes("<");
  if (hasGt || hasLt) {
    let min = null;
    let max = null;
    const gt = norm.match(/>\s*([\d.]+)/);
    const lt = norm.match(/<\s*([\d.]+)/);
    if (gt) min = parseFloat(gt[1]);
    if (lt) max = parseFloat(lt[1]);
    return min === null && max === null ? null : { min, max };
  }
  const nums = (norm.match(/[\d.]+/g) || [])
    .map(parseFloat)
    .filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  if (nums.length === 1) return { min: nums[0], max: null };
  const a = Math.min(nums[0], nums[1]);
  const b = Math.max(nums[0], nums[1]);
  return { min: a, max: b };
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Locate header row and the analysis block start.
  let headerRow = -1;
  let analysisRow = -1;
  rows.forEach((r, i) => {
    const c1 =
      r[1] === null || r[1] === undefined ? "" : String(r[1]).toLowerCase();
    const c0 =
      r[0] === null || r[0] === undefined ? "" : String(r[0]).toLowerCase();
    if (headerRow === -1 && c1.includes("prodotto")) headerRow = i;
    if (analysisRow === -1 && c0.includes("valori stimati")) analysisRow = i;
  });

  // ── Feeds ──
  const feeds = [];
  let category = "forage";
  for (
    let i = headerRow + 1;
    i < (analysisRow === -1 ? rows.length : analysisRow);
    i++
  ) {
    const r = rows[i];
    if (!r) continue;
    const marker = (
      r[0] === null || r[0] === undefined ? "" : String(r[0])
    ).toUpperCase();
    if (marker.includes("CONCENTRATI")) {
      category = "concentrate";
      continue;
    }
    if (marker.includes("FORAGGI")) {
      category = "forage";
      continue;
    }
    const name = r[COL.name];
    if (name === null || name === undefined || String(name).trim() === "")
      continue;

    const nutrients = {};
    for (const code of MEASURED_CODES) {
      const v = r[COL.nutrients[code]];
      nutrients[code] = typeof v === "number" ? round(v * 100) : 0;
    }
    const priceRaw = r[COL.price];
    const moistRaw = r[COL.moisture];
    feeds.push({
      name: String(name).trim().replace(/\s+/g, " "),
      category,
      pricePerKg: typeof priceRaw === "number" ? round(priceRaw, 3) : 0,
      moisturePct: typeof moistRaw === "number" ? round(moistRaw * 100, 1) : 0,
      nutrients,
    });
  }

  // ── Analysis (computed values + target ranges) ──
  const targets = [];
  const golden = {};
  // Commercial rows printed by the client's sheets. Not every sheet has all
  // of them: the lactating sheet prints only Kg t.q., Kg s.s. and the ration
  // cost, while the dry/heifer sheets also print €/kg and the group load.
  const commercial = {
    totalAsFed: null,
    workbookTotalDM: null,
    costPerKgAsFed: null,
    totalLoadAsFed: null,
    groupTotal: null,
  };
  if (analysisRow !== -1) {
    for (let i = analysisRow + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const label = r[0];
      if (label === null || label === undefined || String(label).trim() === "")
        continue;
      const value = r[1];
      const norm = String(label).toLowerCase().replace(/\s+/g, " ").trim();

      // Commercial rows first: "costo razione" is a prefix of
      // "costo razione al kg", so the more specific label must win.
      if (norm.startsWith("costo razione al kg")) {
        if (typeof value === "number") commercial.costPerKgAsFed = value;
        continue;
      }
      if (norm.startsWith("costo razione")) {
        if (typeof value === "number") commercial.groupTotal = value;
        continue;
      }
      if (norm.startsWith("totale carico")) {
        if (typeof value === "number") commercial.totalLoadAsFed = value;
        continue;
      }
      if (norm.startsWith("kg tq")) {
        if (typeof value === "number") commercial.totalAsFed = value;
        continue;
      }
      if (norm.startsWith("kg s.s")) {
        if (typeof value === "number") commercial.workbookTotalDM = value;
        continue;
      }

      const code = labelToCode(label);
      if (!code) continue;
      if (typeof value === "number") golden[code] = round(value * 100);
      const range = parseRange(r[2]);
      if (range) {
        targets.push({
          nutrientCode: code,
          minValue: range.min,
          maxValue: range.max,
          isActive: true,
        });
      }
    }
  }

  return { feeds, targets, golden, commercial };
}

// ── Parse all sheets ──
const wb = XLSX.readFile(WB_PATH);
const parsed = SHEETS.map((s) => ({ ...s, ...parseSheet(wb.Sheets[s.name]) }));

// ── Deduplicate feeds across sheets ──
const signature = (f) =>
  [
    f.moisturePct.toFixed(1),
    ...MEASURED_CODES.map((c) => (f.nutrients[c] || 0).toFixed(1)),
  ].join(",");

const emitted = new Map(); // name -> array of signatures already emitted
const FEEDS_SEED = [];
for (const sheet of parsed) {
  for (const feed of sheet.feeds) {
    const sig = signature(feed);
    const seen = emitted.get(feed.name) || [];
    if (seen.length === 0) {
      emitted.set(feed.name, [sig]);
      FEEDS_SEED.push({ ...feed, isAvailable: true });
    } else if (!seen.includes(sig)) {
      seen.push(sig);
      emitted.set(feed.name, seen);
      FEEDS_SEED.push({
        ...feed,
        name: `${feed.name} (${sheet.suffix})`,
        isAvailable: true,
      });
    }
  }
}
FEEDS_SEED.sort((a, b) => {
  if (a.category !== b.category) return a.category === "forage" ? -1 : 1;
  return a.name.localeCompare(b.name);
});

// ── Target ranges per group ──
const TARGET_RANGES = {};
for (const sheet of parsed) TARGET_RANGES[sheet.groupId] = sheet.targets;

// ── Reference rations (canonical fixture for every sheet) ──
const testDir = path.join(REPO, "functions/tests");
fs.mkdirSync(testDir, { recursive: true });

function buildSheetReference(sheet) {
  const solverFeeds = sheet.feeds.map((f, i) => ({
    id: `f${i}`,
    name: f.name,
    dmFactor: round(1 - f.moisturePct / 100, 4),
    nutrients: f.nutrients,
    pricePerKg: f.pricePerKg,
    category: f.category,
  }));
  const feedByName = new Map(solverFeeds.map((f) => [f.name, f]));

  const ws = wb.Sheets[sheet.name];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
  const quantities = [];
  for (const r of rows) {
    const rawName = r[COL.name];
    const qty = r[COL.kgAsFed];
    if (rawName === null || rawName === undefined) continue;
    if (typeof qty !== "number" || qty <= 0) continue;
    const name = String(rawName).trim().replace(/\s+/g, " ");
    const feed = feedByName.get(name);
    if (!feed) continue;
    quantities.push({ id: feed.id, name, kgAsFed: qty });
  }

  const totalAsFed = round(
    quantities.reduce((sum, r) => sum + r.kgAsFed, 0),
    4,
  );
  const solverTotalDM = round(
    quantities.reduce(
      (sum, r) => sum + r.kgAsFed * feedByName.get(r.name).dmFactor,
      0,
    ),
    3,
  );
  const costPerHead = round(
    quantities.reduce(
      (sum, r) => sum + r.kgAsFed * feedByName.get(r.name).pricePerKg,
      0,
    ),
    4,
  );
  const commercial = sheet.commercial || {};
  const groupTotal = commercial.groupTotal ?? costPerHead;
  const totalLoadAsFed = commercial.totalLoadAsFed ?? totalAsFed;
  const headCount =
    costPerHead > 0 ? Math.round(groupTotal / costPerHead) : 1;
  const costPerKgAsFed =
    commercial.costPerKgAsFed ??
    (totalAsFed > 0 ? round(costPerHead / totalAsFed, 6) : 0);

  return {
    sheet: sheet.name,
    groupId: sheet.groupId,
    feeds: solverFeeds,
    quantities,
    targets: sheet.targets,
    analysis: sheet.golden,
    totalAsFed,
    // The sheet's own Kg s.s. cell, for parity against the workbook.
    workbookTotalDM: commercial.workbookTotalDM ?? solverTotalDM,
    // The DM the rounded feed library reproduces, for solver constraints.
    solverTotalDM,
    costPerHead,
    groupTotal: round(groupTotal, 4),
    totalLoadAsFed: round(totalLoadAsFed, 4),
    costPerKgAsFed,
    headCount,
  };
}

const referenceRations = Object.fromEntries(
  parsed.map((s) => [s.groupId, buildSheetReference(s)]),
);

// ── Emit files ──
const HEADER = `// AUTO-GENERATED by scripts/parse-excel.cjs from docs/ALIMENTAZIONE.xlsx.\n// Do not edit by hand — re-run the script to regenerate.\n`;

const initialData =
  HEADER +
  `import { Feed } from '../models/feed.model';\n` +
  `import { Nutrient, NutrientTarget } from '../models/nutrient.model';\n` +
  `import { AnimalGroup, AnimalGroupId } from '../models/recipe.model';\n\n` +
  `export type FeedSeed = Omit<Feed, 'id' | 'farmId' | 'updatedAt'>;\n\n` +
  `export const NUTRIENTS_MASTER: Nutrient[] = ${JSON.stringify(NUTRIENTS_MASTER, null, 2)};\n\n` +
  `export const ANIMAL_GROUPS: AnimalGroup[] = ${JSON.stringify(ANIMAL_GROUPS, null, 2)};\n\n` +
  `export const FEEDS_SEED: FeedSeed[] = ${JSON.stringify(FEEDS_SEED, null, 2)};\n\n` +
  `export const TARGET_RANGES: Record<AnimalGroupId, NutrientTarget[]> = ${JSON.stringify(TARGET_RANGES, null, 2)};\n`;

const lactatingRef = referenceRations.lactating;
const goldenData =
  HEADER +
  `export interface GoldenRationEntry {\n  name: string;\n  kgAsFed: number;\n}\n\n` +
  `export interface GoldenTotals {\n  totalAsFed: number;\n  totalDM: number;\n  totalCost: number;\n}\n\n` +
  `export const GOLDEN_RATION_LACTATING: GoldenRationEntry[] = ${JSON.stringify(lactatingRef.quantities.map((r) => ({ name: r.name, kgAsFed: r.kgAsFed })), null, 2)};\n\n` +
  `export const GOLDEN_ANALYSIS_LACTATING: Record<string, number> = ${JSON.stringify(lactatingRef.analysis, null, 2)};\n\n` +
  `export const GOLDEN_TOTALS_LACTATING: GoldenTotals = ${JSON.stringify({ totalAsFed: lactatingRef.totalAsFed, totalDM: lactatingRef.workbookTotalDM, totalCost: lactatingRef.costPerHead }, null, 2)};\n\n` +
  `export const GOLDEN_TOTALS_DRY: GoldenTotals = ${JSON.stringify({ totalAsFed: referenceRations.dry.totalAsFed, totalDM: referenceRations.dry.workbookTotalDM, totalCost: referenceRations.dry.costPerHead }, null, 2)};\n\n` +
  `export const GOLDEN_TOTALS_HEIFER: GoldenTotals = ${JSON.stringify({ totalAsFed: referenceRations.heifer.totalAsFed, totalDM: referenceRations.heifer.workbookTotalDM, totalCost: referenceRations.heifer.costPerHead }, null, 2)};\n`;

const outDir = path.join(REPO, "src/app/core/data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "initial-data.ts"), initialData);
fs.writeFileSync(path.join(outDir, "golden-data.ts"), goldenData);

// ── JSON fixtures for the Python solver + parity tests (single source of truth) ──
const targetsFixture = Object.fromEntries(
  parsed.map((s) => [s.groupId, s.targets]),
);
fs.writeFileSync(
  path.join(testDir, "targets.json"),
  JSON.stringify(targetsFixture, null, 2),
);
fs.writeFileSync(
  path.join(testDir, "reference_rations.json"),
  JSON.stringify(referenceRations, null, 2),
);

// The old single-lactating fixture would be a second source of truth.
const oldFixture = path.join(testDir, "golden_ration.json");
if (fs.existsSync(oldFixture)) fs.unlinkSync(oldFixture);

console.log(
  `Feeds: ${FEEDS_SEED.length} (forage ${FEEDS_SEED.filter((f) => f.category === "forage").length}, concentrate ${FEEDS_SEED.filter((f) => f.category === "concentrate").length})`,
);
console.log(
  `Targets: ` +
    parsed.map((s) => `${s.groupId}=${s.targets.length}`).join(", "),
);
for (const groupId of ["lactating", "dry", "heifer"]) {
  const ref = referenceRations[groupId];
  console.log(
    `${groupId}: ${ref.quantities.length} feeds, tq=${ref.totalAsFed}, s.s.=${ref.workbookTotalDM} (solver ${ref.solverTotalDM}), cost/head=${ref.costPerHead}, group=${ref.groupTotal}, heads=${ref.headCount}`,
  );
}
