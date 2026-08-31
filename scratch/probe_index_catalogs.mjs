import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env sem imprimir valores sensíveis
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

async function probe() {
  const table = await sql`
    SELECT t.oid, n.nspname, t.relname 
    FROM pg_class t 
    JOIN pg_namespace n ON n.oid = t.relnamespace 
    WHERE n.nspname = 'public' AND t.relname = 'cvm_company_assets'
  `;
  console.log('TABLE:', table);

  const idx = await sql`
    SELECT 
      c.oid AS index_oid,
      c.relname AS index_name,
      i.indrelid,
      i.indisunique,
      i.indnatts,
      i.indkey,
      (i.indexprs IS NOT NULL) AS is_expr,
      pg_get_expr(i.indpred, i.indrelid) AS predicate_expr
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'uq_cvm_company_assets_single_active_approved'
  `;
  console.log('INDEX:', idx);

  if (idx.length > 0) {
    const deps = await sql`
      SELECT 
        d.classid::regclass,
        d.objid,
        d.objsubid,
        d.refclassid::regclass,
        d.refobjid,
        d.refobjsubid,
        d.deptype,
        a.attname
      FROM pg_depend d
      LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
      WHERE d.objid = ${idx[0].index_oid}
    `;
    console.log('INDEX DEPENDENCIES:', deps);
  }

  await sql.end();
}
probe().catch(console.error);
