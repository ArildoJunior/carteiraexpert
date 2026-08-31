import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

const dbUrlTest = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

async function detail() {
  const sql = postgres(dbUrlTest, { max: 1 });
  const triggers = await sql`
    SELECT trigger_name, event_object_table, trigger_schema
    FROM information_schema.triggers;
  `;
  console.log('ALL TRIGGERS:', triggers);

  const schemas = await sql`
    SELECT schema_name
    FROM information_schema.schemata;
  `;
  console.log('ALL SCHEMAS:', schemas);

  const fundamentals = await sql`
    SELECT id, asset_id, reference_period, source, created_at
    FROM asset_fundamentals;
  `;
  console.log('FUNDAMENTALS ROWS:', fundamentals);

  await sql.end();
}

detail().catch(console.error);
