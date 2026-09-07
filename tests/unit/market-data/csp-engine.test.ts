import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  filterEligibleAssets,
  rankAssetsByMarginOfSafety,
  calculatePortfolioWeights,
  generateSuggestedPortfolio,
  CSP_DISCLAIMER,
  CSP_METHODOLOGY_VERSION,
  DEFAULT_CSP_CRITERIA,
  DEFAULT_CSP_CONSTRAINTS,
} from '@/modules/market-data/domain/csp-engine';
import {
  type CspAssetInput,
  type CspConstraints,
  type CspEligibilityCriteria,
  CspMixedAssetClassError,
  CspInfeasibleConstraintsError,
} from '@/modules/market-data/domain/csp.types';

describe('CSP Engine (Carteira Sugerida de Preços — Subetapa 5.3)', () => {
  const todayStr = new Date().toISOString().split('T')[0];

  const assetPetr4: CspAssetInput = {
    ticker: 'PETR4',
    assetClass: 'STOCK',
    sector: 'Petróleo e Gás',
    marketPrice: new Decimal('38.00'),
    theoreticalPrice: new Decimal('50.00'),
    marginOfSafetyPercent: new Decimal('31.58'), // (50 - 38) / 38 * 100
    roe: new Decimal('0.25'),
    netDebtToEbitda: new Decimal('1.20'),
    netDebtToEquity: new Decimal('0.45'),
    referenceDate: todayStr,
    dataQualityStatus: 'VALID',
  };

  const assetVale3: CspAssetInput = {
    ticker: 'VALE3',
    assetClass: 'STOCK',
    sector: 'Mineração',
    marketPrice: new Decimal('60.00'),
    theoreticalPrice: new Decimal('75.00'),
    marginOfSafetyPercent: new Decimal('25.00'), // (75 - 60) / 60 * 100
    roe: new Decimal('0.18'),
    netDebtToEbitda: new Decimal('0.80'),
    netDebtToEquity: new Decimal('0.30'),
    referenceDate: todayStr,
    dataQualityStatus: 'VALID',
  };

  const assetWege3: CspAssetInput = {
    ticker: 'WEGE3',
    assetClass: 'STOCK',
    sector: 'Bens Industriais',
    marketPrice: new Decimal('45.00'),
    theoreticalPrice: new Decimal('54.00'),
    marginOfSafetyPercent: new Decimal('20.00'), // (54 - 45) / 45 * 100
    roe: new Decimal('0.28'),
    netDebtToEbitda: new Decimal('-0.20'), // Caixa líquido
    netDebtToEquity: new Decimal('-0.10'),
    referenceDate: todayStr,
    dataQualityStatus: 'VALID',
  };

  const assetItub4: CspAssetInput = {
    ticker: 'ITUB4',
    assetClass: 'STOCK',
    sector: 'Financeiro',
    marketPrice: new Decimal('32.00'),
    theoreticalPrice: new Decimal('40.00'),
    marginOfSafetyPercent: new Decimal('25.00'), // (40 - 32) / 32 * 100
    roe: new Decimal('0.21'),
    netDebtToEbitda: null, // Bancos não apuram EBITDA convencional
    netDebtToEquity: null,
    referenceDate: todayStr,
    dataQualityStatus: 'VALID',
  };

  const assetBbas3: CspAssetInput = {
    ticker: 'BBAS3',
    assetClass: 'STOCK',
    sector: 'Financeiro',
    marketPrice: new Decimal('28.00'),
    theoreticalPrice: new Decimal('42.00'),
    marginOfSafetyPercent: new Decimal('50.00'), // (42 - 28) / 28 * 100
    roe: new Decimal('0.22'),
    netDebtToEbitda: null,
    netDebtToEquity: null,
    referenceDate: todayStr,
    dataQualityStatus: 'VALID',
  };

  // ─── 1. FILTRAGEM E ELEGIBILIDADE ──────────────────────────────────────────

  describe('1. Filtragem e Elegibilidade de Ativos', () => {
    it('filtra ativos com margem de segurança negativa ou inferior ao mínimo', () => {
      const negativeMarginAsset: CspAssetInput = {
        ...assetVale3,
        ticker: 'CARO3',
        marketPrice: new Decimal('100.00'),
        theoreticalPrice: new Decimal('80.00'),
        marginOfSafetyPercent: new Decimal('-20.00'),
      };

      const { eligible, excluded } = filterEligibleAssets(
        [assetPetr4, negativeMarginAsset],
        DEFAULT_CSP_CRITERIA
      );

      expect(eligible.map((a) => a.ticker)).toEqual(['PETR4']);
      expect(excluded.length).toBe(1);
      expect(excluded[0].ticker).toBe('CARO3');
      expect(excluded[0].reason).toBe('MARGEM_NEGATIVA');
      expect(excluded[0].detail).toContain('-20.00%');
    });

    it('filtra ativos com alavancagem de Dívida Líquida / EBITDA acima do limite', () => {
      const overLeveragedAsset: CspAssetInput = {
        ...assetPetr4,
        ticker: 'DEBT3',
        netDebtToEbitda: new Decimal('4.80'), // Superior ao teto de 3.5x
      };

      const { eligible, excluded } = filterEligibleAssets(
        [assetPetr4, overLeveragedAsset],
        DEFAULT_CSP_CRITERIA
      );

      expect(eligible.map((a) => a.ticker)).toEqual(['PETR4']);
      expect(excluded.length).toBe(1);
      expect(excluded[0].ticker).toBe('DEBT3');
      expect(excluded[0].reason).toBe('DIVIDA_ACIMA_DO_LIMITE');
      expect(excluded[0].detail).toContain('4.80x');
    });

    it('aceita ativo com cotação dentro do limite de defasagem (abaixo de maxStaleDays)', () => {
      // 3 dias de defasagem (31/12/2024 para 03/01/2025) com teto de 5 dias
      const asset3Days: CspAssetInput = {
        ...assetPetr4,
        referenceDate: '2024-12-31',
      };

      const { eligible, excluded } = filterEligibleAssets(
        [asset3Days],
        DEFAULT_CSP_CRITERIA,
        'STOCK',
        '2025-01-03'
      );

      expect(eligible.length).toBe(1);
      expect(eligible[0].ticker).toBe('PETR4');
      expect(excluded.length).toBe(0);
    });

    it('aceita ativo com cotação exatamente no limite de defasagem (igual a maxStaleDays)', () => {
      // 5 dias de defasagem (31/12/2024 para 05/01/2025) com teto de 5 dias
      const asset5Days: CspAssetInput = {
        ...assetPetr4,
        referenceDate: '2024-12-31',
      };

      const { eligible, excluded } = filterEligibleAssets(
        [asset5Days],
        DEFAULT_CSP_CRITERIA,
        'STOCK',
        '2025-01-05'
      );

      expect(eligible.length).toBe(1);
      expect(eligible[0].ticker).toBe('PETR4');
      expect(excluded.length).toBe(0);
    });

    it('filtra ativo com cotação defasada acima de maxStaleDays com cálculo determinístico de dias', () => {
      // 6 dias de defasagem (31/12/2024 para 06/01/2025) com teto de 5 dias
      const asset6Days: CspAssetInput = {
        ...assetPetr4,
        referenceDate: '2024-12-31',
      };

      const { eligible, excluded } = filterEligibleAssets(
        [asset6Days],
        DEFAULT_CSP_CRITERIA,
        'STOCK',
        '2025-01-06'
      );

      expect(eligible.length).toBe(0);
      expect(excluded.length).toBe(1);
      expect(excluded[0].ticker).toBe('PETR4');
      expect(excluded[0].reason).toBe('COTACAO_DEFASADA');
      expect(excluded[0].detail).toContain('6 dias');
      expect(excluded[0].detail).toContain('limite de 5 dias');
    });

    it('filtra ativos com cotação com status STALE mesmo que a data esteja recente', () => {
      const staleAsset: CspAssetInput = {
        ...assetWege3,
        ticker: 'OLD3',
        referenceDate: '2025-01-04',
        dataQualityStatus: 'STALE',
      };

      const { eligible, excluded } = filterEligibleAssets(
        [staleAsset],
        DEFAULT_CSP_CRITERIA,
        'STOCK',
        '2025-01-05'
      );

      expect(eligible.length).toBe(0);
      expect(excluded.length).toBe(1);
      expect(excluded[0].ticker).toBe('OLD3');
      expect(excluded[0].reason).toBe('COTACAO_DEFASADA');
      expect(excluded[0].detail).toContain('status de defasagem (STALE)');
    });

    it('filtra ativos com ROE abaixo do mínimo configurado', () => {
      const lowRoeAsset: CspAssetInput = {
        ...assetVale3,
        ticker: 'LROE3',
        roe: new Decimal('0.02'), // 2% < 5% mínimo
      };

      const { eligible, excluded } = filterEligibleAssets(
        [assetPetr4, lowRoeAsset],
        DEFAULT_CSP_CRITERIA
      );

      expect(eligible.map((a) => a.ticker)).toEqual(['PETR4']);
      expect(excluded.length).toBe(1);
      expect(excluded[0].ticker).toBe('LROE3');
      expect(excluded[0].reason).toBe('ROE_ABAIXO_DO_MINIMO');
      expect(excluded[0].detail).toContain('0.0200');
    });

    it('filtra ativos com dados contábeis incompletos ou preço teórico não positivo', () => {
      const invalidTheoryAsset: CspAssetInput = {
        ...assetPetr4,
        ticker: 'ZERO3',
        theoreticalPrice: new Decimal('0.00'),
      };

      const { eligible, excluded } = filterEligibleAssets(
        [invalidTheoryAsset],
        DEFAULT_CSP_CRITERIA
      );

      expect(eligible.length).toBe(0);
      expect(excluded[0].reason).toBe('DADOS_INCOMPLETOS');
    });
  });

  // ─── 2. SEGREGAÇÃO E HOMOGENEIDADE DE CLASSE (AJUSTE 5) ────────────────────

  describe('2. Segregação e Homogeneidade de Classe de Ativo (Ajuste 5)', () => {
    it('rejeita lote contendo classes mistas com CspMixedAssetClassError explícito', () => {
      const assetFii: CspAssetInput = {
        ticker: 'HGLG11',
        assetClass: 'FII',
        sector: 'Imobiliário Logístico',
        marketPrice: new Decimal('160.00'),
        theoreticalPrice: new Decimal('180.00'),
        marginOfSafetyPercent: new Decimal('12.50'),
        roe: null,
        netDebtToEbitda: null,
        netDebtToEquity: null,
        referenceDate: '2024-12-31',
        dataQualityStatus: 'VALID',
      };

      expect(() => {
        filterEligibleAssets([assetPetr4, assetFii], DEFAULT_CSP_CRITERIA);
      }).toThrow(CspMixedAssetClassError);

      try {
        filterEligibleAssets([assetPetr4, assetFii], DEFAULT_CSP_CRITERIA);
      } catch (err) {
        expect(err).toBeInstanceOf(CspMixedAssetClassError);
        const mixedErr = err as CspMixedAssetClassError;
        expect(mixedErr.classes).toContain('STOCK');
        expect(mixedErr.classes).toContain('FII');
        expect(mixedErr.message).toContain('CSP não admite mistura de classes de ativos');
      }
    });

    it('aceita lote homogêneo de classe única com sucesso', () => {
      const { eligible } = filterEligibleAssets(
        [assetPetr4, assetVale3, assetWege3],
        DEFAULT_CSP_CRITERIA,
        'STOCK'
      );

      expect(eligible.length).toBe(3);
    });
  });

  // ─── 3. RANQUEAMENTO DETERMINÍSTICO ────────────────────────────────────────

  describe('3. Ranqueamento Determinístico por Margem de Segurança', () => {
    it('ordena ativos em ordem decrescente de margem de segurança', () => {
      // BBAS3: 50%, PETR4: 31.58%, VALE3: 25%, WEGE3: 20%
      const ranked = rankAssetsByMarginOfSafety([
        assetWege3,
        assetPetr4,
        assetBbas3,
        assetVale3,
      ]);

      expect(ranked.map((a) => a.ticker)).toEqual(['BBAS3', 'PETR4', 'VALE3', 'WEGE3']);
    });

    it('aplica desempate secundário alfabético em caso de margens idênticas', () => {
      // ITUB4: 25.00%, VALE3: 25.00% -> 'ITUB4' vem antes de 'VALE3'
      const ranked = rankAssetsByMarginOfSafety([assetVale3, assetItub4]);

      expect(ranked[0].ticker).toBe('ITUB4');
      expect(ranked[1].ticker).toBe('VALE3');
    });
  });

  // ─── 4. PONDERAÇÃO E GARANTIA DE SOMA EXATA 100,00% ────────────────────────

  describe('4. Ponderação e Garantia de Soma Exata 100,00%', () => {
    it('calcula Equiponderação com soma de pesos identicamente igual a 100,00%', () => {
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3, assetItub4]; // 5 ativos
      const ranked = rankAssetsByMarginOfSafety(assets);
      const allocations = calculatePortfolioWeights(
        ranked,
        DEFAULT_CSP_CONSTRAINTS,
        'EQUIPONDERADA'
      );

      expect(allocations.length).toBe(5);
      for (const a of allocations) {
        expect(a.weight.toFixed(4)).toBe('0.2000'); // 20.00%
      }

      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });

    it('redistribui determinística e perfeitamente a sobra de arredondamento em divisões não exatas (ex: 3 ativos)', () => {
      // 3 ativos: 1/3 = 0.333333...
      // Pesos base: 0.3333 cada -> soma = 0.9999.
      // Sobra de 0.0001 deve ser alocada ao primeiro ativo (índice 0, BBAS3).
      const assets = [assetBbas3, assetPetr4, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const allocations = calculatePortfolioWeights(
        ranked,
        { maxWeightPerAsset: new Decimal('0.50'), maxWeightPerSector: new Decimal('0.70') },
        'EQUIPONDERADA'
      );

      expect(allocations[0].weight.toFixed(4)).toBe('0.3334');
      expect(allocations[1].weight.toFixed(4)).toBe('0.3333');
      expect(allocations[2].weight.toFixed(4)).toBe('0.3333');

      const sum = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(sum.toFixed(4)).toBe('1.0000');
    });

    it('calcula ponderação por Margem de Segurança com soma igual a 100,00%', () => {
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const allocations = calculatePortfolioWeights(
        ranked,
        { maxWeightPerAsset: new Decimal('0.50'), maxWeightPerSector: new Decimal('0.60') },
        'MARGEM_SEGURANCA'
      );

      // O ativo com maior margem (BBAS3: 50%) deve ter maior peso que o de menor (WEGE3: 20%)
      expect(allocations[0].weight.greaterThan(allocations[3].weight)).toBe(true);

      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });

    it('respeita estritamente o teto de concentração máxima por ativo (maxWeightPerAsset <= 0.3000)', () => {
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const tightAssetConstraint: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.30'), // Máximo 30.00% por ativo
        maxWeightPerSector: new Decimal('0.80'),
      };

      const allocations = calculatePortfolioWeights(
        ranked,
        tightAssetConstraint,
        'MARGEM_SEGURANCA'
      );

      for (const a of allocations) {
        expect(a.weight.lessThanOrEqualTo(new Decimal('0.3000'))).toBe(true);
      }

      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });

    it('respeita estritamente o teto de concentração máxima por setor (maxWeightPerSector <= 0.3500)', () => {
      // BBAS3 e ITUB4 são ambos do setor Financeiro
      const assets = [assetBbas3, assetItub4, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const sectorCapConstraint: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.30'),
        maxWeightPerSector: new Decimal('0.35'), // Máximo 35.00% no setor Financeiro
      };

      const allocations = calculatePortfolioWeights(
        ranked,
        sectorCapConstraint,
        'MARGEM_SEGURANCA'
      );

      const financialAllocations = allocations.filter((a) => a.sector === 'Financeiro');
      const financialWeight = financialAllocations.reduce(
        (acc, a) => acc.plus(a.weight),
        new Decimal(0)
      );

      expect(financialWeight.lessThanOrEqualTo(new Decimal('0.3500'))).toBe(true);

      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });

    it('rejeita capacidade total combinada inferior a 100% lançando CspInfeasibleConstraintsError', () => {
      // 4 ativos com cap individual de 0.20 -> capacidade máxima combinada = 4 * 0.20 = 0.80 (80.00% < 100.00%)
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const infeasibleAssetConstraint: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.20'),
        maxWeightPerSector: new Decimal('0.50'),
      };

      expect(() => {
        calculatePortfolioWeights(ranked, infeasibleAssetConstraint, 'EQUIPONDERADA');
      }).toThrow(CspInfeasibleConstraintsError);

      try {
        calculatePortfolioWeights(ranked, infeasibleAssetConstraint, 'EQUIPONDERADA');
      } catch (err) {
        expect(err).toBeInstanceOf(CspInfeasibleConstraintsError);
        const infErr = err as CspInfeasibleConstraintsError;
        expect(infErr.maxFeasibleCapacity.toFixed(2)).toBe('0.80');
        expect(infErr.message).toContain('Capacidade máxima combinada dos ativos (80.00%) é inferior a 100,00%');
      }
    });

    it('rejeita capacidade setorial combinada inferior a 100% lançando CspInfeasibleConstraintsError', () => {
      // 4 ativos: 3 em Financeiro (BBAS3, ITUB4, e outro financeiro), 1 em Bens Industriais (WEGE3).
      // maxWeightPerAsset = 0.30, maxWeightPerSector = 0.40.
      // Capacidade Financeiro: min(3 * 0.30, 0.40) = 0.40.
      // Capacidade Bens Industriais: min(1 * 0.30, 0.40) = 0.30.
      // Total combinado: 0.40 + 0.30 = 0.70 (70.00% < 100.00%).
      const assetBbdc4: CspAssetInput = {
        ...assetItub4,
        ticker: 'BBDC4',
        sector: 'Financeiro',
      };
      const assets = [assetBbas3, assetItub4, assetBbdc4, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);

      const infeasibleSectorConstraint: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.30'),
        maxWeightPerSector: new Decimal('0.40'),
      };

      expect(() => {
        calculatePortfolioWeights(ranked, infeasibleSectorConstraint, 'EQUIPONDERADA');
      }).toThrow(CspInfeasibleConstraintsError);
    });

    it('permite alocação parcial sem violação de limites quando explicitamente autorizado via allowPartialAllocation', () => {
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3]; // 4 ativos
      const ranked = rankAssetsByMarginOfSafety(assets);
      const tightConstraints: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.20'),
        maxWeightPerSector: new Decimal('0.50'),
      };

      const allocations = calculatePortfolioWeights(
        ranked,
        tightConstraints,
        'EQUIPONDERADA',
        { allowPartialAllocation: true }
      );

      expect(allocations.length).toBe(4);
      for (const a of allocations) {
        expect(a.weight.lessThanOrEqualTo(new Decimal('0.2000'))).toBe(true);
      }

      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('0.8000');
    });

    it('impede que a sobra de arredondamento seja adicionada a ativo já no teto máximo (redistribuição segura)', () => {
      // 4 ativos: BBAS3, PETR4, VALE3, WEGE3
      // Restrições: maxWeightPerAsset = 0.3000, maxWeightPerSector = 0.6000
      // BBAS3 tem maior margem e atinge o cap de 0.3000.
      // A sobra de centésimos NÃO PODE ser adicionada a BBAS3 (que iria para 0.3001),
      // devendo ser atribuída determinística e estritamente ao próximo ativo com folga.
      const assets = [assetBbas3, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const constraints: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.30'),
        maxWeightPerSector: new Decimal('0.60'),
      };

      const allocations = calculatePortfolioWeights(ranked, constraints, 'MARGEM_SEGURANCA');

      // BBAS3 deve respeitar estritamente o teto de 0.3000 (sem virar 0.3001)
      const bbasAllocation = allocations.find((a) => a.ticker === 'BBAS3')!;
      expect(bbasAllocation.weight.lessThanOrEqualTo(new Decimal('0.3000'))).toBe(true);
      expect(bbasAllocation.weight.toFixed(4)).toBe('0.3000');

      // Nenhum outro ativo pode ultrapassar 0.3000
      for (const a of allocations) {
        expect(a.weight.lessThanOrEqualTo(new Decimal('0.3000'))).toBe(true);
      }

      // Soma dos pesos é exatamente 1.0000
      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });

    it('garante preservação simultânea e estrita dos limites individual e setorial após arredondamento', () => {
      // 5 ativos: 2 no setor Financeiro (BBAS3, ITUB4), 1 Petróleo (PETR4), 1 Mineração (VALE3), 1 Bens (WEGE3).
      // maxWeightPerAsset = 0.3000, maxWeightPerSector = 0.3500.
      const assets = [assetBbas3, assetItub4, assetPetr4, assetVale3, assetWege3];
      const ranked = rankAssetsByMarginOfSafety(assets);
      const constraints: CspConstraints = {
        maxWeightPerAsset: new Decimal('0.3000'),
        maxWeightPerSector: new Decimal('0.3500'),
      };

      const allocations = calculatePortfolioWeights(ranked, constraints, 'MARGEM_SEGURANCA');

      // 1. Cada ativo individual deve ser <= 0.3000
      for (const a of allocations) {
        expect(a.weight.lessThanOrEqualTo(new Decimal('0.3000'))).toBe(true);
      }

      // 2. Setor Financeiro deve ser <= 0.3500
      const financialAllocations = allocations.filter((a) => a.sector === 'Financeiro');
      const financialSum = financialAllocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(financialSum.lessThanOrEqualTo(new Decimal('0.3500'))).toBe(true);

      // 3. Soma total = exatamente 1.0000
      const totalWeight = allocations.reduce((acc, a) => acc.plus(a.weight), new Decimal(0));
      expect(totalWeight.toFixed(4)).toBe('1.0000');
    });
  });

  // ─── 5. GOVERNANÇA, TRILHA DE AUDITORIA E ISOLAMENTO DE CARTEIRA REAL ──────

  describe('5. Governança, Trilha de Auditoria e Isolamento de Carteira Real', () => {
    it('executa generateSuggestedPortfolio como função pura sem efeitos colaterais e com disclaimer CVM', () => {
      const inputs = [assetBbas3, assetPetr4, assetVale3, assetWege3, assetItub4];
      const inputsCopy = JSON.parse(JSON.stringify(inputs));

      const result = generateSuggestedPortfolio(inputs);

      // Função pura: inputs originais não sofreram mutação
      expect(inputs.length).toBe(5);
      expect(inputs[0].ticker).toBe(inputsCopy[0].ticker);

      // Metadados de governança obrigatórios
      expect(result.methodologyVersion).toBe(CSP_METHODOLOGY_VERSION);
      expect(result.disclaimer).toBe(CSP_DISCLAIMER);
      expect(result.disclaimer).toContain('NÃO constitui recomendação de investimento');
      expect(result.disclaimer).toContain('A plataforma não mantém custódia');
      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.summary.totalEvaluated).toBe(5);
      expect(result.summary.totalEligible).toBe(5);
      expect(result.summary.totalAllocated).toBe(5);
      expect(result.summary.totalWeightAllocated.toFixed(4)).toBe('1.0000');
      expect(result.traceability.sources).toContain('CVM_DFP');
    });

    it('registra trilha de auditoria completa das exclusões no resultado', () => {
      const overDebtAsset: CspAssetInput = {
        ...assetPetr4,
        ticker: 'DIV3',
        netDebtToEbitda: new Decimal('6.00'),
      };
      const negMarginAsset: CspAssetInput = {
        ...assetVale3,
        ticker: 'NEG3',
        marginOfSafetyPercent: new Decimal('-10.00'),
      };

      const result = generateSuggestedPortfolio([assetBbas3, overDebtAsset, negMarginAsset], {
        constraints: {
          maxWeightPerAsset: new Decimal('1.00'),
          maxWeightPerSector: new Decimal('1.00'),
        },
      });

      expect(result.allocations.length).toBe(1);
      expect(result.allocations[0].ticker).toBe('BBAS3');
      expect(result.allocations[0].weight.toFixed(4)).toBe('1.0000');

      expect(result.excludedAssets.length).toBe(2);
      expect(result.excludedAssets.map((e) => e.ticker)).toContain('DIV3');
      expect(result.excludedAssets.map((e) => e.ticker)).toContain('NEG3');
    });

    it('retorna resultado vazio seguro quando nenhum ativo atende os critérios', () => {
      const badAsset: CspAssetInput = {
        ...assetPetr4,
        marginOfSafetyPercent: new Decimal('-50.00'),
      };

      const result = generateSuggestedPortfolio([badAsset]);

      expect(result.allocations.length).toBe(0);
      expect(result.excludedAssets.length).toBe(1);
      expect(result.summary.totalAllocated).toBe(0);
      expect(result.summary.totalWeightAllocated.toFixed(4)).toBe('0.0000');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
    });

    it('retorna estrutura segura quando a lista de inputs estiver vazia', () => {
      const result = generateSuggestedPortfolio([]);

      expect(result.allocations.length).toBe(0);
      expect(result.excludedAssets.length).toBe(0);
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
    });
  });
});
