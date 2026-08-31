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

async function testConcurrentLock() {
  const sql1 = postgres(dbUrlTest, { max: 1 });
  const sql2 = postgres(dbUrlTest, { max: 1 });

  try {
    console.log('=== TESTANDO CONCORRÊNCIA REAL COM 2 CONEXÕES POSTGRESQL ===\n');

    // 1. Cria ativo e vínculos temporários
    const assetId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const suffix = Math.floor(Math.random() * 8999 + 1000);
    const cnpj = `1234567800${suffix}`;
    const ticker = `CC${suffix}`;

    await sql1`
      INSERT INTO assets (id, ticker, name, asset_type, currency, created_at, updated_at)
      VALUES (${assetId}, ${ticker}, 'Concorrencia S.A.', 'Ações', 'BRL', now(), now());
    `;

    await sql1`
      INSERT INTO cvm_companies (id, cnpj, cvm_code, legal_name, status, created_at, updated_at)
      VALUES (${companyId}, ${cnpj}, '099999', 'Concorrencia S.A.', 'ATIVO', now(), now());
    `;

    await sql1`
      INSERT INTO cvm_company_assets (id, company_id, asset_id, status, source, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${companyId}, ${assetId}, 'APPROVED', 'MANUAL', now(), now());
    `;

    // Função de publicação simulando o serviço com advisory xact lock
    async function publishSim(sqlClient, workerName) {
      return await sqlClient.begin(async (tx) => {
        const lockKey = `cvm_fund:${assetId}:2024-FY:annual:CONSOLIDATED:cvm:1`;
        console.log(`[${workerName}] Aguardando advisory lock: ${lockKey}`);
        await tx`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        console.log(`[${workerName}] Advisory lock obtido!`);

        // Consulta se já existe
        const existing = await tx`
          SELECT id, net_revenue, net_income, total_equity, total_assets
          FROM asset_fundamentals
          WHERE asset_id = ${assetId}
            AND reference_period = '2024-FY'
            AND period_type = 'annual'
            AND statement_type = 'CONSOLIDATED'
            AND source = 'cvm'
            AND version = 1;
        `;

        if (existing.length > 0) {
          console.log(`[${workerName}] Registro já existe (id=${existing[0].id}). Retornando NO_OP.`);
          return { action: 'NO_OP', id: existing[0].id };
        }

        console.log(`[${workerName}] Registro não existe. Inserindo...`);
        const recId = crypto.randomUUID();
        await tx`
          INSERT INTO asset_fundamentals (
            id, asset_id, reference_period, period_type, statement_type,
            reference_date, source, source_reference, version, is_restated,
            currency, net_revenue, net_income, total_equity, total_assets,
            created_at, updated_at
          ) VALUES (
            ${recId}, ${assetId}, '2024-FY', 'annual', 'CONSOLIDATED',
            '2024-12-31'::date, 'cvm', '{"test":true}', 1, false,
            'BRL', 1000000.0000, 200000.0000, 500000.0000, 1500000.0000,
            now(), now()
          );
        `;

        await tx`
          INSERT INTO audit_logs (
            id, table_name, record_id, action, actor_id, actor_type,
            new_value, reason, source, created_at
          ) VALUES (
            ${crypto.randomUUID()}, 'asset_fundamentals', ${recId},
            'CVM_FUNDAMENTALS_PUBLISHED', 'test_worker', 'system',
            '{"version":1}', 'Publicação concorrente teste', 'cvm_dfp', now()
          );
        `;

        console.log(`[${workerName}] Inserção concluída.`);
        return { action: 'INSERTED', id: recId };
      });
    }

    // Executa ambas em paralelo
    const [res1, res2] = await Promise.all([
      publishSim(sql1, 'Conexão-1'),
      publishSim(sql2, 'Conexão-2'),
    ]);

    console.log('\nResultados dos workers:');
    console.log('Worker 1:', res1);
    console.log('Worker 2:', res2);

    // Consulta física
    const fundamentals = await sql1`
      SELECT id, asset_id, reference_period, version, net_revenue, net_income
      FROM asset_fundamentals
      WHERE asset_id = ${assetId};
    `;
    console.log('\nLinhas em asset_fundamentals:', fundamentals.length);
    console.table(fundamentals);

    const audits = await sql1`
      SELECT id, table_name, record_id, action, actor_id, reason
      FROM audit_logs
      WHERE record_id = ${fundamentals[0].id};
    `;
    console.log('\nLinhas em audit_logs para o registro:', audits.length);
    console.table(audits);

    // Limpeza
    await sql1`DELETE FROM audit_logs WHERE record_id = ${fundamentals[0].id};`;
    await sql1`DELETE FROM asset_fundamentals WHERE asset_id = ${assetId};`;
    await sql1`DELETE FROM cvm_company_assets WHERE company_id = ${companyId};`;
    await sql1`DELETE FROM cvm_companies WHERE id = ${companyId};`;
    await sql1`DELETE FROM assets WHERE id = ${assetId};`;

    console.log('\nLimpeza concluída com sucesso.');

  } finally {
    await sql1.end();
    await sql2.end();
  }
}

testConcurrentLock().catch(console.error);
