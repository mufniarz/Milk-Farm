/* Gate the workbook -> targets.json -> initial-data.ts -> target_ranges.json chain. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'src/app/core/data/initial-data.ts'),
  'utf8',
);
const marker = 'export const TARGET_RANGES';
const at = source.indexOf(marker);
if (at < 0) throw new Error('TARGET_RANGES not found');
const start = source.indexOf('{', at);
let depth = 0;
let inString = false;
let escaped = false;
let end = -1;
for (let i = start; i < source.length; i += 1) {
  const ch = source[i];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') inString = false;
    continue;
  }
  if (ch === '"') inString = true;
  else if (ch === '{') depth += 1;
  else if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end < 0) throw new Error('TARGET_RANGES braces not closed');

const app = JSON.parse(source.slice(start, end));
const workbookFixture = JSON.parse(
  fs.readFileSync(path.join(root, 'functions/tests/targets.json'), 'utf8'),
);
const server = JSON.parse(
  fs.readFileSync(path.join(root, 'functions/target_ranges.json'), 'utf8'),
);

const fail = (label) => {
  console.error(`Target parity failed: ${label}`);
  process.exit(1);
};
if (JSON.stringify(app) !== JSON.stringify(workbookFixture)) {
  fail('initial-data.ts does not match functions/tests/targets.json (workbook)');
}
if (JSON.stringify(server) !== JSON.stringify(workbookFixture)) {
  fail('functions/target_ranges.json does not match the workbook fixture');
}
console.log('Target parity OK: workbook fixture = initial-data = server ranges.');
