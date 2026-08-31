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

const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
const sql = postgres(connectionString, { max: 1 });

async function runInspection() {
  console.log('--- 1. IDENTIFICAÇÃO DO VÍNCULO EXISTENTE ---');
  const bindings = await sql`
    SELECT id, company_id, asset_id, share_class, status, match_method, justification, source, created_at, updated_at
    FROM cvm_company_assets;
  `;
  console.log('REGISTROS_CVM_COMPANY_ASSETS:', JSON.stringify(bindings, null, 2));

  console.log('\n--- 2. INSPEÇÃO FÍSICA DO ÍNDICE EM PG_INDEXES ---');
  const indexes = await sql`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE tablename = 'cvm_company_assets';
  `;
  console.log('INDICES_FISICOS:', JSON.stringify(indexes, null, 2));

  console.log('\n--- 3. SCHEMA REAL DE AUDIT_LOGS EM INFORMATION_SCHEMA ---');
  const auditColumns = await sql`
    SELECT 
      column_name, 
      data_type, 
      udt_name, 
      is_nullable, 
      column_default
    FROM information_schema.columns
    WHERE table_name = 'audit_logs'
    ORDER BY ordinal_position;
  `;
  console.log('COLUNAS_AUDIT_LOGS:', JSON.stringify(auditColumns, null, 2));

  console.log('\n--- 4. BANCO E AMBIENTE CONECTADOS ---');
  const [dbInfo] = await sql`
    SELECT current_database() AS db_name, current_user AS user_name, version() AS pg_version;
  `;
  console.log('INFO_BANCO:', JSON.stringify(dbInfo, null, 2));

  await sql.end();
}

runInspection().catch((err) => {
  console.error('ERRO_INSPECAO:', err);
  process.exit(1);
});
