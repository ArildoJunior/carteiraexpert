// fix-test-scripts.mjs
// Adiciona tipos corretos nas chamadas registry.fetch<TInput, TOutput>(...)
// Idempotente. Roda com: node fix-test-scripts.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CATEGORY_TYPES = {
  quote_br:        ['BrapiQuoteInput',    'BrapiQuoteOutput',    'brapi'],
  quote_us:        ['FinnhubQuoteInput',  'FinnhubQuoteOutput',  'finnhub'],
  crypto:          ['CryptoQuoteInput',   'CryptoQuoteOutput',   'coingecko'],
  quote_global:    ['GlobalQuoteInput',   'GlobalQuoteOutput',   'yahoo-finance'],
  fx_quote:        ['FxQuoteInput',       'FxQuoteOutput',       'bc-ptax'],
  indicator_br:    ['IndicatorInput',     'IndicatorOutput',     'bc-sgs'],
  fundamental_us:  ['FundamentalInput',   'FundamentalOutput',   'sec-edgar'],
  dividend_br:     ['DividendInput',      'DividendOutput',      'dividend-br'],
  dividend_us:     ['DividendInput',      'DividendOutput',      'dividend-us'],
};

const files = readdirSync('scripts').filter(f => /^test-.*\.ts$/.test(f)).sort();
let fixed = 0, unchanged = 0;
const issues = [];

for (const file of files) {
  const path = join('scripts', file);
  const original = readFileSync(path, 'utf8');
  let src = original;

  const cats = [...src.matchAll(/\.fetch\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  if (cats.length === 0) { unchanged++; continue; }

  const needsImport = new Map();
  let modified = false;

  for (const cat of cats) {
    const map = CATEGORY_TYPES[cat];
    if (!map) { issues.push(`${file}: categoria "${cat}" nao mapeada`); continue; }
    const [inT, outT, adapter] = map;
    if (!needsImport.has(adapter)) needsImport.set(adapter, [inT, outT]);

    const genericOld = new RegExp(`\\.fetch<[^>]+>\\(\\s*['"]${cat}['"]`);
    if (genericOld.test(src)) {
      src = src.replace(genericOld, `.fetch<${inT}, ${outT}>('${cat}'`);
      modified = true;
      continue;
    }
    const callOld1 = `.fetch('${cat}'`;
    const callNew  = `.fetch<${inT}, ${outT}>('${cat}'`;
    if (src.includes(callOld1)) {
      src = src.replace(callOld1, callNew);
      modified = true;
    } else {
      const callOld2 = `.fetch("${cat}"`;
      const callNew2 = `.fetch<${inT}, ${outT}>("${cat}"`;
      if (src.includes(callOld2)) {
        src = src.replace(callOld2, callNew2);
        modified = true;
      } else {
        issues.push(`${file}: .fetch('${cat}', ...) nao encontrada`);
      }
    }
  }

  const existing = src.match(/^import type \{[^}]+\} from '[^']+';?$/gm) || [];
  const toAdd = [];
  for (const [adapter, [inT, outT]] of needsImport) {
    const line = `import type { ${inT}, ${outT} } from '../lib/providers/adapters/${adapter}';`;
    if (!existing.some(e => e.includes(`from '../lib/providers/adapters/${adapter}'`))) {
      toAdd.push(line);
    }
  }
  if (toAdd.length) {
    const block = toAdd.join('\n');
    const allImports = [...src.matchAll(/^import .+$/gm)];
    if (allImports.length) {
      const last = allImports[allImports.length - 1];
      const idx = last.index + last[0].length;
      src = src.slice(0, idx) + '\n' + block + src.slice(idx);
    } else {
      src = block + '\n' + src;
    }
    modified = true;
  }

  if (modified) { writeFileSync(path, src); console.log(`OK ${file}`); fixed++; }
  else { unchanged++; }
}

console.log(`\nResumo: ${fixed} modificados, ${unchanged} sem alteracao`);
if (issues.length) {
  console.log('\nAvisos:');
  issues.forEach(i => console.log(`  - ${i}`));
}