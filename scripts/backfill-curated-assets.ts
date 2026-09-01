import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 1. Carregamento estrito da DATABASE_URL local
const envPath = path.resolve(process.cwd(), '.env');
let databaseUrl = process.env.DATABASE_URL;
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      databaseUrl = trimmed.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
}

if (!databaseUrl) {
  console.error('DATABASE_URL não configurada.');
  process.exit(1);
}

// Garante que a conexão é com o banco local
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
  console.error(`BLOQUEIO DE SEGURANÇA: Host "${parsedUrl.hostname}" não é o banco local.`);
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

interface CuratedTarget {
  ticker: string;
  expectedMarket: string;
  isin: string | null;
  provenance: 'curated_seed';
  isVisibleCatalog: boolean;
  isTradeable: boolean;
  status: 'active';
}

const TARGET_ASSETS: CuratedTarget[] = [
  {
    ticker: 'PETR4',
    expectedMarket: 'B3',
    isin: 'BRPETRACNPR6',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'VALE3',
    expectedMarket: 'B3',
    isin: 'BRVALEACNOR0',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'ITUB4',
    expectedMarket: 'B3',
    isin: 'BRITUBACNPR1',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'BBDC4',
    expectedMarket: 'B3',
    isin: 'BRBBDCACNPR8',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'KNIP11',
    expectedMarket: 'B3',
    isin: 'BRKNIPCTF001',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'IVVB11',
    expectedMarket: 'B3',
    isin: 'BRIVVBCTF001',
    provenance: 'curated_seed',
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
  {
    ticker: 'BTC',
    expectedMarket: 'CRYPTO',
    isin: null, // BTC não possui ISIN B3
    provenance: 'curated_seed', // Não recebe b3_cotahist
    isVisibleCatalog: true,
    isTradeable: true,
    status: 'active',
  },
];

async function executeBackfill() {
  console.log('[BACKFILL-ETAPA-F] Iniciando validação pré-execução no banco local...');

  const workerId = crypto.randomUUID();
  const syncRunId = crypto.randomUUID();
  const batchHash = crypto.createHash('sha256').update('curated_seed_7_assets_v1').digest('hex');

  const result = await sql.begin(async (tx) => {
    // 1. Lock transacional exclusivo para evitar concorrência
    await tx`SELECT pg_advisory_xact_lock(hashtext('canonical_backfill_runner'))`;

    // 2. Localizar individualmente cada um dos 7 ativos curados (is_custom = false AND user_id IS NULL)
    const verifiedTargets: Array<{
      target: CuratedTarget;
      currentAsset: {
        id: string;
        ticker: string;
        name: string;
        market: string;
        is_visible_catalog: boolean | null;
        is_tradeable: boolean | null;
        status: string | null;
        isin: string | null;
        provenance: string | null;
        last_sync_run_id: string | null;
      };
    }> = [];

    for (const target of TARGET_ASSETS) {
      const rows = await tx`
        SELECT id, ticker, name, market, is_visible_catalog, is_tradeable, status, isin, provenance, last_sync_run_id
        FROM assets
        WHERE ticker = ${target.ticker}
          AND market = ${target.expectedMarket}
          AND is_custom = false
          AND user_id IS NULL;
      `;

      if (rows.length !== 1) {
        throw new Error(
          `BLOQUEIO DE SEGURANÇA: Esperado exatamente 1 ativo curado para ticker "${target.ticker}" (${target.expectedMarket}), encontrado ${rows.length}.`
        );
      }

      verifiedTargets.push({
        target,
        currentAsset: rows[0] as unknown as {
          id: string;
          ticker: string;
          name: string;
          market: string;
          is_visible_catalog: boolean | null;
          is_tradeable: boolean | null;
          status: string | null;
          isin: string | null;
          provenance: string | null;
          last_sync_run_id: string | null;
        },
      });
    }

    console.log(`[BACKFILL-ETAPA-F] 7 ativos curados verificados com sucesso por UUID físico.`);

    // 3. Registrar a execução em canonical_sync_runs
    await tx`
      INSERT INTO canonical_sync_runs (
        id, worker_id, environment, execution_mode, parser_version, batch_hash, status,
        total_candidates, inserted_assets, updated_assets, preserved_assets,
        linked_quotes, conflicts_detected, rejected_records, started_at, completed_at
      ) VALUES (
        ${syncRunId}, ${workerId}, 'development', 'APPLY', '1.0.0', ${batchHash}, 'RUNNING',
        7, 0, 7, 0, 0, 0, 0, now(), null
      );
    `;

    // 4. Executar a mutação individual para cada ativo e registrar log em canonical_sync_run_items
    for (const { target, currentAsset } of verifiedTargets) {
      const oldState = {
        isVisibleCatalog: currentAsset.is_visible_catalog,
        isTradeable: currentAsset.is_tradeable,
        status: currentAsset.status,
        isin: currentAsset.isin,
        provenance: currentAsset.provenance,
        lastSyncRunId: currentAsset.last_sync_run_id,
      };

      const newState = {
        isVisibleCatalog: target.isVisibleCatalog,
        isTradeable: target.isTradeable,
        status: target.status,
        isin: target.isin,
        provenance: target.provenance,
        lastSyncRunId: syncRunId,
      };

      // Atualiza o ativo exclusivamente pelo seu UUID físico
      await tx`
        UPDATE assets
        SET 
          is_visible_catalog = ${target.isVisibleCatalog},
          is_tradeable = ${target.isTradeable},
          status = ${target.status},
          isin = ${target.isin},
          provenance = ${target.provenance},
          last_sync_run_id = ${syncRunId},
          updated_at = now()
        WHERE id = ${currentAsset.id};
      `;

      // Registra o item atômico com old_state e new_state
      const itemId = crypto.randomUUID();
      await tx`
        INSERT INTO canonical_sync_run_items (
          id, sync_run_id, entity_type, record_id, action,
          old_state, new_state, result_status, error_detail, created_at
        ) VALUES (
          ${itemId}, ${syncRunId}, 'asset', ${currentAsset.id}, 'UPDATE',
          ${JSON.stringify(oldState)}, ${JSON.stringify(newState)}, 'SUCCESS', null, now()
        );
      `;
    }

    // 5. Finalizar o status da execução para COMPLETED
    await tx`
      UPDATE canonical_sync_runs
      SET 
        status = 'COMPLETED',
        completed_at = now(),
        updated_at = now()
      WHERE id = ${syncRunId};
    `;

    return {
      syncRunId,
      workerId,
      verifiedTargets,
    };
  });

  console.log(`\x1b[32m[SUCESSO] Backfill dos 7 ativos curados concluído com sucesso na transação.\x1b[0m`);
  console.log(`Sync Run ID: ${result.syncRunId}`);

  await sql.end();
}

executeBackfill().catch((err) => {
  console.error(`\x1b[31m[ERRO NO BACKFILL]\x1b[0m`, err);
  process.exit(1);
});
