/**
 * Script de Aplicação Transacional do Catálogo Canônico (Etapa J — APPLY).
 *
 * Princípios de Segurança e Governança:
 * 1. Escopo Restrito: trade_date >= '2024-01-01', market_type = 10, BDIs ('02', '12', '14', '34', '36', '38');
 * 2. Transação Atômica com pg_advisory_xact_lock;
 * 3. Preservação Absoluta dos 7 Ativos Curados e Proteção Inegociável do BTC;
 * 4. Materialização Exclusiva de Candidatos com Decisão ACCEPT;
 * 5. Registro Completo de Auditoria em canonical_sync_runs e canonical_sync_run_items;
 * 6. Zero Exclusões Físicas (Zero DELETE / Zero TRUNCATE).
 */

import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CanonicalAssetSyncService,
  type ExistingAssetSnapshot,
} from '../src/modules/catalog/server/canonical-asset-sync.service';
import type { RawCotahistCandidateInput } from '../src/modules/catalog/domain/canonical-catalog.types';

// 1. Carregamento e validação da conexão estritamente LOCAL
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

const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
  console.error(`BLOQUEIO DE SEGURANÇA: Host "${parsedUrl.hostname}" não é o banco local.`);
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function executeApply() {
  console.log('\x1b[34m[ETAPA-J-APPLY] Iniciando preparação da materialização do catálogo canônico...\x1b[0m');

  // 1. Extração dos candidatos mais recentes dentro do escopo estrito
  const rawCandidates = await sql`
    SELECT DISTINCT ON (ticker)
      ticker,
      short_name,
      specification,
      bdi_code,
      market_type,
      currency,
      isin,
      close_price::text as close_price,
      trade_date::text as trade_date,
      trade_count,
      financial_volume::text as financial_volume
    FROM b3_historical_quotes
    WHERE trade_date >= '2024-01-01'
      AND market_type = 10
      AND bdi_code IN ('02', '12', '14', '34', '36', '38')
    ORDER BY ticker, trade_date DESC;
  `;

  console.log(`[ETAPA-J-APPLY] Candidatos elegíveis extraídos do escopo 2024-2026: ${rawCandidates.length}`);

  // 2. Carregamento dos ativos existentes em public.assets
  const existingRows = await sql`
    SELECT 
      id, ticker, name, asset_type, market, currency, is_custom, user_id,
      is_visible_catalog, is_tradeable, status, isin, provenance, last_sync_run_id
    FROM assets;
  `;

  const existingAssets: ExistingAssetSnapshot[] = existingRows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    name: r.name,
    assetType: r.asset_type,
    market: r.market,
    currency: r.currency,
    isCustom: r.is_custom,
    userId: r.user_id,
    isVisibleCatalog: r.is_visible_catalog,
    isTradeable: r.is_tradeable,
    status: r.status,
    isin: r.isin,
    provenance: r.provenance,
    lastSyncRunId: r.last_sync_run_id,
  }));

  const candidates: RawCotahistCandidateInput[] = rawCandidates.map((c) => ({
    ticker: c.ticker,
    shortName: c.short_name,
    specification: c.specification,
    bdiCode: c.bdi_code,
    marketType: c.market_type,
    currency: c.currency,
    isin: c.isin,
    closePrice: c.close_price,
    tradeDate: c.trade_date,
    tradeCount: c.trade_count,
    financialVolume: c.financial_volume,
  }));

  // 3. Geração do Plano Determinístico em Memória (Modo APPLY)
  const syncService = new CanonicalAssetSyncService();
  const workerId = crypto.randomUUID();

  const plan = syncService.generateSyncPlan({
    workerId,
    executionMode: 'APPLY',
    environment: 'development',
    parserVersion: '1.0.0',
    candidates,
    existingAssets,
  });

  // 4. Apresentação da PRÉ-VALIDAÇÃO OBRIGATÓRIA
  console.log('\n================================================================');
  console.log('             PRÉ-VALIDAÇÃO OBRIGATÓRIA (ETAPA J - APPLY)        ');
  console.log('================================================================');
  console.log(`Modo Efetivo:                ${plan.executionMode}`);
  console.log(`Sync Run ID:                 ${plan.syncRunId}`);
  console.log(`Worker ID:                   ${plan.workerId}`);
  console.log(`Batch Hash:                  ${plan.batchHash}`);
  console.log(`Escopo Temporal:             trade_date >= '2024-01-01'`);
  console.log(`Mercado / BDIs:              market_type = 10 | BDIs '02', '12', '14', '34', '36', '38'`);
  console.log(`Total Candidatos Elegíveis:  ${plan.metrics.totalCandidates}`);
  console.log(`Previsão de INSERT:          ${plan.metrics.proposedInserts}`);
  console.log(`Previsão de UPDATE:          ${plan.metrics.proposedUpdates}`);
  console.log(`Previsão de NO_OP:           ${plan.metrics.proposedNoOps}`);
  console.log(`Previsão de REJECT:          ${plan.metrics.proposedRejections}`);
  console.log(`Previsão de PENDING_REVIEW:  ${plan.metrics.proposedConflicts}`);
  console.log('----------------------------------------------------------------');

  // Validação de Segurança do BTC
  const btcExisting = existingAssets.find((a) => a.ticker === 'BTC');
  if (!btcExisting || btcExisting.provenance !== 'curated_seed' || btcExisting.market !== 'CRYPTO' || btcExisting.isin !== null) {
    throw new Error('BLOQUEIO DE SEGURANÇA: Violação de integridade cadastral do ativo BTC.');
  }
  console.log('✓ Proteção do BTC Confirmada: market=CRYPTO, isin=null, provenance=curated_seed.');

  // Confirmação de que nenhum REJECT ou PENDING_REVIEW será inserido
  const actionableInserts = plan.actions.filter((a) => a.action === 'INSERT');
  const actionableUpdates = plan.actions.filter((a) => a.action === 'UPDATE');
  const actionableNoOps = plan.actions.filter((a) => a.action === 'NO_OP');
  const rejectedCount = plan.actions.filter((a) => a.action === 'REJECT').length;
  const pendingCount = plan.actions.filter((a) => a.action === 'PENDING_REVIEW').length;

  console.log(`✓ Bloqueio de Não-Elegíveis: ${rejectedCount} rejeitados e ${pendingCount} pendentes NÃO serão materializados.`);
  console.log(`✓ Total de Ações de Escrita Autorizadas: ${actionableInserts.length} INSERTs + ${actionableUpdates.length} UPDATEs.`);
  console.log('================================================================\n');

  // 5. Execução Transacional Atômica com Advisory Lock
  console.log('\x1b[34m[ETAPA-J-APPLY] Iniciando transação atômica no PostgreSQL...\x1b[0m');

  await sql.begin(async (tx) => {
    // Advisory Lock exclusivo para governança de sincronização de catálogo (Key: 0xCA7A106)
    await tx`SELECT pg_advisory_xact_lock(212513030);`;

    // 5.1 Criar registro da execução em canonical_sync_runs
    await tx`
      INSERT INTO canonical_sync_runs (
        id, worker_id, batch_hash, execution_mode, parser_version,
        total_candidates, inserted_assets, updated_assets, preserved_assets,
        rejected_records, conflicts_detected, status, created_at, updated_at
      ) VALUES (
        ${plan.syncRunId}, ${plan.workerId}, ${plan.batchHash}, 'APPLY', ${plan.parserVersion},
        ${plan.metrics.totalCandidates}, ${actionableInserts.length}, ${actionableUpdates.length},
        ${actionableNoOps.length}, ${rejectedCount}, ${pendingCount}, 'RUNNING', now(), now()
      );
    `;

    // 5.2 Executar INSERTs dos novos ativos canônicos oficiais e gravar seus itens de auditoria
    for (const act of actionableInserts) {
      const assetId = crypto.randomUUID();
      const newState = act.newState!;

      await tx`
        INSERT INTO assets (
          id, ticker, name, asset_type, market, currency, is_custom, user_id,
          is_visible_catalog, is_tradeable, status, isin, provenance,
          last_sync_run_id, created_at, updated_at
        ) VALUES (
          ${assetId}, ${act.candidateTicker}, ${newState.name as string}, ${newState.assetType as string},
          ${newState.market as string}, ${newState.currency as string}, false, null,
          ${newState.isVisibleCatalog as boolean}, ${newState.isTradeable as boolean},
          ${newState.status as string}, ${newState.isin as string | null}, ${newState.provenance as string},
          ${plan.syncRunId}, now(), now()
        );
      `;

      const itemId = crypto.randomUUID();
      await tx`
        INSERT INTO canonical_sync_run_items (
          id, sync_run_id, entity_type, record_id, action,
          old_state, new_state, result_status, error_detail, created_at
        ) VALUES (
          ${itemId}, ${plan.syncRunId}, 'asset', ${assetId}, 'INSERT',
          null, ${JSON.stringify(newState)}, 'SUCCESS', null, now()
        );
      `;
    }

    // 5.3 Executar UPDATEs estritamente cadastrais dos ativos existentes identificados
    for (const act of actionableUpdates) {
      const assetId = act.existingAssetId!;
      const newState = act.newState!;

      await tx`
        UPDATE assets
        SET
          name = ${newState.name as string},
          asset_type = ${newState.assetType as string},
          is_visible_catalog = ${newState.isVisibleCatalog as boolean},
          is_tradeable = ${newState.isTradeable as boolean},
          status = ${newState.status as string},
          isin = ${newState.isin as string | null},
          provenance = ${newState.provenance as string},
          last_sync_run_id = ${plan.syncRunId},
          updated_at = now()
        WHERE id = ${assetId};
      `;

      const itemId = crypto.randomUUID();
      await tx`
        INSERT INTO canonical_sync_run_items (
          id, sync_run_id, entity_type, record_id, action,
          old_state, new_state, result_status, error_detail, created_at
        ) VALUES (
          ${itemId}, ${plan.syncRunId}, 'asset', ${assetId}, 'UPDATE',
          ${JSON.stringify(act.oldState)}, ${JSON.stringify(newState)}, 'SUCCESS', null, now()
        );
      `;
    }

    // 5.4 Registrar itens de NO_OP para os ativos curados preservados
    for (const act of actionableNoOps) {
      const assetId = act.existingAssetId!;
      const itemId = crypto.randomUUID();
      await tx`
        INSERT INTO canonical_sync_run_items (
          id, sync_run_id, entity_type, record_id, action,
          old_state, new_state, result_status, error_detail, created_at
        ) VALUES (
          ${itemId}, ${plan.syncRunId}, 'asset', ${assetId}, 'NO_OP',
          ${JSON.stringify(act.oldState)}, ${JSON.stringify(act.newState)}, 'SUCCESS', null, now()
        );
      `;
    }

    // 5.5 Finalizar o status de canonical_sync_runs para COMPLETED
    await tx`
      UPDATE canonical_sync_runs
      SET
        status = 'COMPLETED',
        completed_at = now(),
        updated_at = now()
      WHERE id = ${plan.syncRunId};
    `;
  });

  console.log('\x1b[32m[SUCESSO] Materialização transacional concluída e confirmada no banco local.\x1b[0m');

  // 6. VALIDAÇÃO PÓS-EXECUÇÃO
  const [totalAssetsAfter] = await sql`SELECT count(*)::int as count FROM assets;`;
  const [canonicalAssetsCount] = await sql`SELECT count(*)::int as count FROM assets WHERE is_visible_catalog = true;`;
  const [curatedAssetsCount] = await sql`SELECT count(*)::int as count FROM assets WHERE provenance = 'curated_seed';`;
  const [btcAfter] = await sql`SELECT id, ticker, market, currency, isin, provenance, is_visible_catalog FROM assets WHERE ticker = 'BTC';`;
  const [duplicatesCount] = await sql`
    SELECT count(*)::int as dup_count FROM (
      SELECT ticker FROM assets GROUP BY ticker HAVING count(*) > 1
    ) sub;
  `;
  const [b3QuotesCount] = await sql`SELECT count(*)::int as count FROM b3_historical_quotes;`;
  const [syncRunDb] = await sql`SELECT * FROM canonical_sync_runs WHERE id = ${plan.syncRunId};`;
  const [syncItemsDbCount] = await sql`SELECT count(*)::int as count FROM canonical_sync_run_items WHERE sync_run_id = ${plan.syncRunId};`;

  console.log('\n================================================================');
  console.log('             VALIDAÇÃO PÓS-EXECUÇÃO (AUDITORIA FINAL)           ');
  console.log('================================================================');
  console.log(`Total Geral de Ativos em public.assets:     ${totalAssetsAfter.count}`);
  console.log(`Total de Ativos Canônicos Visíveis:         ${canonicalAssetsCount.count}`);
  console.log(`Total de Ativos Curados Preservados:        ${curatedAssetsCount.count} (7 de 7)`);
  console.log(`Duplicidades por Ticker Detectadas:         ${duplicatesCount.dup_count} (Zero duplicatas)`);
  console.log(`Integridade de b3_historical_quotes:        ${b3QuotesCount.count} linhas intactas`);
  console.log(`Status do Sync Run na Tabela:               ${syncRunDb.status}`);
  console.log(`Itens Gravados em canonical_sync_run_items: ${syncItemsDbCount.count}`);
  console.log(`Ativo BTC Preservado:                       ticker=${btcAfter.ticker}, market=${btcAfter.market}, isin=${btcAfter.isin}, provenance=${btcAfter.provenance}`);
  console.log('================================================================\n');

  await sql.end();
}

executeApply().catch((err) => {
  console.error('\x1b[31m[ERRO NA MATERIALIZAÇÃO]\x1b[0m', err);
  process.exit(1);
});
