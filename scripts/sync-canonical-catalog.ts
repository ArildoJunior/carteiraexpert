/**
 * CLI de Orquestração do Sincronizador do Catálogo Canônico de Ativos (ADR-011).
 *
 * Modo de Operação (Etapa G):
 * - Validação e execução estritamente em memória (sem conexão com banco de dados);
 * - Valida argumentos da linha de comando;
 * - Suporta emissão estruturada do plano de sincronização (DRY_RUN);
 * - Bloqueia qualquer tentativa de mutação ou conexão de rede nesta etapa.
 */

import crypto from 'node:crypto';
import {
  CanonicalAssetSyncService,
  type GenerateSyncPlanParams,
} from '../src/modules/catalog/server/canonical-asset-sync.service';
import type { RawCotahistCandidateInput } from '../src/modules/catalog/domain/canonical-catalog.types';

// Amostra controlada de candidatos para validação pura em memória
const SAMPLE_CANDIDATES: RawCotahistCandidateInput[] = [
  {
    ticker: 'PETR4',
    shortName: 'PETROBRAS',
    specification: 'PN N2',
    bdiCode: '02',
    marketType: 10,
    isin: 'BRPETRACNPR6',
    tradeDate: '2025-01-15',
  },
  {
    ticker: 'PETRA300',
    shortName: 'PETROBRAS',
    specification: 'ON OPC',
    bdiCode: '96',
    marketType: 70,
    tradeDate: '2025-01-15',
  },
  {
    ticker: 'VALE3F',
    shortName: 'VALE',
    specification: 'ON NM',
    bdiCode: '02',
    marketType: 20,
    tradeDate: '2025-01-15',
  },
  {
    ticker: 'WEGE3',
    shortName: 'WEG',
    specification: 'ON NM',
    bdiCode: '02',
    marketType: 10,
    isin: 'BRWEGEACNOR0',
    tradeDate: '2025-01-15',
  },
  {
    ticker: 'AMBIG11',
    shortName: 'FUNDO AMBIGUO',
    specification: '',
    bdiCode: '02',
    marketType: 10,
    tradeDate: '2025-01-15',
  },
];

function printHelp() {
  console.log(`
Uso: pnpm tsx scripts/sync-canonical-catalog.ts [opções]

Opções:
  --mode=DRY_RUN        Executa o planejamento em memória sem mutações (padrão)
  --mode=APPLY          Modo de aplicação (BLOQUEADO nesta etapa)
  --help                Exibe esta mensagem de ajuda

Exemplo:
  pnpm tsx scripts/sync-canonical-catalog.ts --mode=DRY_RUN
`);
}

export function parseCliArgs(args: string[]): { mode: 'DRY_RUN' | 'APPLY'; isHelp: boolean } {
  let mode: 'DRY_RUN' | 'APPLY' = 'DRY_RUN';
  let isHelp = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else if (arg === '--mode=DRY_RUN') {
      mode = 'DRY_RUN';
    } else if (arg === '--mode=APPLY') {
      mode = 'APPLY';
    }
  }

  return { mode, isHelp };
}

export async function main() {
  const rawArgs = process.argv.slice(2);
  const { mode, isHelp } = parseCliArgs(rawArgs);

  if (isHelp) {
    printHelp();
    process.exit(0);
  }

  if (mode === 'APPLY') {
    console.error(
      '\x1b[31m[BLOQUEIO DE SEGURANÇA] O modo APPLY está estritamente desabilitado nesta etapa.\x1b[0m'
    );
    console.error('Apenas o planejamento em memória (--mode=DRY_RUN) é permitido.');
    process.exit(1);
  }

  console.log('\x1b[34m[CANONICAL-SYNC-CLI] Iniciando geração de plano em memória (DRY_RUN)...\x1b[0m');

  const syncService = new CanonicalAssetSyncService();
  const workerId = crypto.randomUUID();

  const planParams: GenerateSyncPlanParams = {
    workerId,
    executionMode: 'DRY_RUN',
    environment: 'development',
    parserVersion: '1.0.0',
    candidates: SAMPLE_CANDIDATES,
    existingAssets: [
      {
        id: 'b948003d-f1ed-4e33-abf6-8d780517fc88',
        ticker: 'PETR4',
        name: 'PETROBRAS - PN N2',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
        isVisibleCatalog: true,
        isTradeable: true,
        status: 'active',
        isin: 'BRPETRACNPR6',
        provenance: 'curated_seed',
        lastSyncRunId: null,
      },
    ],
  };

  const plan = syncService.generateSyncPlan(planParams);

  console.log('\n================================================================');
  console.log('                 RELATÓRIO DO PLANO DE SINCRONIZAÇÃO            ');
  console.log('================================================================');
  console.log(`Sync Run ID:     ${plan.syncRunId}`);
  console.log(`Worker ID:       ${plan.workerId}`);
  console.log(`Modo:            ${plan.executionMode}`);
  console.log(`Batch Hash:      ${plan.batchHash}`);
  console.log(`Criado em:       ${plan.createdAt}`);
  console.log('----------------------------------------------------------------');
  console.log('MÉTRICAS DO PLANO:');
  console.log(`  Total Candidatos:      ${plan.metrics.totalCandidates}`);
  console.log(`  Propostas de Inserção: ${plan.metrics.proposedInserts}`);
  console.log(`  Propostas de Update:   ${plan.metrics.proposedUpdates}`);
  console.log(`  Sem Alteração (NO_OP): ${plan.metrics.proposedNoOps}`);
  console.log(`  Rejeitados Formais:    ${plan.metrics.proposedRejections}`);
  console.log(`  Conflitos / Revisão:   ${plan.metrics.proposedConflicts}`);
  console.log('----------------------------------------------------------------');
  console.log('DETALHAMENTO DAS AÇÕES PLANEJADAS:');
  for (const act of plan.actions) {
    const statusColor =
      act.action === 'NO_OP'
        ? '\x1b[36m'
        : act.action === 'INSERT'
        ? '\x1b[32m'
        : act.action === 'UPDATE'
        ? '\x1b[33m'
        : act.action === 'REJECT'
        ? '\x1b[31m'
        : '\x1b[35m';

    console.log(
      `  [${act.candidateTicker.padEnd(8)}] ${statusColor}${act.action.padEnd(14)}\x1b[0m — ${act.justification}`
    );
  }
  console.log('================================================================\n');

  console.log('\x1b[32m[SUCESSO] Plano determinístico gerado em memória sem efeitos colaterais.\x1b[0m');
}

// Executa apenas se chamado diretamente via CLI
if (process.argv[1]?.endsWith('sync-canonical-catalog.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
