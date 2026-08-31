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
const sql = postgres(dbUrlTest, { max: 5 });

const migrationSql = fs.readFileSync(
  path.resolve(process.cwd(), 'drizzle/migrations/0016_add_cvm_asset_bindings_unique_active.sql'),
  'utf-8'
);

async function runMigration(client = sql) {
  await client.unsafe(migrationSql);
}

async function restoreCorrectIndex() {
  await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
  await sql`
    CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
    ON public.cvm_company_assets (asset_id)
    WHERE status = 'APPROVED';
  `;
}

async function testSuite() {
  console.log('--- INICIANDO BATERIA DE TESTES DA MIGRATION 0016 ---');

  // Teste 1: Execução com índice correto existente (idempotência e validação estrutural)
  console.log('\n[TESTE 1] Execução com índice correto existente...');
  await restoreCorrectIndex();
  await runMigration();
  console.log('PASSOU: Execução idempotente com validação estrutural bem-sucedida.');

  // Teste 2: Inspeção dos Catálogos Relacionais
  console.log('\n[TESTE 2] Inspeção dos catálogos físicos (pg_class, pg_namespace, pg_index, pg_depend)...');
  const [indexMeta] = await sql`
    SELECT 
      c.oid AS index_oid,
      n.nspname AS schema_name,
      c.relname AS index_name,
      t.relname AS table_name,
      i.indisunique,
      i.indnatts,
      a.attname AS column_name,
      (i.indexprs IS NOT NULL) AS is_expression,
      pg_get_expr(i.indpred, i.indrelid) AS predicate
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND c.relname = 'uq_cvm_company_assets_single_active_approved';
  `;
  console.log('DADOS_CATALOGO:', JSON.stringify(indexMeta, null, 2));

  if (!indexMeta || !indexMeta.indisunique || indexMeta.column_name !== 'asset_id') {
    throw new Error('Falha na inspeção do catálogo do índice correto.');
  }

  // Teste 3: Execução Concorrente com Advisory Lock (2 conexões simultâneas)
  console.log('\n[TESTE 3] Execução Concorrente com Advisory Lock...');
  const client1 = postgres(dbUrlTest, { max: 1 });
  const client2 = postgres(dbUrlTest, { max: 1 });
  try {
    const results = await Promise.allSettled([
      runMigration(client1),
      runMigration(client2),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    console.log(`Concorrência: ${fulfilled.length} sucessos, ${rejected.length} falhas.`);
    if (fulfilled.length !== 2) {
      throw new Error('Ambas as execuções serializadas deveriam concluir com sucesso via advisory lock.');
    }
    console.log('PASSOU: Execução concorrente serializada com sucesso.');
  } finally {
    await client1.end();
    await client2.end();
  }

  // Teste 4: Teste de Índice Homônimo em Outro Schema (Isolamento de Namespace)
  console.log('\n[TESTE 4] Índice Homônimo em Schema Auxiliar Temporário...');
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS temp_audit_aux_schema;`;
    await sql`
      CREATE TABLE temp_audit_aux_schema.cvm_company_assets (
        id uuid PRIMARY KEY,
        asset_id uuid NOT NULL,
        status varchar(20) NOT NULL
      );
    `;
    await sql`
      CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
      ON temp_audit_aux_schema.cvm_company_assets (asset_id)
      WHERE status = 'APPROVED';
    `;

    // Dropa índice no schema public para testar se a migration cria no public mesmo com o homônimo no aux
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;

    await runMigration();

    // Verifica que o índice foi criado no schema public
    const [publicIdx] = await sql`
      SELECT c.oid, n.nspname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'uq_cvm_company_assets_single_active_approved';
    `;
    if (!publicIdx) {
      throw new Error('A migration não criou o índice no schema public diante de schema auxiliar.');
    }
    console.log('PASSOU: Migration ignorou índice de outro schema e criou corretamente em public.');
  } finally {
    await sql`DROP SCHEMA IF EXISTS temp_audit_aux_schema CASCADE;`;
    console.log('Limpeza de schema auxiliar concluída.');
  }

  // Teste 5: Rejeição de Índice Não-UNIQUE
  console.log('\n[TESTE 5] Rejeição de Índice Não-UNIQUE...');
  try {
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
    await sql`
      CREATE INDEX uq_cvm_company_assets_single_active_approved
      ON public.cvm_company_assets (asset_id)
      WHERE status = 'APPROVED';
    `;
    let threw = false;
    try {
      await runMigration();
    } catch (e) {
      threw = true;
      console.log('Erro capturado conforme esperado:', e.message);
      if (!e.message.includes('nao e UNIQUE')) {
        throw new Error(`Mensagem inesperada: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Deveria ter falhado para índice não UNIQUE.');
    console.log('PASSOU: Rejeição de índice não UNIQUE.');
  } finally {
    await restoreCorrectIndex();
  }

  // Teste 6: Rejeição de Índice em Coluna Errada
  console.log('\n[TESTE 6] Rejeição de Índice em Coluna Errada (company_id em vez de asset_id)...');
  try {
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
    await sql`
      CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
      ON public.cvm_company_assets (company_id)
      WHERE status = 'APPROVED';
    `;
    let threw = false;
    try {
      await runMigration();
    } catch (e) {
      threw = true;
      console.log('Erro capturado conforme esperado:', e.message);
      if (!e.message.includes('esperava asset_id')) {
        throw new Error(`Mensagem inesperada: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Deveria ter falhado para índice em coluna errada.');
    console.log('PASSOU: Rejeição de índice em coluna errada.');
  } finally {
    await restoreCorrectIndex();
  }

  // Teste 7: Rejeição de Predicado com Condição Adicional (pg_depend / regex)
  console.log('\n[TESTE 7] Rejeição de Predicado com Condição Adicional...');
  try {
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
    await sql`
      CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
      ON public.cvm_company_assets (asset_id)
      WHERE status = 'APPROVED' AND share_class = 'ON';
    `;
    let threw = false;
    try {
      await runMigration();
    } catch (e) {
      threw = true;
      console.log('Erro capturado conforme esperado:', e.message);
      if (!e.message.includes('dependencias de colunas adicionais') && !e.message.includes('predicado do indice existente e divergente')) {
        throw new Error(`Mensagem inesperada: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Deveria ter falhado para predicado com condição adicional.');
    console.log('PASSOU: Rejeição de predicado com condição adicional.');
  } finally {
    await restoreCorrectIndex();
  }

  // Teste 8: Rejeição de Índice no Schema Public Associado a Outra Tabela
  console.log('\n[TESTE 8] Rejeição de Índice no Schema Public em Outra Tabela...');
  try {
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
    await sql`
      CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
      ON public.assets (id);
    `;
    let threw = false;
    try {
      await runMigration();
    } catch (e) {
      threw = true;
      console.log('Erro capturado conforme esperado:', e.message);
      if (!e.message.includes('associado a outra tabela')) {
        throw new Error(`Mensagem inesperada: ${e.message}`);
      }
    }
    if (!threw) throw new Error('Deveria ter falhado para índice em tabela errada.');
    console.log('PASSOU: Rejeição de índice em outra tabela.');
  } finally {
    await sql`DROP INDEX IF EXISTS public.uq_cvm_company_assets_single_active_approved;`;
    await restoreCorrectIndex();
  }

  console.log('\n=============================================');
  console.log('TODOS OS TESTES ESTRUTURAIS PASSARAM COM SUCESSO!');
  console.log('=============================================');
}

testSuite()
  .catch((err) => {
    console.error('FALHA NOS TESTES:', err);
    process.exit(1);
  })
  .finally(async () => {
    await restoreCorrectIndex();
    await sql.end();
  });
