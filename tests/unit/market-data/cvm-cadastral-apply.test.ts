import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  CvmCadastralApplyService,
  CvmTargetEnvMissingError,
  CvmProductionApplyBlockedError,
  CvmCadastralApplyValidationError,
  type CvmEligibleApplyCandidate,
} from '../../../src/modules/market-data/server/cvm-cadastral-apply.service';
import type {
  CanonicalAssetMatchingInput,
  ExistingBindingMatchingInput,
} from '../../../src/modules/market-data/domain/cvm-matching.types';

function createMockSql(initialDbState?: {
  companies?: Array<{ id: string; cvm_code: string; cnpj: string; legal_name: string }>;
  bindings?: Array<{ id: string; asset_id: string; company_id: string; status: string }>;
}) {
  const companies = [...(initialDbState?.companies || [])];
  const bindings = [...(initialDbState?.bindings || [])];

  const executedQueries: string[] = [];

  const txMock = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join('?').trim();
    executedQueries.push(query);

    if (query.includes('SELECT id, cvm_code, cnpj, legal_name FROM cvm_companies')) {
      return Promise.resolve(companies);
    }
    if (query.includes('SELECT id, asset_id, company_id, status FROM cvm_company_assets')) {
      return Promise.resolve(bindings);
    }
    if (query.includes('INSERT INTO cvm_companies')) {
      const id = values[0];
      const cvm_code = values[1];
      const cnpj = values[2];
      const legal_name = values[3];
      const newComp = { id, cvm_code, cnpj, legal_name };
      companies.push(newComp);
      return Promise.resolve([newComp]);
    }
    if (query.includes('INSERT INTO cvm_company_assets')) {
      const id = values[0];
      const company_id = values[1];
      const asset_id = values[2];
      const share_class = values[3];
      const newBinding = { id, company_id, asset_id, share_class, status: 'APPROVED' };
      bindings.push(newBinding);
      return Promise.resolve([newBinding]);
    }

    return Promise.resolve([]);
  });

  const sqlMock = {
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return await cb(txMock);
    }),
    companies,
    bindings,
    txMock,
    executedQueries,
  };

  return sqlMock;
}

describe('CvmCadastralApplyService — Segurança, Governança e Manifesto Versionado', () => {
  const service = new CvmCadastralApplyService();

  const mockCanonicalAssets: CanonicalAssetMatchingInput[] = [
    {
      id: 'asset-abev3-uuid',
      ticker: 'ABEV3',
      name: 'AMBEV S/A - ON',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isin: 'BRABEVACNOR1',
      provenance: 'canonical',
    },
    {
      id: 'asset-bbas3-uuid',
      ticker: 'BBAS3',
      name: 'BRASIL - ON NM',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isin: 'BRBBASACNOR3',
      provenance: 'canonical',
    },
    {
      id: 'asset-bdr-aapl34-uuid',
      ticker: 'AAPL34',
      name: 'APPLE - BDR',
      assetType: 'bdr',
      market: 'B3',
      currency: 'BRL',
      isin: 'BRAAPLBDR004',
      provenance: 'canonical',
    },
    {
      id: 'asset-fii-knri11-uuid',
      ticker: 'KNRI11',
      name: 'FII KINEA - CI',
      assetType: 'fii',
      market: 'B3',
      currency: 'BRL',
      isin: 'BRKNRICTF007',
      provenance: 'canonical',
    },
    {
      id: 'asset-petr4-canon-uuid',
      ticker: 'PETR4',
      name: 'PETROBRAS - PN',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isin: 'BRPETRACNPR6',
      provenance: 'canonical',
    },
  ];

  const mockExistingBindings: ExistingBindingMatchingInput[] = [
    {
      id: 'binding-petr4-canon-uuid',
      assetId: 'asset-petr4-canon-uuid',
      ticker: 'PETR4',
      companyId: 'company-petrobras-uuid',
      cvmCode: '009512',
      cnpj: '33000167000101',
      shareClass: 'PN',
      status: 'APPROVED',
      matchMethod: 'CURATED_SEED',
    },
    {
      id: 'binding-petr4-custom-uuid',
      assetId: 'asset-petr4-custom-user-uuid',
      ticker: 'PETR4',
      companyId: 'company-petrobras-uuid',
      cvmCode: '009512',
      cnpj: '33000167000101',
      shareClass: 'PN',
      status: 'APPROVED',
      matchMethod: 'CURATED_SEED',
    },
  ];

  describe('Guardas de Ambiente e Segurança', () => {
    it('1. Deve recusar execução se o ambiente-alvo (TARGET_ENV) não for informado', async () => {
      const mockSql = createMockSql();

      await expect(
        service.applyBatch({
          sql: mockSql,
          eligibleItems: [],
          canonicalAssets: mockCanonicalAssets,
          existingBindings: mockExistingBindings,
          targetEnv: '',
        })
      ).rejects.toThrow(CvmTargetEnvMissingError);
    });

    it('2. Deve bloquear execução contra produção por padrão sem a flag --allow-production', async () => {
      const mockSql = createMockSql();

      await expect(
        service.applyBatch({
          sql: mockSql,
          eligibleItems: [],
          canonicalAssets: mockCanonicalAssets,
          existingBindings: mockExistingBindings,
          targetEnv: 'production',
          allowProduction: false,
        })
      ).rejects.toThrow(CvmProductionApplyBlockedError);
    });

    it('3. Deve autorizar execução contra produção quando allowProduction for explicitamente true', async () => {
      const mockSql = createMockSql();

      const result = await service.applyBatch({
        sql: mockSql,
        eligibleItems: [],
        canonicalAssets: mockCanonicalAssets,
        existingBindings: mockExistingBindings,
        targetEnv: 'production',
        allowProduction: true,
      });

      expect(result.success).toBe(true);
      expect(result.targetEnv).toBe('production');
    });
  });

  describe('Manifesto Versionado e Integridade', () => {
    it('4. Deve falhar quando o arquivo de manifesto não existe', () => {
      expect(() => {
        service.loadAndValidateManifest({
          manifestPath: '/caminho/inexistente/manifesto.json',
        });
      }).toThrow(CvmCadastralApplyValidationError);
    });

    it('5. Deve falhar quando o hash esperado do manifesto for divergente', () => {
      const realManifestPath = path.resolve(__dirname, '../../../src/modules/market-data/domain/cvm-cadastral-manifest-2026.json');
      expect(() => {
        service.loadAndValidateManifest({
          manifestPath: realManifestPath,
          expectedHash: '0000000000000000000000000000000000000000000000000000000000000000',
        });
      }).toThrow(CvmCadastralApplyValidationError);
    });

    it('6. Deve carregar com sucesso o manifesto oficial versionado (368 ativos)', () => {
      const { manifest, candidates, calculatedHash } = service.loadAndValidateManifest();

      expect(manifest.version).toBe('2026-09-01');
      expect(manifest.total_items).toBe(368);
      expect(manifest.items.length).toBe(368);
      expect(candidates.length).toBe(368);
      expect(calculatedHash).toBeDefined();
      expect(calculatedHash.length).toBe(64);

      // Unicidade estrita de tickers e assetIds
      const uniqueTickers = new Set(candidates.map((c) => c.ticker));
      const uniqueAssetIds = new Set(candidates.map((c) => c.assetId));
      expect(uniqueTickers.size).toBe(368);
      expect(uniqueAssetIds.size).toBe(368);

      // Integridade de status e classes
      expect(candidates.every((c) => c.companyStatus === 'ATIVO')).toBe(true);
      expect(candidates.every((c) => ['ON', 'PN', 'PNA', 'PNB', 'UNT'].includes(c.shareClass))).toBe(true);
      expect(candidates.some((c) => c.ticker === 'PETR4')).toBe(false);
    });

    it('7. Deve rejeitar manifesto contendo ativo OUT_OF_SCOPE', () => {
      const invalidManifest = {
        version: '2026-09-01',
        description: 'Test Invalid',
        total_items: 1,
        items: [
          {
            ticker: 'AAPL34',
            asset_id: 'asset-bdr-uuid',
            asset_type: 'bdr',
            cnpj: '00000000000100',
            cvm_code: '000100',
            company_name: 'APPLE INC',
            company_status: 'ATIVO',
            share_class: 'ON',
            source_file: 'test',
            source_hash: 'test',
          },
        ],
      };

      const tmpPath = path.resolve(__dirname, '../../../scratch/test_out_of_scope_manifest.json');
      fs.writeFileSync(tmpPath, JSON.stringify(invalidManifest), 'utf-8');

      try {
        expect(() => {
          service.loadAndValidateManifest({ manifestPath: tmpPath });
        }).toThrow(CvmCadastralApplyValidationError);
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    });

    it('8. Deve rejeitar manifesto contendo companhia com status CANCELADA', () => {
      const invalidManifest = {
        version: '2026-09-01',
        description: 'Test Canceled',
        total_items: 1,
        items: [
          {
            ticker: 'MERC4',
            asset_id: 'asset-merc4-uuid',
            asset_type: 'stock',
            cnpj: '00000000000100',
            cvm_code: '000100',
            company_name: 'MERCANTIL SA',
            company_status: 'CANCELADA',
            share_class: 'PN',
            source_file: 'test',
            source_hash: 'test',
          },
        ],
      };

      const tmpPath = path.resolve(__dirname, '../../../scratch/test_canceled_manifest.json');
      fs.writeFileSync(tmpPath, JSON.stringify(invalidManifest), 'utf-8');

      try {
        expect(() => {
          service.loadAndValidateManifest({ manifestPath: tmpPath });
        }).toThrow(CvmCadastralApplyValidationError);
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
    });
  });

  describe('Persistência Transacional, Idempotência e Isolamento', () => {
    it('9. Deve executar aplicação transacional com criação de companhias e vínculos em desenvolvimento', async () => {
      const mockSql = createMockSql();

      const candidate: CvmEligibleApplyCandidate = {
        assetId: 'asset-abev3-uuid',
        ticker: 'ABEV3',
        cnpj: '07526557000100',
        cvmCode: '023264',
        legalName: 'AMBEV S.A.',
        companyStatus: 'ATIVO',
        shareClass: 'ON',
        justification: 'Homologação ABEV3',
      };

      const result = await service.applyBatch({
        sql: mockSql,
        eligibleItems: [candidate],
        canonicalAssets: mockCanonicalAssets,
        existingBindings: mockExistingBindings,
        targetEnv: 'development',
      });

      expect(result.success).toBe(true);
      expect(result.newBindingsCreatedCount).toBe(1);
      expect(result.newCompaniesCreatedCount).toBe(1);
      expect(result.alreadyExistingBindingsCount).toBe(0);
      expect(mockSql.begin).toHaveBeenCalledTimes(1);

      // Confirma que nenhuma escrita ocorreu fora de cvm_companies e cvm_company_assets
      const hasInvalidWrites = mockSql.executedQueries.some(
        (q) => !q.includes('cvm_companies') && !q.includes('cvm_company_assets')
      );
      expect(hasInvalidWrites).toBe(false);
    });

    it('10. Deve ser estritamente idempotente em segunda execução: ignora vínculos existentes sem duplicar', async () => {
      const mockSql = createMockSql({
        companies: [
          {
            id: 'company-abev-uuid',
            cvm_code: '023264',
            cnpj: '07526557000100',
            legal_name: 'AMBEV S.A.',
          },
        ],
        bindings: [
          {
            id: 'binding-abev-uuid',
            asset_id: 'asset-abev3-uuid',
            company_id: 'company-abev-uuid',
            status: 'APPROVED',
          },
        ],
      });

      const candidate: CvmEligibleApplyCandidate = {
        assetId: 'asset-abev3-uuid',
        ticker: 'ABEV3',
        cnpj: '07526557000100',
        cvmCode: '023264',
        legalName: 'AMBEV S.A.',
        companyStatus: 'ATIVO',
        shareClass: 'ON',
      };

      const result = await service.applyBatch({
        sql: mockSql,
        eligibleItems: [candidate],
        canonicalAssets: mockCanonicalAssets,
        existingBindings: mockExistingBindings,
        targetEnv: 'development',
      });

      expect(result.success).toBe(true);
      expect(result.newBindingsCreatedCount).toBe(0);
      expect(result.alreadyExistingBindingsCount).toBe(1);
      expect(result.skippedBindings[0].ticker).toBe('ABEV3');
      expect(result.skippedBindings[0].reason).toBe('VINCULO_JA_EXISTENTE');
    });

    it('11. Preserva integralmente os dois vínculos de PETR4 (canônico e customizado)', async () => {
      const mockSql = createMockSql({
        companies: [
          {
            id: 'company-petrobras-uuid',
            cvm_code: '009512',
            cnpj: '33000167000101',
            legal_name: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          },
        ],
        bindings: [
          {
            id: 'binding-petr4-canon-uuid',
            asset_id: 'asset-petr4-canon-uuid',
            company_id: 'company-petrobras-uuid',
            status: 'APPROVED',
          },
          {
            id: 'binding-petr4-custom-uuid',
            asset_id: 'asset-petr4-custom-user-uuid',
            company_id: 'company-petrobras-uuid',
            status: 'APPROVED',
          },
        ],
      });

      // Executa sem passar candidato de PETR4 (pois é curated)
      const candidateAbev: CvmEligibleApplyCandidate = {
        assetId: 'asset-abev3-uuid',
        ticker: 'ABEV3',
        cnpj: '07526557000100',
        cvmCode: '023264',
        legalName: 'AMBEV S.A.',
        companyStatus: 'ATIVO',
        shareClass: 'ON',
      };

      const result = await service.applyBatch({
        sql: mockSql,
        eligibleItems: [candidateAbev],
        canonicalAssets: mockCanonicalAssets,
        existingBindings: mockExistingBindings,
        targetEnv: 'development',
      });

      expect(result.success).toBe(true);
      expect(mockSql.bindings.length).toBe(3); // 2 de PETR4 preservados + 1 de ABEV3 novo
      expect(mockSql.bindings.some((b) => b.asset_id === 'asset-petr4-canon-uuid')).toBe(true);
      expect(mockSql.bindings.some((b) => b.asset_id === 'asset-petr4-custom-user-uuid')).toBe(true);
    });
  });
});
