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
const sql = postgres(dbUrlTest);

async function test() {
  // Test column dependencies of index
  const res = await sql`
    WITH index_meta AS (
      SELECT 
        c.oid AS index_oid,
        i.indrelid AS table_oid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'uq_cvm_company_assets_single_active_approved'
    )
    SELECT 
      a.attname,
      a.attnum,
      d.deptype
    FROM index_meta m
    JOIN pg_depend d ON d.objid = m.index_oid AND d.refobjid = m.table_oid AND d.deptype = 'a'
    JOIN pg_attribute a ON a.attrelid = m.table_oid AND a.attnum = d.refobjsubid;
  `;
  console.log('DEPENDENT COLUMNS:', res);

  await sql.end();
}
test().catch(console.error);
