import { describe, expect, it } from 'vitest';
import {
  extractFiiTickerRootFromIsin,
  FiiCadastralResolverEngine,
  normalizeCnpjDigits,
} from '@/modules/market-data/domain/cvm-fii-cadastral-resolver';
import type {
  CanonicalFiiAssetInput,
  ExistingFiiBindingInput,
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
    {
      id: 'asset-sptw-11',
      ticker: 'SPTW11',
      name: 'SP DOWNTOWN FII',
      assetType: 'fii',
      isin: 'BRSPTWCTF003',
    },
    {
      id: 'asset-trxf-11',
      ticker: 'TRXF11',
      name: 'TRX REAL ESTATE FII',
      assetType: 'fii',
      isin: 'BRTRXFCTF005',
    },
    {
      id: 'asset-apto-11',
      ticker: 'APTO11',
      name: 'NAVI RESIDENCIAL FII',
      assetType: 'fii',
      isin: 'BRAPTOCTF002',
    },
  ];

  const mockExistingBindings: ExistingFiiBindingInput[] = [
    {
      assetId: 'asset-hglg-11',
      cnpj: '11728688000147',
      ticker: 'HGLG11',
      bindingStatus: 'APPROVED',
      bindingMethod: 'CANONICAL_DE_PARA',
      confidenceLevel: 'HIGH',
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

  describe('2. Resolução Cadastral em Cascata e Governança de Vínculos', () => {
    const engine = new FiiCadastralResolverEngine({
      canonicalAssets: mockCanonicalAssets,
      existingBindings: mockExistingBindings,
      curatedDePara: mockCuratedDePara,
    });

    it('deve resolver pelo Nível 1: Vínculo Pré-Existente Homologado (cvm_fii_bindings APPROVED)', () => {
      const result = engine.resolve({
        cnpj: '11.728.688/0001-47',
        legalName: 'CSHG LOGISTICA FDO INV IMOB - FII',
        isin: 'BRHGLGCTF004',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('EXISTING_REGISTRY');
      expect(result.matchedAssetId).toBe('asset-hglg-11');
      expect(result.matchedTicker).toBe('HGLG11');
      expect(result.bindingProposal).toBeDefined();
      expect(result.bindingProposal?.bindingStatus).toBe('APPROVED');
      expect(result.bindingProposal?.confidenceLevel).toBe('HIGH');
    });

    it('deve resolver pelo Nível 2: De-Para Canônico Curado gerando proposta APPROVED', () => {
      const result = engine.resolve({
        cnpj: '97.521.225/0001-25', // MXRF11
        legalName: 'MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('CANONICAL_DE_PARA');
      expect(result.matchedAssetId).toBe('asset-mxrf-11');
      expect(result.matchedTicker).toBe('MXRF11');
      expect(result.bindingProposal?.bindingStatus).toBe('APPROVED');
      expect(result.bindingProposal?.confidenceLevel).toBe('HIGH');
    });

    it('deve resolver pelo Nível 3: Código ISIN Oficial Exato no Catálogo gerando proposta PENDING_REVIEW', () => {
      const result = engine.resolve({
        cnpj: '28.737.771/0001-85', // XPML11
        legalName: 'XP MALLS FDO INV IMOB - FII',
        isin: 'BRXPMLCTF005',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matchMethod).toBe('EXACT_ISIN');
      expect(result.matchedAssetId).toBe('asset-xpml-11');
      expect(result.matchedTicker).toBe('XPML11');
      expect(result.bindingProposal?.bindingStatus).toBe('PENDING_REVIEW');
      expect(result.bindingProposal?.confidenceLevel).toBe('HIGH');
      expect(result.bindingProposal?.justification).toContain('aprovação automática proibida');
    });

    it('deve resolver pelo Nível 4: Derivação de Raiz do ISIN de Cota 11 gerando proposta PENDING_REVIEW', () => {
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
      expect(result.bindingProposal?.bindingStatus).toBe('PENDING_REVIEW');
      expect(result.bindingProposal?.confidenceLevel).toBe('MEDIUM');
      expect(result.bindingProposal?.justification).toContain('aprovação automática proibida');
    });

    it('deve suportar CNPJ sem assetId (UNMATCHED_NO_ASSET) preservando entidade regulatória sem proposta de vínculo', () => {
      const result = engine.resolve({
        cnpj: '00.123.456/0001-99',
        legalName: 'FUNDO EXCLUSIVO PRIVADO NÃO LISTADO',
      });

      expect(result.status).toBe('UNMATCHED_NO_ASSET');
      expect(result.matchMethod).toBeNull();
      expect(result.matchedAssetId).toBeNull();
      expect(result.matchedTicker).toBeNull();
      expect(result.bindingProposal).toBeNull();
      expect(result.justification).toContain('não localizado no catálogo de ativos locais da B3');
    });

    it('deve classificar como INVALID_IDENTIFIER se o CNPJ for inválido ou vazio', () => {
      const result = engine.resolve({
        cnpj: '123',
        legalName: 'Fundo Invalido',
      });

      expect(result.status).toBe('INVALID_IDENTIFIER');
      expect(result.matchedAssetId).toBeNull();
      expect(result.bindingProposal).toBeNull();
    });

    it('deve garantir APTO11 com os dois CNPJs (NAVI Residencial e BRIO Multiestratégia) em PENDING_REVIEW', () => {
      // Os dois CNPJs auditados para o caso APTO11:
      // 1. 42.432.327/0001-82 (NAVI Residencial FII)
      // 2. 41.081.356/0001-84 (BRIO Multiestratégia FII)
      const aptoBatch = [
        {
          cnpj: '42.432.327/0001-82',
          legalName: 'NAVI RESIDENCIAL FII',
          isin: 'BRAPTOCTF002',
        },
        {
          cnpj: '41.081.356/0001-84',
          legalName: 'BRIO MULTIESTRATEGIA FII',
          isin: 'BRAPTOCTF002',
        },
      ];

      const report = engine.resolveBatch(aptoBatch);

      expect(report.totalFundsEvaluated).toBe(2);
      expect(report.approvedBindingsCount).toBe(0); // Nenhuma aprovação automática!
      expect(report.pendingReviewBindingsCount).toBe(2); // Ambos retidos em PENDING_REVIEW!
      expect(report.ambiguousBindingsCount).toBe(0);

      const naviResult = report.results.find((r) => r.cnpj === '42432327000182');
      const brioResult = report.results.find((r) => r.cnpj === '41081356000184');

      expect(naviResult).toBeDefined();
      expect(brioResult).toBeDefined();

      expect(naviResult?.bindingProposal?.bindingStatus).toBe('PENDING_REVIEW');
      expect(naviResult?.bindingProposal?.confidenceLevel).toBe('MEDIUM');
      expect(naviResult?.bindingProposal?.justification).toContain('PENDING_REVIEW para auditoria');

      expect(brioResult?.bindingProposal?.bindingStatus).toBe('PENDING_REVIEW');
      expect(brioResult?.bindingProposal?.confidenceLevel).toBe('MEDIUM');
      expect(brioResult?.bindingProposal?.justification).toContain('PENDING_REVIEW para auditoria');
    });

    it('deve garantir a unicidade de um único APPROVED por assetId contra tentativa de sobreposição', () => {
      // HGLG11 já possui vínculo homologado (APPROVED) em existingBindings para o CNPJ 11728688000147.
      // Tentativa de outro CNPJ vincular-se a HGLG11 deve ser bloqueada.
      const result = engine.resolve({
        cnpj: '99.999.999/0001-99',
        legalName: 'FUNDO DIVERGENTE TENTANDO HGLG11',
        isin: 'BRHGLGCTF004',
      });

      expect(result.status).toBe('AMBIGUOUS_MATCH');
      expect(result.matchedAssetId).toBeNull();
      expect(result.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
      expect(result.bindingProposal?.confidenceLevel).toBe('LOW');
      expect(result.justification).toContain('Conflito cadastral por ISIN');
    });

    it('deve tratar os 7 CNPJs auditados de SPTW11 sem aprovação automática (todos retidos como AMBIGUOUS)', () => {
      // Os 7 CNPJs identificados no lote oficial da CVM de janeiro de 2026 para SPTW11:
      const sptw7Cnpjs = [
        { cnpj: '15.538.445/0001-05', legalName: 'SP DOWNTOWN FDO INV IMOB - FII', isin: 'BRSPTWCTF003' },
        { cnpj: '23.538.112/0001-04', legalName: 'SP DOWNTOWN SPE 01 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '31.145.875/0001-05', legalName: 'SP DOWNTOWN SPE 02 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '43.867.361/0001-42', legalName: 'SP DOWNTOWN SPE 03 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '43.867.799/0001-20', legalName: 'SP DOWNTOWN SPE 04 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '43.951.785/0001-90', legalName: 'SP DOWNTOWN SPE 05 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '43.951.941/0001-13', legalName: 'SP DOWNTOWN SPE 06 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
      ];

      const report = engine.resolveBatch(sptw7Cnpjs);

      expect(report.totalFundsEvaluated).toBe(7);
      expect(report.ambiguousCount).toBe(7);
      expect(report.approvedBindingsCount).toBe(0); // Nenhum é aprovado automaticamente!
      expect(report.ambiguousBindingsCount).toBe(7); // Todos retidos como AMBIGUOUS

      // Nenhum CNPJ é declarado titular definitivo
      for (const res of report.results) {
        expect(res.status).toBe('AMBIGUOUS_MATCH');
        expect(res.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
        expect(res.bindingProposal?.confidenceLevel).toBe('LOW');
        expect(res.justification).toContain('Colisão cadastral no lote');
      }
    });

    it('deve tratar os 2 CNPJs auditados de XPML11 sem aprovação automática (ambos retidos como AMBIGUOUS)', () => {
      // 2 CNPJs auditados disputando o mesmo ISIN / ativo de XPML11
      const xpmlBatch = [
        { cnpj: '28.757.546/0001-00', legalName: 'XP MALLS FDO INV IMOB - FII', isin: 'BRXPMLCTF005' },
        { cnpj: '07.583.627/0001-61', legalName: 'PENINSULA FUNDO DE INVESTIMENTO IMOBILIARIO', isin: 'BRXPMLCTF005' },
      ];

      const report = engine.resolveBatch(xpmlBatch);

      expect(report.totalFundsEvaluated).toBe(2);
      expect(report.ambiguousCount).toBe(2);
      expect(report.approvedBindingsCount).toBe(0); // Sem aprovação automática!
      expect(report.ambiguousBindingsCount).toBe(2);

      for (const res of report.results) {
        expect(res.status).toBe('AMBIGUOUS_MATCH');
        expect(res.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
        expect(res.bindingProposal?.confidenceLevel).toBe('LOW');
      }
    });

    it('deve tratar os 2 CNPJs auditados de TRXF11 sem aprovação automática (ambos retidos como AMBIGUOUS)', () => {
      // 2 CNPJs auditados disputando o mesmo ativo TRXF11 via ISIN
      const trxfBatch = [
        { cnpj: '28.548.288/0001-52', legalName: 'TRX REAL ESTATE FDO INV IMOB - FII', isin: 'BRTRXFCTF005' },
        { cnpj: '63.134.454/0001-75', legalName: 'TRXF DESENVOLVIMENTO IMOBILIARIO FII', isin: 'BRTRXFCTF005' },
      ];

      const report = engine.resolveBatch(trxfBatch);

      expect(report.totalFundsEvaluated).toBe(2);
      expect(report.ambiguousCount).toBe(2);
      expect(report.approvedBindingsCount).toBe(0); // Sem aprovação automática!
      expect(report.ambiguousBindingsCount).toBe(2);

      for (const res of report.results) {
        expect(res.status).toBe('AMBIGUOUS_MATCH');
        expect(res.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
        expect(res.bindingProposal?.confidenceLevel).toBe('LOW');
      }
    });

    it('deve detectar colisão quando múltiplos CNPJs forem associados ao mesmo assetId por métodos distintos', () => {
      const batchInput = [
        {
          cnpj: '12.005.956/0001-65', // KNRI11 via de-para
          legalName: 'KINEA RENDA IMOBILIARIA FII',
        },
        {
          cnpj: '88.888.888/0001-88', // Outro CNPJ com ISIN que deriva a raiz KNRI
          legalName: 'KINEA SEGUNDO VEICULO',
          isin: 'BRKNRICTF007',
        },
      ];

      const report = engine.resolveBatch(batchInput);

      expect(report.approvedBindingsCount).toBe(0);
      expect(report.ambiguousBindingsCount).toBe(2);
      for (const res of report.results) {
        expect(res.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
      }
    });

    it('deve ignorar ativos cujo assetType não seja fii mesmo que ticker ou raiz coincidam', () => {
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

      expect(result.status).toBe('UNMATCHED_NO_ASSET');
      expect(result.matchedAssetId).toBeNull();
      expect(result.matchedTicker).toBeNull();
      expect(result.bindingProposal).toBeNull();
    });

    it('deve garantir que um mesmo fii_registry_id (CNPJ) não pode ter dois vínculos APPROVED', () => {
      // Cenário: o mesmo CNPJ é submetido associado a dois ativos B3 distintos
      const multiAssetForSameCnpj = [
        {
          cnpj: '55.555.555/0001-55',
          legalName: 'FUNDO DUPLO ATIVO',
          isin: 'BRXPMLCTF005', // Casaria com XPML11
        },
        {
          cnpj: '55.555.555/0001-55',
          legalName: 'FUNDO DUPLO ATIVO',
          isin: 'BRTRXFCTF005', // Casaria com TRXF11
        },
      ];

      const report = engine.resolveBatch(multiAssetForSameCnpj);

      // Nenhum vínculo APPROVED é permitido para o mesmo CNPJ disputando múltiplos ativos
      expect(report.approvedBindingsCount).toBe(0);
      expect(report.ambiguousBindingsCount).toBe(2);

      for (const res of report.results) {
        expect(res.status).toBe('AMBIGUOUS_MATCH');
        expect(res.bindingProposal?.bindingStatus).toBe('AMBIGUOUS');
        expect(res.justification).toContain('o mesmo CNPJ (55555555000155) foi associado a múltiplos ativos B3');
      }
    });

    it('deve permitir que múltiplos vínculos não aprovados (PENDING_REVIEW, AMBIGUOUS, REJECTED) coexistam', () => {
      // Demonstra que para SPTW11 (7 CNPJs) e APTO11 (2 CNPJs), múltiplos vínculos coexistem para auditoria
      const nonApprovedBatch = [
        { cnpj: '15.538.445/0001-05', legalName: 'SP DOWNTOWN FDO INV IMOB - FII', isin: 'BRSPTWCTF003' },
        { cnpj: '23.538.112/0001-04', legalName: 'SP DOWNTOWN SPE 01 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '31.145.875/0001-05', legalName: 'SP DOWNTOWN SPE 02 EMPREENDIMENTOS', isin: 'BRSPTWCTF003' },
        { cnpj: '42.432.327/0001-82', legalName: 'NAVI RESIDENCIAL FII', isin: 'BRAPTOCTF002' },
        { cnpj: '41.081.356/0001-84', legalName: 'BRIO MULTIESTRATEGIA FII', isin: 'BRAPTOCTF002' },
      ];

      const report = engine.resolveBatch(nonApprovedBatch);

      // 0 vínculos APPROVED
      expect(report.approvedBindingsCount).toBe(0);
      // 3 vínculos AMBIGUOUS (SPTW11) e 2 vínculos PENDING_REVIEW (APTO11) coexistem harmonicamente
      expect(report.ambiguousBindingsCount).toBe(3);
      expect(report.pendingReviewBindingsCount).toBe(2);
      expect(report.bindingProposals.length).toBe(5);
    });

    it('deve processar um lote consolidado com métricas completas de governança', () => {
      const batchInput = [
        { cnpj: '11.728.688/0001-47', legalName: 'CSHG LOGISTICA', isin: 'BRHGLGCTF004' }, // APPROVED (existente homologado)
        { cnpj: '28.737.771/0001-85', legalName: 'XP MALLS', isin: 'BRXPMLCTF005' },       // PENDING_REVIEW (heurística unívoca sem colisão)
        { cnpj: '42.432.327/0001-82', legalName: 'NAVI RESIDENCIAL', isin: 'BRAPTOCTF002' }, // PENDING_REVIEW (APTO11 auditoria manual)
        { cnpj: '99.999.999/0001-99', legalName: 'FUNDO NÃO LISTADO' },                     // UNMATCHED_NO_ASSET
        { cnpj: 'INVALIDO', legalName: 'FUNDO CORROMPIDO' },                                 // INVALID_IDENTIFIER
      ];

      const report = engine.resolveBatch(batchInput);

      expect(report.totalFundsEvaluated).toBe(5);
      expect(report.matchedCount).toBe(3);
      expect(report.unmatchedCount).toBe(1);
      expect(report.invalidCount).toBe(1);

      // Somente o vínculo pré-existente homologado é APPROVED; correspondências heurísticas são PENDING_REVIEW
      expect(report.approvedBindingsCount).toBe(1);
      expect(report.pendingReviewBindingsCount).toBe(2);
      expect(report.ambiguousBindingsCount).toBe(0);

      expect(report.bindingProposals.length).toBe(3);
    });

    it('deve garantir que nenhuma resolução automática heurística produz status APPROVED sem homologação prévia', () => {
      // Cria um motor puro apenas com catálogo de ativos B3, SEM nenhum vínculo existente homologado
      const pureEngine = new FiiCadastralResolverEngine({
        canonicalAssets: mockCanonicalAssets,
      });

      const batch = [
        { cnpj: '28.737.771/0001-85', legalName: 'XP MALLS', isin: 'BRXPMLCTF005' },       // EXACT_ISIN
        { cnpj: '11.728.688/0001-47', legalName: 'CSHG LOGISTICA', isin: 'BRHGLGCTF004' }, // EXACT_ISIN
        { cnpj: '12.005.956/0001-65', legalName: 'KINEA RENDA', isin: 'BRKNRICTF007' },    // EXACT_ISIN
        { cnpj: '42.432.327/0001-82', legalName: 'NAVI RESIDENCIAL', isin: 'BRAPTOCTF002' }, // EXACT_ISIN
      ];

      const report = pureEngine.resolveBatch(batch);

      // Regra fundamental: ZERO aprovações automáticas
      expect(report.approvedBindingsCount).toBe(0);
      expect(report.bindingProposals.length).toBe(4);

      for (const prop of report.bindingProposals) {
        expect(prop.bindingStatus).not.toBe('APPROVED');
        expect(prop.bindingStatus).toBe('PENDING_REVIEW');
      }
    });
  });
});
