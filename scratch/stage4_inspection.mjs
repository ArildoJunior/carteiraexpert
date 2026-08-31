import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env
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
const dbUrlMain = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/carteiraexpert';

async function inspect() {
  console.log('=== INSPEÇÃO BANCO TESTES: carteiraexpert_test ===');
  const sqlTest = postgres(dbUrlTest, { max: 1 });

  const [fundCount] = await sqlTest`SELECT count(*)::int as count FROM asset_fundamentals;`;
  console.log('asset_fundamentals count:', fundCount.count);

  const [auditCvmCount] = await sqlTest`SELECT count(*)::int as count FROM audit_logs WHERE action LIKE 'CVM_%';`;
  console.log('audit_logs CVM actions count:', auditCvmCount.count);

  const [bindingsCount] = await sqlTest`SELECT count(*)::int as count FROM cvm_company_assets;`;
  console.log('cvm_company_assets count:', bindingsCount.count);

  const [approvedBindings] = await sqlTest`SELECT count(*)::int as count FROM cvm_company_assets WHERE status = 'APPROVED';`;
  console.log('cvm_company_assets APPROVED count:', approvedBindings.count);

  const [companiesCount] = await sqlTest`SELECT count(*)::int as count FROM cvm_companies;`;
  console.log('cvm_companies count:', companiesCount.count);

  const [assetsCount] = await sqlTest`SELECT count(*)::int as count FROM assets;`;
  console.log('assets count:', assetsCount.count);

  const tempTriggers = await sqlTest`
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_name LIKE '%force%' OR trigger_name LIKE '%test%';
  `;
  console.log('Temporary/test triggers count:', tempTriggers.length);

  const tempFunctions = await sqlTest`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public' AND (routine_name LIKE '%force%' OR routine_name LIKE '%test%');
  `;
  console.log('Temporary/test functions count:', tempFunctions.length);

  const tempSchemas = await sqlTest`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE '%temp_%';
  `;
  console.log('Temporary schemas count:', tempSchemas.length);

  await sqlTest.end();

  console.log('\n=== INSPEÇÃO BANCO PRINCIPAL: carteiraexpert ===');
  try {
    const sqlMain = postgres(dbUrlMain, { max: 1 });

    const cvmTables = await sqlMain`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('cvm_company_assets', 'cvm_companies', 'cvm_source_files', 'cvm_ingestion_runs');
    `;
    console.log('CVM tables in main db count:', cvmTables.length, cvmTables.length === 0 ? '(INTOCADO)' : cvmTables);

    const [mainFundCount] = await sqlMain`SELECT count(*)::int as count FROM asset_fundamentals;`;
    console.log('main db asset_fundamentals count:', mainFundCount.count);

    await sqlMain.end();
  } catch (err) {
    console.log('Aviso ao consultar banco principal:', err.message);
  }
}

inspect().catch((err) => {
  console.error('Inspection error:', err);
  process.exit(1);
});
