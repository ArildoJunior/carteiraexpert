import { describe, expect, it, vi } from 'vitest';
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

  const txMock = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join('?').trim();

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
  };

  return sqlMock;
}

describe('CvmCadastralApplyService — Segurança e Governança de Replicação', () => {
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

  it('4. Deve executar aplicação transacional com criação de companhias e vínculos em desenvolvimento', async () => {
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
  });

  it('5. Deve ser estritamente idempotente: ignora vínculos já existentes sem duplicar chaves', async () => {
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

  it('6. Deve rejeitar e abortar a aplicação de ativos OUT_OF_SCOPE (BDR, FII, ETF)', async () => {
    const mockSql = createMockSql();

    const candidateBdr: CvmEligibleApplyCandidate = {
      assetId: 'asset-bdr-aapl34-uuid',
      ticker: 'AAPL34',
      cnpj: '00000000000000',
      cvmCode: '000000',
      legalName: 'APPLE INC',
      companyStatus: 'ATIVO',
      shareClass: 'BDR',
    };

    await expect(
      service.applyBatch({
        sql: mockSql,
        eligibleItems: [candidateBdr],
        canonicalAssets: mockCanonicalAssets,
        existingBindings: mockExistingBindings,
        targetEnv: 'development',
      })
    ).rejects.toThrow(CvmCadastralApplyValidationError);
  });

  it('7. Deve rejeitar ativos vinculados a companhias com status CANCELADA', async () => {
    const mockSql = createMockSql();

    const candidateCanceled: CvmEligibleApplyCandidate = {
      assetId: 'asset-bbas3-uuid',
      ticker: 'BBAS3',
      cnpj: '00000000000191',
      cvmCode: '001023',
      legalName: 'BANCO DO BRASIL S.A.',
      companyStatus: 'CANCELADA',
      shareClass: 'ON',
    };

    const result = await service.applyBatch({
      sql: mockSql,
      eligibleItems: [candidateCanceled],
      canonicalAssets: mockCanonicalAssets,
      existingBindings: mockExistingBindings,
      targetEnv: 'development',
    });

    expect(result.rejectedCount).toBe(1);
    expect(result.rejectedItems[0].reason).toBe('COMPANHIA_STATUS_CANCELADA');
    expect(result.newBindingsCreatedCount).toBe(0);
  });

  it('8. Deve validar formato estrito de CNPJ (14 dígitos) e Código CVM (6 dígitos)', async () => {
    const mockSql = createMockSql();

    const invalidCnpjItem: CvmEligibleApplyCandidate = {
      assetId: 'asset-abev3-uuid',
      ticker: 'ABEV3',
      cnpj: '123', // inválido
      cvmCode: '023264',
      legalName: 'AMBEV S.A.',
      companyStatus: 'ATIVO',
      shareClass: 'ON',
    };

    const invalidCvmItem: CvmEligibleApplyCandidate = {
      assetId: 'asset-bbas3-uuid',
      ticker: 'BBAS3',
      cnpj: '00000000000191',
      cvmCode: '1', // inválido
      legalName: 'BANCO DO BRASIL S.A.',
      companyStatus: 'ATIVO',
      shareClass: 'ON',
    };

    const result = await service.applyBatch({
      sql: mockSql,
      eligibleItems: [invalidCnpjItem, invalidCvmItem],
      canonicalAssets: mockCanonicalAssets,
      existingBindings: mockExistingBindings,
      targetEnv: 'development',
    });

    expect(result.rejectedCount).toBe(2);
    expect(result.rejectedItems[0].reason).toBe('CNPJ_INVALIDO_NAO_POSSUI_14_DIGITOS');
    expect(result.rejectedItems[1].reason).toBe('CODIGO_CVM_INVALIDO_NAO_POSSUI_6_DIGITOS');
    expect(result.newBindingsCreatedCount).toBe(0);
  });
});
