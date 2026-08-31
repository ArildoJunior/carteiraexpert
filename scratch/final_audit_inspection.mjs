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
const dbUrlMain = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/carteiraexpert';

async function auditTestDatabase() {
  const sql = postgres(dbUrlTest, { max: 1 });
  try {
    console.log('=== INSPEÇÃO ESTRUTURAL E DE ESTADO: carteiraexpert_test ===\n');

    // 1. Tabela public.cvm_company_assets
    const [tableInfo] = await sql`
      SELECT 
        n.nspname AS table_schema,
        t.relname AS table_name,
        t.oid AS table_oid,
        t.relkind
      FROM pg_class t
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'cvm_company_assets';
    `;
    console.log('TABELA:', tableInfo);

    // 2. Índice public.uq_cvm_company_assets_single_active_approved
    const [indexInfo] = await sql`
      SELECT 
        n.nspname AS index_schema,
        c.relname AS index_name,
        c.oid AS index_oid,
        i.indrelid AS table_oid,
        i.indisunique,
        i.indnatts,
        i.indkey::text AS indkey,
        a.attname AS indexed_column,
        (i.indexprs IS NOT NULL) AS is_expression,
        pg_get_expr(i.indpred, i.indrelid) AS predicate_expr
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE n.nspname = 'public' AND c.relname = 'uq_cvm_company_assets_single_active_approved';
    `;
    console.log('ÍNDICE:', indexInfo);

    // 3. Dependências de colunas no pg_depend
    const deps = await sql`
      SELECT 
        d.objid AS index_oid,
        d.refobjid AS table_oid,
        a.attname AS dependent_column,
        d.deptype
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
      WHERE d.objid = ${indexInfo.index_oid} AND d.deptype = 'a';
    `;
    console.log('DEPENDÊNCIAS DE COLUNAS:', deps);

    // 4. Verificação de Vínculos APPROVED duplicados
    const [duplicateApproved] = await sql`
      SELECT COUNT(*)::int AS count_duplicate_approved
      FROM (
        SELECT asset_id
        FROM public.cvm_company_assets
        WHERE status = 'APPROVED'
        GROUP BY asset_id
        HAVING COUNT(*) > 1
      ) d;
    `;
    console.log('VÍNCULOS APPROVED DUPLICADOS:', duplicateApproved.count_duplicate_approved);

    // 5. Contagens de Registros
    const [counts] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM cvm_company_assets) AS count_cvm_company_assets,
        (SELECT COUNT(*)::int FROM cvm_company_assets WHERE status = 'APPROVED') AS count_approved_bindings,
        (SELECT COUNT(*)::int FROM cvm_companies) AS count_cvm_companies,
        (SELECT COUNT(*)::int FROM assets) AS count_assets,
        (SELECT COUNT(*)::int FROM asset_fundamentals) AS count_asset_fundamentals,
        (SELECT COUNT(*)::int FROM audit_logs WHERE table_name = 'cvm_company_assets') AS count_audit_logs_cvm;
    `;
    console.log('CONTAGENS:', counts);

    // 6. Triggers e Funções Temporárias
    const triggers = await sql`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name LIKE '%force_audit%' OR trigger_name LIKE '%fail_audit%';
    `;
    console.log('TRIGGERS TEMPORÁRIOS:', triggers.length);

    const functions = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public' AND (routine_name LIKE '%force_audit%' OR routine_name LIKE '%fail_audit%');
    `;
    console.log('FUNÇÕES TEMPORÁRIAS:', functions.length);

    // 7. Schemas Auxiliares Temporários
    const auxSchemas = await sql`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE '%temp_audit%' OR schema_name LIKE '%temp_divergence%';
    `;
    console.log('SCHEMAS AUXILIARES TEMPORÁRIOS:', auxSchemas.length);

  } finally {
    await sql.end();
  }
}

async function auditMainDatabase() {
  let sql;
  try {
    sql = postgres(dbUrlMain, { max: 1 });
    console.log('\n=== INSPEÇÃO DO BANCO PRINCIPAL: carteiraexpert ===\n');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'cvm_company_assets';
    `;
    console.log('Tabela cvm_company_assets no banco principal:', tables.length === 0 ? 'NÃO EXISTE (INTOCADO)' : 'EXISTE');
  } catch (err) {
    console.log('Aviso ao consultar banco principal:', err.message);
  } finally {
    if (sql) await sql.end();
  }
}

async function main() {
  await auditTestDatabase();
  await auditMainDatabase();
}

main().catch(console.error);
