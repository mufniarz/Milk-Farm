import type { Feed, FeedCategory } from '../models/feed.model';

/**
 * A feed parsed from an uploaded CSV/Excel file, ready for Firestore.
 * `id`, `farmId`, and `updatedAt` are assigned on import.
 */
export type ParsedFeed = Omit<Feed, 'id' | 'farmId' | 'updatedAt'>;

export interface FeedImportResult {
  feeds: ParsedFeed[];
  /**
   * True when the file stored percentages as fractions (0.0704 instead of
   * 7.04) and the values were multiplied by 100.
   */
  scaledFromFractions: boolean;
  /** Rows that looked like data but had no usable feed name. */
  skippedRows: number;
}

/** Nutrient codes written to Firestore; order is only used for reporting. */
const NUTRIENT_CODES = [
  'proteina',
  'ee',
  'amido',
  'zuccheri',
  'ceneri',
  'aNDF',
  'uNDF',
  'ADF',
  'ADL',
] as const;

type Field = 'name' | 'price' | 'moisture' | 'category' | 'available' | (typeof NUTRIENT_CODES)[number];

/** Column indices found in the sheet header row. */
type ColumnMap = Partial<Record<Field, number>>;

/** Lowercase, fold diacritics, collapse whitespace. */
function normalise(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip spaces and punctuation so "a NDF % s.s" and "aNDF" compare equal. */
function compact(value: unknown): string {
  return normalise(value).replace(/[^a-z0-9]/g, '');
}

/**
 * Classify a header cell. Handles both the app's flat template
 * (`name`, `category`, `proteina`, …) and an Italian feed spreadsheet such as
 * Milk Farm's ALIMENTAZIONE.xlsx (`prodotto`, `prezzo al kg`,
 * `proteina % s.s`, `a NDF % s.s`, …).
 */
function classify(header: unknown): Field | null {
  const c = compact(header);
  if (!c) return null;

  if (c.includes('prodotto') || c === 'name' || c === 'nome' || c === 'alimento') return 'name';
  if (c.includes('categoria') || c === 'category' || c === 'cat') return 'category';
  if (c.includes('prezzo') || c === 'price' || c === 'priceperkg') return 'price';
  if (c.includes('umidita') || c.includes('moisture')) return 'moisture';
  if (c === 'isavailable' || c === 'disponibile') return 'available';

  // Ratios before their constituents: "aNDF" also contains "ndf".
  if (c.includes('andf')) return 'aNDF';
  if (c.includes('undf')) return 'uNDF';
  if (c.includes('adl')) return 'ADL';
  if (c.includes('adf')) return 'ADF';
  if (c.includes('emicellulosa')) return null;
  if (c.includes('proteina')) return 'proteina';
  if (c.includes('amido')) return 'amido';
  if (c.includes('zuccheri')) return 'zuccheri';
  if (c.includes('ceneri')) return 'ceneri';
  if (c.startsWith('ee')) return 'ee';

  // Quantities are ignored when building a feed library, but recognising the
  // header keeps them out of the free-text name detection.
  if (c.includes('kgtq') || c.includes('kgss')) return null;

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = normalise(value).replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A row is a section marker when it announces FORAGGI or CONCENTRATI. */
function sectionCategory(row: unknown[]): FeedCategory | null {
  const text = row.map(normalise).filter(Boolean).join(' ');
  if (/^foragg/i.test(text)) return 'forage';
  if (/^concentrat/i.test(text)) return 'concentrate';
  return null;
}

/** Totals, notes, and blank section rows are not feeds. */
function isNotAFeed(name: string): boolean {
  if (!name) return true;
  if (/^[\d.,\s]+$/.test(name)) return true;
  return /^(totale|totali|valori|kg\b|costo|umidita)/i.test(name);
}

/**
 * Parse a sheet (array of rows) into feeds.
 *
 * Supports two layouts:
 *  - the original Milk Farm workbook: title rows, a FORAGGI section, then a
 *    CONCENTRATI section, Italian headers, and percentage values stored as
 *    fractions (0.0704 = 7.04%);
 *  - the flat import template: one header row with `name`, `category`,
 *    `pricePerKg`, `moisturePct`, `isAvailable` and nutrient codes as columns,
 *    with percentage values already in percent.
 *
 * The layout is detected from the header row, so callers do not choose.
 */
export function parseFeedRows(rows: unknown[][]): FeedImportResult {
  const headerRowIndex = rows.findIndex((row) => {
    const fields = row.map(classify);
    return fields.includes('name') && row.length > 1;
  });

  const empty: FeedImportResult = {
    feeds: [],
    scaledFromFractions: false,
    skippedRows: 0,
  };
  if (headerRowIndex === -1) return empty;

  const columns: ColumnMap = {};
  rows[headerRowIndex].forEach((cell, index) => {
    const field = classify(cell);
    if (field && columns[field] === undefined) columns[field] = index;
  });
  if (columns.name === undefined) return empty;

  const dataRows = rows.slice(headerRowIndex + 1);

  // The reference workbook ends the feed tables with an analysis block
  // ("valori stimati su s.s." / "valori ideali"). Everything from that row on
  // describes the ration, not feeds.
  const analysisRowIndex = dataRows.findIndex((row) =>
    row.some((cell) => compact(cell).includes('valoristimati')),
  );
  const feedRows =
    analysisRowIndex === -1 ? dataRows : dataRows.slice(0, analysisRowIndex);

  // Detect fractional percentages: a feed table in percent has values well
  // above 1.5 somewhere; a fractional one never exceeds 1. Only rows that
  // actually name a feed are considered — subtotal rows ("Totale foraggi",
  // per-feed carry kg) put large numbers in unrelated columns.
  const candidateRows = feedRows.filter(
    (row) => !isNotAFeed(String(row[columns.name!] ?? '').trim()),
  );

  let maxPercentValue = 0;
  for (const row of candidateRows) {
    for (const code of NUTRIENT_CODES) {
      const col = columns[code];
      if (col === undefined) continue;
      const n = toNumber(row[col]);
      if (n !== null && n > maxPercentValue) maxPercentValue = n;
    }
    if (columns.moisture !== undefined) {
      const moisture = toNumber(row[columns.moisture]);
      if (moisture !== null && moisture > maxPercentValue) maxPercentValue = moisture;
    }
  }
  const scale = maxPercentValue > 0 && maxPercentValue < 1.5 ? 100 : 1;

  const feeds: ParsedFeed[] = [];
  let skippedRows = 0;
  let section: FeedCategory = 'forage';

  for (const row of feedRows) {
    const marked = sectionCategory(row);
    if (marked) {
      section = marked;
      continue;
    }

    const rawName = row[columns.name];
    const name = String(rawName ?? '').trim();
    if (isNotAFeed(name)) {
      // Count only rows that carry numbers, so blank spacer rows are ignored.
      if (row.some((cell) => toNumber(cell) !== null)) skippedRows += 1;
      continue;
    }

    const nutrients: Record<string, number> = {};
    for (const code of NUTRIENT_CODES) {
      const col = columns[code];
      if (col === undefined) continue;
      const n = toNumber(row[col]);
      if (n !== null) nutrients[code] = n * scale;
    }

    if (Object.keys(nutrients).length === 0) {
      skippedRows += 1;
      continue;
    }

    const categoryValue = normalise(
      columns.category !== undefined ? row[columns.category] : '',
    );
    let category: FeedCategory = section;
    if (categoryValue) {
      category = /concentrat|^c$/i.test(categoryValue) ? 'concentrate' : 'forage';
    }

    const price = columns.price !== undefined ? toNumber(row[columns.price]) : null;
    const moisture = columns.moisture !== undefined ? toNumber(row[columns.moisture]) : null;
    const available = columns.available !== undefined ? row[columns.available] : undefined;

    feeds.push({
      name,
      category,
      pricePerKg: price ?? 0,
      moisturePct: moisture !== null ? moisture * scale : 0,
      isAvailable:
        available === undefined ||
        !['0', 'false', 'no', 'falsa', 'false'].includes(normalise(available)),
      nutrients,
    });
  }

  return { feeds, scaledFromFractions: scale === 100, skippedRows };
}
