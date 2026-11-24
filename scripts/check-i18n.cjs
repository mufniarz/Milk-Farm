/**
 * Fails when the Italian and English translation files drift apart.
 *
 * New screens must ship both languages; this keeps a missing key from
 * silently falling back to the raw key at runtime.
 *
 * Usage: node scripts/check-i18n.cjs
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "src/assets/i18n");

/** Flatten { "A": { "B": "x" } } to { "A.B": "x" }. */
function flatten(value, prefix = "", out = new Map()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, value);
  }
  return out;
}

function load(locale) {
  const file = path.join(dir, `${locale}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Missing translation file: ${file}`);
    process.exit(1);
  }
  return flatten(JSON.parse(fs.readFileSync(file, "utf8")));
}

const it = load("it");
const en = load("en");

const missingInEn = [...it.keys()].filter((key) => !en.has(key)).sort();
const missingInIt = [...en.keys()].filter((key) => !it.has(key)).sort();

if (missingInEn.length === 0 && missingInIt.length === 0) {
  console.log(`i18n OK: ${it.size} keys in both it.json and en.json`);
  process.exit(0);
}

if (missingInEn.length) {
  console.error(`Keys present in it.json but missing from en.json:`);
  for (const key of missingInEn) console.error(`  - ${key}`);
}
if (missingInIt.length) {
  console.error(`Keys present in en.json but missing from it.json:`);
  for (const key of missingInIt) console.error(`  - ${key}`);
}
process.exit(1);
