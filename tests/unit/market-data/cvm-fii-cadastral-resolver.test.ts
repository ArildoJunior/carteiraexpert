import { describe, expect, it } from 'vitest';
import {
  extractFiiTickerRootFromIsin,
  FiiCadastralResolverEngine,
  normalizeCnpjDigits,
} from '@/modules/market-data/domain/cvm-fii-cadastral-resolver';
import type {
  CanonicalFiiAssetInput,
  ExistingFiiRegistryInput,
} from '@/modules/market-data/domain/cvm-fii-cadastral-resolver.types';

describe('FII Cadastral Resolver (Unit Suite)', () => {
  const mockCanonicalAssets: CanonicalFiiAssetInput[] = [
    {
      id: 'asset-hglg-11',
      ticker: 'HGLG11',
      name: 'CSHG LOGÍSTICA FDO INV IMOB',
      assetType: 'fii',
      isin: 'BRHGLGCTF004',
    },
    {
      id: 'asset-xpml-11',
      ticker: 'XPML11',
      name: 'XP MALLS FDO INV IMOB',
      assetType: 'fii',
      isin: 'BRXPMLCTF005',
    },
    {
      id: 'asset-knri-11',
      ticker: 'KNRI11',
      name: 'KINEA RENDA IMOBILIARIA FII',
      assetType: 'fii',
      isin: 'BRKNRICTF007',
    },
    {
      id: 'asset-mxrf-11',
      ticker: 'MXRF11',
      name: 'MAXI RENDA FII',
      assetType: 'fii',
      isin: null, // Sem ISIN prévio no catálogo local
    },
  ];

  const mockExistingRegistries: ExistingFiiRegistryInput[] = [
    {
      assetId: 'asset-hglg-11',
      cnpj: '11728688000147',
      legalName: 'CSHG LOGISTICA FDO INV IMOB - FII',
      ticker: 'HGLG11',
      isin: 'BRHGLGCTF004',
    },
  ];

  const mockCuratedDePara: Record<string, string> = {
    '12005956000165': 'KNRI11',
    '97521225000125': 'MXRF11',
  };

  describe('1. Utilitários Puros de Normalização', () => {
    it('deve normalizar CNPJ com ou sem pontuação para 14 dígitos', () => {
      expect(normalizeCnpjDigits('11.728.688/0001-47')).toBe('11728688000147');
      expect(normalizeCnpjDigits('11728688000147')).toBe('11728688000147');
      expect(normalizeCnpjDigits('  12.005.956/0001-65  ')).toBe('12005956000165');
    });

    it('deve retornar null para CNPJ inválido ou zerado', () => {
      expect(normalizeCnpjDigits('')).toBeNull();
      expect(normalizeCnpjDigits(null)).toBeNull();
      expect(normalizeCnpjDigits('00.000.000/0000-00')).toBeNull();
      expect(normalizeCnpjDigits('12345')).toBeNull();
    });

    it('deve extrair a raiz mnemônica de 4 letras do ticker a partir de ISIN de cotas de FII', () => {
      expect(extractFiiTickerRootFromIsin('BRHGLGCTF004')).toBe('HGLG');
      expect(extractFiiTickerRootFromIsin('BRXPMLCTF005')).toBe('XPML');
      expect(extractFiiTickerRootFromIsin('BRKNRICTF007')).toBe('KNRI');
      expect(extractFiiTickerRootFromIsin('brhglgctf004')).toBe('HGLG');
      expect(extractFiiTickerRootFromIsin('US0378331005')).toBeNull(); // ISIN de Apple
      expect(extractFiiTickerRootFromIsin('')).toBeNull();
    });
  });

  describe('2. Resolução Cadastral em Cascata (FiiCadastralResolverEngine)', () => {
    const engine = new FiiCadastralResolverEngine({
      canonicalAssets: mockCanonicalAssets,
      existingRegistries: mockExistingRegistries,
      curatedDePara: mockCuratedDePara,
    });

    it('deve resolver pelo Nível 1: Vínculo Pré-Existente em cvm_fii_registry', () => {
      const result = engine.resolve({
        cnpj: '11.728.688/0001-47',
        legalName: 'CSHG LOGISTICA FDO INV IMOB - FII',
        isin: 'BRHGLGCTF004',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('EXISTING_REGISTRY');
      expect(result.matchedAssetId).toBe('asset-hglg-11');
      expect(result.matchedTicker).toBe('HGLG11');
    });

    it('deve resolver pelo Nível 2: De-Para Canônico Curado', () => {
      const result = engine.resolve({
        cnpj: '97.521.225/0001-25', // MXRF11
        legalName: 'MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('CANONICAL_DE_PARA');
      expect(result.matchedAssetId).toBe('asset-mxrf-11');
      expect(result.matchedTicker).toBe('MXRF11');
    });

    it('deve resolver pelo Nível 3: Código ISIN Oficial Exato no Catálogo', () => {
      const result = engine.resolve({
        cnpj: '28.737.771/0001-85', // XPML11 (não está no de-para nem no registro prévio)
        legalName: 'XP MALLS FDO INV IMOB - FII',
        isin: 'BRXPMLCTF005',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('EXACT_ISIN');
      expect(result.matchedAssetId).toBe('asset-xpml-11');
      expect(result.matchedTicker).toBe('XPML11');
    });

    it('deve resolver pelo Nível 4: Derivação de Raiz do ISIN de Cota 11', () => {
      // Simula um fundo que não tem ISIN cadastrado diretamente no asset,
      // mas o ISIN do informe tem a raiz KNRI e casa univocamente com KNRI11.
      const customEngine = new FiiCadastralResolverEngine({
        canonicalAssets: [
          {
            id: 'asset-knri-11',
            ticker: 'KNRI11',
            name: 'KINEA RENDA IMOBILIARIA FII',
            assetType: 'fii',
            isin: null, // Sem ISIN no asset
          },
        ],
      });

      const result = customEngine.resolve({
        cnpj: '12.005.956/0001-65',
        legalName: 'KINEA RENDA FDO INV IMOB',
        isin: 'BRKNRICTF007',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('ISIN_TICKER_ROOT');
      expect(result.matchedAssetId).toBe('asset-knri-11');
      expect(result.matchedTicker).toBe('KNRI11');
    });

    it('deve classificar como UNMATCHED_NO_ASSET quando o fundo CVM não existir no catálogo local', () => {
      const result = engine.resolve({
        cnpj: '00.123.456/0001-99',
        legalName: 'FUNDO EXCLUSIVO PRIVADO NÃO LISTADO',
      });

      expect(result.status).toBe('UNMATCHED_NO_ASSET');
      expect(result.matchMethod).toBeNull();
      expect(result.matchedAssetId).toBeNull();
      expect(result.matchedTicker).toBeNull();
    });

    it('deve classificar como INVALID_IDENTIFIER se o CNPJ for inválido ou vazio', () => {
      const result = engine.resolve({
        cnpj: '123',
        legalName: 'Fundo Invalido',
      });

      expect(result.status).toBe('INVALID_IDENTIFIER');
      expect(result.matchedAssetId).toBeNull();
    });

    it('deve detectar conflito e classificar como AMBIGUOUS_MATCH se um ativo já estiver homologado para outro CNPJ', () => {
      // Tentativa de associar KNRI11 (que já está cadastrado) a um CNPJ fraudulento ou divergente via ISIN
      const conflictingEngine = new FiiCadastralResolverEngine({
        canonicalAssets: [
          {
            id: 'asset-hglg-11',
            ticker: 'HGLG11',
            name: 'CSHG LOGISTICA',
            assetType: 'fii',
            isin: 'BRHGLGCTF004',
          },
        ],
        existingRegistries: [
          {
            assetId: 'asset-hglg-11',
            cnpj: '11728688000147', // CNPJ verdadeiro de HGLG11
            legalName: 'CSHG LOGISTICA',
            ticker: 'HGLG11',
          },
        ],
      });

      const result = conflictingEngine.resolve({
        cnpj: '99.999.999/0001-99', // Outro CNPJ tentando casar com HGLG11 pelo ISIN
        legalName: 'Fundo Divergente',
        isin: 'BRHGLGCTF004',
      });

      expect(result.status).toBe('AMBIGUOUS_MATCH');
      expect(result.matchedAssetId).toBeNull();
      expect(result.justification).toContain('Conflito cadastral por ISIN');
    });

    it('deve ignorar ativos cujo assetType não seja fii mesmo que ticker ou raiz coincidam', () => {
      // Simula catálogo contendo uma Unit de ação (ex: SANB11) com assetType 'stock'
      const mixedEngine = new FiiCadastralResolverEngine({
        canonicalAssets: [
          {
            id: 'asset-sanb-11',
            ticker: 'SANB11',
            name: 'SANTANDER BRASIL UNT',
            assetType: 'stock', // Não é FII!
            isin: 'BRSANBCTF001',
          },
        ],
      });

      const result = mixedEngine.resolve({
        cnpj: '90.400.888/0001-42',
        legalName: 'FUNDO QUALQUER',
        isin: 'BRSANBCTF001',
      });

      // Como o ativo é stock e não FII, deve ser ignorado na indexação e resultar em UNMATCHED_NO_ASSET
      expect(result.status).toBe('UNMATCHED_NO_ASSET');
      expect(result.matchedAssetId).toBeNull();
      expect(result.matchedTicker).toBeNull();
    });

    it('deve processar um lote completo de resolução cadastral via resolveBatch', () => {
      const batchInput = [
        { cnpj: '11.728.688/0001-47', legalName: 'CSHG LOGISTICA', isin: 'BRHGLGCTF004' },
        { cnpj: '28.737.771/0001-85', legalName: 'XP MALLS', isin: 'BRXPMLCTF005' },
        { cnpj: '99.999.999/0001-99', legalName: 'FUNDO NÃO LISTADO' },
        { cnpj: 'INVALIDO', legalName: 'FUNDO CORROMPIDO' },
      ];

      const report = engine.resolveBatch(batchInput);

      expect(report.totalFundsEvaluated).toBe(4);
      expect(report.matchedCount).toBe(2);
      expect(report.unmatchedCount).toBe(1);
      expect(report.invalidCount).toBe(1);
      expect(report.matchedMap.get('11728688000147')?.matchedTicker).toBe('HGLG11');
      expect(report.matchedMap.get('28737771000185')?.matchedTicker).toBe('XPML11');
    });
  });
});
