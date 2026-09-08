import { describe, it, expect } from 'vitest';
import { CanonicalAssetSyncService } from '@/modules/catalog/server/canonical-asset-sync.service';
import { classifyCanonicalCandidate } from '@/modules/catalog/domain/canonical-classifier';
import { searchAssetsSchema } from '@/modules/portfolio/domain/asset.schema';

describe('Ciclo de Vida de Ativos Delisted, Inatividade e Filtros de Negociabilidade', () => {
  const syncService = new CanonicalAssetSyncService();

  describe('1. Inatividade Dinâmica de 1 Ano no Sincronizador Canônico', () => {
    it('deve marcar candidato com mais de 1 ano sem negociação automaticamente como delisted e isTradeable: false', () => {
      const plan = syncService.generateSyncPlan({
        workerId: '00000000-0000-0000-0000-000000000001',
        executionMode: 'DRY_RUN',
        referenceDate: '2026-09-08',
        candidates: [
          {
            ticker: 'INAT3',
            shortName: 'INATIVO S.A.',
            specification: 'ON',
            bdiCode: '02',
            marketType: 10,
            tradeDate: '2025-05-10', // Mais de 1 ano antes de 2026-09-08 (data de corte: 2025-09-08)
          },
        ],
      });

      expect(plan.metrics.proposedInserts).toBe(1);
      const action = plan.actions[0];
      expect(action.action).toBe('INSERT');
      expect(action.newState?.status).toBe('delisted');
      expect(action.newState?.isTradeable).toBe(false);
      expect(action.newState?.isVisibleCatalog).toBe(true);
    });

    it('deve marcar candidato com negociação recente (< 1 ano) como active e isTradeable: true', () => {
      const plan = syncService.generateSyncPlan({
        workerId: '00000000-0000-0000-0000-000000000001',
        executionMode: 'DRY_RUN',
        referenceDate: '2026-09-08',
        candidates: [
          {
            ticker: 'ATIV3',
            shortName: 'ATIVO S.A.',
            specification: 'ON',
            bdiCode: '02',
            marketType: 10,
            tradeDate: '2026-08-15', // Negociação recente
          },
        ],
      });

      expect(plan.metrics.proposedInserts).toBe(1);
      const action = plan.actions[0];
      expect(action.action).toBe('INSERT');
      expect(action.newState?.status).toBe('active');
      expect(action.newState?.isTradeable).toBe(true);
      expect(action.newState?.isVisibleCatalog).toBe(true);
    });

    it('deve reativar automaticamente (UPDATE) ativo que estava delisted quando a B3 republica nova cotação recente', () => {
      const plan = syncService.generateSyncPlan({
        workerId: '00000000-0000-0000-0000-000000000001',
        executionMode: 'DRY_RUN',
        referenceDate: '2026-09-08',
        candidates: [
          {
            ticker: 'REATIV3',
            shortName: 'REATIVADO S.A.',
            specification: 'ON',
            bdiCode: '02',
            marketType: 10,
            tradeDate: '2026-09-04', // Nova cotação recente publicada pela B3
          },
        ],
        existingAssets: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            ticker: 'REATIV3',
            name: 'REATIVADO S.A. - ON',
            assetType: 'stock',
            market: 'B3',
            currency: 'BRL',
            isCustom: false,
            userId: null,
            isVisibleCatalog: true,
            isTradeable: false,
            status: 'delisted', // Anteriormente deslistado/inativo
            isin: null,
            provenance: 'b3_cotahist',
            lastSyncRunId: null,
          },
        ],
      });

      expect(plan.metrics.proposedUpdates).toBe(1);
      const action = plan.actions[0];
      expect(action.action).toBe('UPDATE');
      expect(action.oldState?.status).toBe('delisted');
      expect(action.oldState?.isTradeable).toBe(false);
      expect(action.newState?.status).toBe('active');
      expect(action.newState?.isTradeable).toBe(true);
    });

    it('deve transicionar ativo existente para delisted caso passe mais de 1 ano sem nova cotação', () => {
      const plan = syncService.generateSyncPlan({
        workerId: '00000000-0000-0000-0000-000000000001',
        executionMode: 'DRY_RUN',
        referenceDate: '2026-09-08',
        candidates: [
          {
            ticker: 'VELHO3',
            shortName: 'VELHO S.A.',
            specification: 'ON',
            bdiCode: '02',
            marketType: 10,
            tradeDate: '2024-10-01', // Cotação antiga (> 1 ano)
          },
        ],
        existingAssets: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            ticker: 'VELHO3',
            name: 'VELHO S.A. - ON',
            assetType: 'stock',
            market: 'B3',
            currency: 'BRL',
            isCustom: false,
            userId: null,
            isVisibleCatalog: true,
            isTradeable: true,
            status: 'active', // Anteriormente ativo
            isin: null,
            provenance: 'b3_cotahist',
            lastSyncRunId: null,
          },
        ],
      });

      expect(plan.metrics.proposedUpdates).toBe(1);
      const action = plan.actions[0];
      expect(action.action).toBe('UPDATE');
      expect(action.oldState?.status).toBe('active');
      expect(action.oldState?.isTradeable).toBe(true);
      expect(action.newState?.status).toBe('delisted');
      expect(action.newState?.isTradeable).toBe(false);
      expect(action.newState?.isVisibleCatalog).toBe(true);
    });
  });

  describe('2. Cobertura de Ações Especiais e Balcão Organizado B3', () => {
    it('deve classificar B3SA3 (raiz com número) como ação ON aceita', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'B3SA3',
        shortName: 'B3',
        specification: 'ON NM',
        bdiCode: '02',
        marketType: 10,
      });

      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('stock');
      expect(res.shareClass).toBe('ON');
    });

    it('deve classificar B1003 (raiz alfanumérica) como ação ON aceita', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'B1003',
        shortName: 'B100 S.A.',
        specification: 'ON',
        bdiCode: '02',
        marketType: 10,
      });

      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('stock');
      expect(res.shareClass).toBe('ON');
    });

    it('deve classificar ações de Balcão Organizado (sufixos 3B, 5B, 6B) como ações aceitas', () => {
      const mrsa3b = classifyCanonicalCandidate({
        ticker: 'MRSA3B',
        shortName: 'MRS LOGIST',
        specification: 'ON MB',
        bdiCode: '02',
        marketType: 10,
      });
      expect(mrsa3b.decision).toBe('ACCEPT');
      expect(mrsa3b.assetType).toBe('stock');
      expect(mrsa3b.shareClass).toBe('ON');

      const mrsa5b = classifyCanonicalCandidate({
        ticker: 'MRSA5B',
        shortName: 'MRS LOGIST',
        specification: 'PNA MB',
        bdiCode: '02',
        marketType: 10,
      });
      expect(mrsa5b.decision).toBe('ACCEPT');
      expect(mrsa5b.assetType).toBe('stock');
      expect(mrsa5b.shareClass).toBe('PNA');

      const mrsa6b = classifyCanonicalCandidate({
        ticker: 'MRSA6B',
        shortName: 'MRS LOGIST',
        specification: 'PNB MB',
        bdiCode: '02',
        marketType: 10,
      });
      expect(mrsa6b.decision).toBe('ACCEPT');
      expect(mrsa6b.assetType).toBe('stock');
      expect(mrsa6b.shareClass).toBe('PNB');

      const eqma3b = classifyCanonicalCandidate({
        ticker: 'EQMA3B',
        shortName: 'EQTLMARANHAO',
        specification: 'ON MB',
        bdiCode: '02',
        marketType: 10,
      });
      expect(eqma3b.decision).toBe('ACCEPT');
      expect(eqma3b.assetType).toBe('stock');
      expect(eqma3b.shareClass).toBe('ON');
    });
  });

  describe('3. Validação do Schema de Busca com isTradeableOnly', () => {
    it('deve validar busca com isTradeableOnly habilitado', () => {
      const parsed = searchAssetsSchema.parse({
        query: 'PETR',
        isTradeableOnly: true,
      });
      expect(parsed.isTradeableOnly).toBe(true);
      expect(parsed.query).toBe('PETR');
    });

    it('deve permitir busca sem isTradeableOnly (default undefined para busca ampla com histórico)', () => {
      const parsed = searchAssetsSchema.parse({
        query: 'AMBV',
      });
      expect(parsed.isTradeableOnly).toBeUndefined();
    });
  });
});
