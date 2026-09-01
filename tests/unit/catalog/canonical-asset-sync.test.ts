import { describe, it, expect } from 'vitest';
import {
  CanonicalAssetSyncService,
  computeBatchHash,
} from '@/modules/catalog/server/canonical-asset-sync.service';
import { parseCliArgs } from '../../../scripts/sync-canonical-catalog';
import type { RawCotahistCandidateInput } from '@/modules/catalog/domain/canonical-catalog.types';

describe('CanonicalAssetSyncService — Planejamento Determinístico em Memória', () => {
  const service = new CanonicalAssetSyncService();

  const candidates: RawCotahistCandidateInput[] = [
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
      ticker: 'VALE3',
      shortName: 'VALE',
      specification: 'ON NM',
      bdiCode: '02',
      marketType: 10,
      isin: 'BRVALEACNOR0',
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
      ticker: 'AMBIG11',
      shortName: 'FUNDO INDEFINIDO',
      specification: '',
      bdiCode: '02',
      marketType: 10,
      tradeDate: '2025-01-15',
    },
  ];

  it('deve calcular batchHash de forma determinística independente da ordem de entrada', () => {
    const hash1 = computeBatchHash(candidates);
    const reversed = [...candidates].reverse();
    const hash2 = computeBatchHash(reversed);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('deve gerar plano em memória identificando INSERTs, REJECTs e PENDING_REVIEW sem ativos existentes', () => {
    const plan = service.generateSyncPlan({
      workerId: '00000000-0000-0000-0000-000000000001',
      executionMode: 'DRY_RUN',
      candidates,
    });

    expect(plan.executionMode).toBe('DRY_RUN');
    expect(plan.metrics.totalCandidates).toBe(5);
    expect(plan.metrics.proposedInserts).toBe(2); // PETR4 e VALE3
    expect(plan.metrics.proposedRejections).toBe(2); // PETRA300 e VALE3F
    expect(plan.metrics.proposedConflicts).toBe(1); // AMBIG11
    expect(plan.metrics.proposedNoOps).toBe(0);

    const petr4 = plan.actions.find((a) => a.candidateTicker === 'PETR4');
    expect(petr4?.action).toBe('INSERT');
    expect(petr4?.newState?.isin).toBe('BRPETRACNPR6');

    const petra300 = plan.actions.find((a) => a.candidateTicker === 'PETRA300');
    expect(petra300?.action).toBe('REJECT');

    const ambig11 = plan.actions.find((a) => a.candidateTicker === 'AMBIG11');
    expect(ambig11?.action).toBe('PENDING_REVIEW');
  });

  it('deve identificar NO_OP quando o ativo existente no banco for idêntico ao candidato', () => {
    const plan = service.generateSyncPlan({
      workerId: '00000000-0000-0000-0000-000000000001',
      executionMode: 'DRY_RUN',
      candidates: [
        {
          ticker: 'PETR4',
          shortName: 'PETROBRAS',
          specification: 'PN N2',
          bdiCode: '02',
          marketType: 10,
          isin: 'BRPETRACNPR6',
          tradeDate: '2025-01-15',
        },
      ],
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
    });

    expect(plan.metrics.proposedNoOps).toBe(1);
    expect(plan.metrics.proposedInserts).toBe(0);
    expect(plan.metrics.proposedUpdates).toBe(0);
    expect(plan.actions[0].action).toBe('NO_OP');
  });

  it('deve identificar UPDATE quando o ativo existente possuir dados divergentes dos novos atributos', () => {
    const plan = service.generateSyncPlan({
      workerId: '00000000-0000-0000-0000-000000000001',
      executionMode: 'DRY_RUN',
      candidates: [
        {
          ticker: 'PETR4',
          shortName: 'PETROBRAS',
          specification: 'PN N2',
          bdiCode: '02',
          marketType: 10,
          isin: 'BRPETRACNPR6',
          tradeDate: '2025-01-15',
        },
      ],
      existingAssets: [
        {
          id: 'b948003d-f1ed-4e33-abf6-8d780517fc88',
          ticker: 'PETR4',
          name: 'Petrobras PN',
          assetType: 'stock',
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
          isVisibleCatalog: false, // divergente
          isTradeable: true,
          status: 'active',
          isin: null, // divergente
          provenance: 'b3_cotahist',
          lastSyncRunId: null,
        },
      ],
    });

    expect(plan.metrics.proposedUpdates).toBe(1);
    expect(plan.metrics.proposedNoOps).toBe(0);
    expect(plan.actions[0].action).toBe('UPDATE');
    expect(plan.actions[0].oldState?.isin).toBeNull();
    expect(plan.actions[0].newState?.isin).toBe('BRPETRACNPR6');
  });

  it('deve parsear argumentos da CLI adequadamente', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'DRY_RUN', isHelp: false });
    expect(parseCliArgs(['--mode=DRY_RUN'])).toEqual({ mode: 'DRY_RUN', isHelp: false });
    expect(parseCliArgs(['--mode=APPLY'])).toEqual({ mode: 'APPLY', isHelp: false });
    expect(parseCliArgs(['--help'])).toEqual({ mode: 'DRY_RUN', isHelp: true });
  });
});
