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

async function auditSchema() {
  const sql = postgres(dbUrlTest, { max: 1 });
  try {
    console.log('=== AUDITORIA DO SCHEMA REAL: asset_fundamentals ===\n');

    // 1. Colunas e tipos reais
    const columns = await sql`
      SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'asset_fundamentals'
      ORDER BY ordinal_position;
    `;
    console.log('COLUNAS:');
    console.table(columns);

    // 2. Constraints e índices
    const constraints = await sql`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'public.asset_fundamentals'::regclass;
    `;
    console.log('CONSTRAINTS:');
    console.table(constraints);

    const indexes = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'asset_fundamentals';
    `;
    console.log('ÍNDICES:');
    console.table(indexes);

  } finally {
    await sql.end();
  }
}

auditSchema().catch(console.error);
