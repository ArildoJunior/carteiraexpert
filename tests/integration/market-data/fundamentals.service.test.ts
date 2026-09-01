import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/identity';
import { assets } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { assetFundamentals } from '@/lib/db/schema/market-fundamentals';
import { cvmCompanies, cvmCompanyAssets } from '@/lib/db/schema/cvm-market-data';
import {
  saveAssetFundamentals,
  getRepresentativeFundamentals,
  getPublicAssetFundamentalsWithIndicators,
} from '@/modules/market-data/server/fundamentals.service';

describe('Integration — FundamentalsService', () => {
  let publicAssetId: string;
  let customAssetId: string;
  const publicTicker = `FND_${Date.now().toString().slice(-4)}`;
  const customTicker = `CUS_${Date.now().toString().slice(-4)}`;

  beforeAll(async () => {
    // 1. Cria usuário proprietário do ativo customizado
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `fund_test_${Date.now()}@carteiraexpert.test`,
      name: 'Testador Fundamentos',
      passwordHash: 'hash_test_123',
      status: 'active',
    });

    // 2. Cria ativo público no catálogo (isCustom = false, userId = null)
    publicAssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: publicAssetId,
      ticker: publicTicker,
      name: 'Empresa Teste SA',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
    });

    // 3. Cria ativo customizado privado de usuário (isCustom = true, userId = userId)
    customAssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: customAssetId,
      ticker: customTicker,
      name: 'Ativo Privado Teste',
      assetType: 'stock',
      market: 'OTHER',
      currency: 'BRL',
      isCustom: true,
      userId: userId,
    });

    // 4. Cria cotação pública para o ativo público
    await db.insert(marketQuotes).values({
      id: crypto.randomUUID(),
      assetId: publicAssetId,
      price: '40.00',
      currency: 'BRL',
      quoteDate: new Date(),
      source: 'manual',
      delayStatus: 'realtime',
      createdBy: userId,
      updatedAt: new Date(),
    });

  });

  it('salva demonstrativo fundamentalista público com sucesso sem exigir createdBy', async () => {
    const saved = await saveAssetFundamentals({
      assetId: publicAssetId,
      referencePeriod: '2025-4Q',
      periodType: 'quarterly',
      statementType: 'CONSOLIDATED',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      filingDate: new Date('2026-02-20T18:00:00.000Z'),
      source: 'cvm',
      sourceReference: 'ITR-2025-4Q-001',
      version: 1,
      isRestated: false,
      currency: 'BRL',
      netRevenue: '2000000000.00',
      ebitda: '600000000.00',
      netIncome: '400000000.00',
      totalEquity: '1600000000.00',
      totalAssets: '4000000000.00',
      grossDebt: '800000000.00',
      cashEquivalents: '200000000.00',
      sharesCount: '100000000.0000000000',
      dividendsDeclared: '100000000.00',
      notes: 'Demonstração de 4T25',
    });

    expect(saved.id).toBeDefined();
    expect(saved.assetId).toBe(publicAssetId);
    expect(saved.createdBy).toBeNull();
    expect(saved.netRevenue?.toString()).toBe('2000000000');
    expect(saved.dividendsDeclared?.toString()).toBe('100000000');
  });

  it('garante idempotência em nova inserção com mesma chave de versionamento (ON CONFLICT DO UPDATE)', async () => {
    const updated = await saveAssetFundamentals({
      assetId: publicAssetId,
      referencePeriod: '2025-4Q',
      periodType: 'quarterly',
      statementType: 'CONSOLIDATED',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      source: 'cvm',
      version: 1,
      isRestated: false,
      currency: 'BRL',
      netRevenue: '2200000000.00', // Valor corrigido
      ebitda: '650000000.00',
      netIncome: '420000000.00',
      totalEquity: '1600000000.00',
      totalAssets: '4000000000.00',
      grossDebt: '800000000.00',
      cashEquivalents: '200000000.00',
      sharesCount: '100000000.0000000000',
      dividendsDeclared: '100000000.00',
      notes: 'Demonstração de 4T25 Atualizada',
    });

    expect(updated.netRevenue?.toString()).toBe('2200000000');
    expect(updated.netIncome?.toString()).toBe('420000000');
  });

  it('permite coexistência de versões diferentes para o mesmo período contábil (version 2)', async () => {
    const v2 = await saveAssetFundamentals({
      assetId: publicAssetId,
      referencePeriod: '2025-4Q',
      periodType: 'quarterly',
      statementType: 'CONSOLIDATED',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      source: 'cvm',
      sourceReference: 'ITR-2025-4Q-002-REAPRESENTADA',
      version: 2,
      isRestated: true,
      currency: 'BRL',
      netRevenue: '2300000000.00',
      ebitda: '700000000.00',
      netIncome: '450000000.00',
      totalEquity: '1650000000.00',
      totalAssets: '4100000000.00',
      grossDebt: '800000000.00',
      cashEquivalents: '200000000.00',
      sharesCount: '100000000.0000000000',
      dividendsDeclared: '120000000.00',
    });

    expect(v2.version).toBe(2);
    expect(v2.isRestated).toBe(true);
  });

  it('seleciona deterministicamente a versão mais recente e consolidada como demonstrativo representativo', async () => {
    // Insere demonstrativo individual de mesma data (deve ter prioridade menor que consolidado)
    await saveAssetFundamentals({
      assetId: publicAssetId,
      referencePeriod: '2025-4Q',
      periodType: 'quarterly',
      statementType: 'INDIVIDUAL',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      source: 'cvm',
      version: 1,
      currency: 'BRL',
      netRevenue: '1000000000.00',
      netIncome: '200000000.00',
    });

    const representative = await getRepresentativeFundamentals(publicAssetId);
    expect(representative).not.toBeNull();
    // Deve selecionar o CONSOLIDATED de versão mais alta (version 2)
    expect(representative?.statementType).toBe('CONSOLIDATED');
    expect(representative?.version).toBe(2);
    expect(representative?.netRevenue?.toString()).toBe('2300000000');
  });

  it('retorna dados completos de fundamentos com indicadores calculados e auditoria de cotação para ativo público', async () => {
    const viewData = await getPublicAssetFundamentalsWithIndicators(publicTicker);

    expect(viewData).not.toBeNull();
    expect(viewData?.statement.referencePeriod).toBe('2025-4Q');
    expect(viewData?.statement.version).toBe(2);

    // Indicadores:
    // netDebt = 800M - 200M = 600M
    expect(viewData?.indicators.netDebt).toBe('600000000.0000');
    // Margem Líquida = 450M / 2300M = 0.195652... -> 0.1957
    expect(viewData?.indicators.netMargin).toBe('0.1957');
    // LPA = 450M / 100M = 4.5000
    expect(viewData?.indicators.lpa).toBe('4.5000');
    // VPA = 1650M / 100M = 16.5000
    expect(viewData?.indicators.vpa).toBe('16.5000');
    // P/L = 40.00 / 4.50 = 8.8888... -> 8.89
    expect(viewData?.indicators.peRatio).toBe('8.89');
    // P/VP = 40.00 / 16.50 = 2.4242... -> 2.42
    expect(viewData?.indicators.pbRatio).toBe('2.42');
    // DY = (120M / 100M) / 40.00 = 1.20 / 40.00 = 0.0300 (3,00%)
    expect(viewData?.indicators.dividendYield).toBe('0.0300');

    // Metadados da cotação
    expect(viewData?.indicators.quoteAudit?.quotePriceUsed).toBe('40.0000');
    expect(viewData?.indicators.quoteAudit?.currency).toBe('BRL');
    expect(viewData?.indicators.currencyMismatch).toBe(false);
  });

  it('retorna metadados oficiais da companhia CVM quando vínculo APPROVED estiver presente', async () => {
    // 1. Cadastra companhia CVM
    const companyId = crypto.randomUUID();
    const cnpj = `11222333${Date.now().toString().slice(-6)}`;
    const cvmCode = `${Date.now().toString().slice(-6)}`;

    await db.insert(cvmCompanies).values({
      id: companyId,
      cnpj,
      cvmCode,
      legalName: 'EMPRESA TESTE CVM S.A.',
      tradeName: 'EMPRESA TESTE',
      industrySector: 'Tecnologia da Informação',
      marketType: 'BOLSA',
      status: 'ATIVO',
    });

    // 2. Cria vínculo APPROVED para o ativo público
    await db.insert(cvmCompanyAssets).values({
      id: crypto.randomUUID(),
      companyId,
      assetId: publicAssetId,
      status: 'APPROVED',
      matchMethod: 'MANUAL',
      source: 'test_seed',
    });

    const viewData = await getPublicAssetFundamentalsWithIndicators(publicTicker);

    expect(viewData).not.toBeNull();
    expect(viewData?.cvmCompany).not.toBeNull();
    expect(viewData?.cvmCompany?.cnpj).toBe(cnpj);
    expect(viewData?.cvmCompany?.cvmCode).toBe(cvmCode);
    expect(viewData?.cvmCompany?.legalName).toBe('EMPRESA TESTE CVM S.A.');
    expect(viewData?.cvmCompany?.industrySector).toBe('Tecnologia da Informação');
  });

  it('isola dados e não retorna fundamentos para ticker de ativo customizado/privado', async () => {
    // Tenta salvar demonstrativo no ativo privado
    await saveAssetFundamentals({
      assetId: customAssetId,
      referencePeriod: '2025-4Q',
      periodType: 'quarterly',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      currency: 'BRL',
      netIncome: '50000.00',
    });

    // Consulta pública para o ativo privado DEVE retornar null
    const result = await getPublicAssetFundamentalsWithIndicators(customTicker);
    expect(result).toBeNull();
  });
});
