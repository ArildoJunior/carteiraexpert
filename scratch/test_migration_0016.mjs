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

async function testMigration() {
  const sql = postgres(dbUrlTest, { max: 1 });
  try {
    const migrationSql = fs.readFileSync('drizzle/migrations/0016_add_cvm_asset_bindings_unique_active.sql', 'utf-8');
    await sql.unsafe(migrationSql);
    console.log('MIGRATION_0016_EXECUTADA_COM_SUCESSO');

    const [idx] = await sql`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE indexname = 'uq_cvm_company_assets_single_active_approved';
    `;
    console.log('INDEX_CONFIRMADO:', JSON.stringify(idx, null, 2));
  } finally {
    await sql.end();
  }
}

testMigration().catch(console.error);
