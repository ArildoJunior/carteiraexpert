import { describe, expect, it } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  parseCvmCapitalCompositionStream,
  resolveSharesCountByClass,
} from '@/modules/market-data/domain/cvm-capital-composition-parser';
import {
  convertStatementToFundamentals,
  adaptAggregatedStatementToRawStatement,
} from '@/modules/market-data/domain/cvm-fundamentals-engine';
import {
  CvmInvalidHeaderError,
  isValidCalendarDate,
  parseStrictPositiveInteger,
  type CvmCapitalCompositionData,
} from '@/modules/market-data/domain/cvm-parser.types';
import type { CvmRawStatementData } from '@/modules/market-data/domain/cvm-fundamentals.types';
import {
  isCvmShareClass,
  parseCvmShareClass,
  type CvmShareClass,
  type ResolvedAssetTarget,
} from '@/modules/market-data/domain/cvm-binding.types';

describe('CVM Capital Composition & Shares Count Resolution (Unit - Etapa 2)', () => {
  const sampleComposition: CvmCapitalCompositionData = {
    cnpj: '33000167000101',
    referenceDate: '2024-12-31',
    version: 1,
    companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
    ordinaryShares: new Decimal('7442454142'),
    preferredShares: new Decimal('5602042788'),
    totalShares: new Decimal('13044496930'),
  };

  const sampleContext = {
    cnpj: '33000167000101',
    referenceDate: '2024-12-31',
    version: 1,
  };

  describe('Validação Estrita de Calendário e Versão (isValidCalendarDate & parseStrictPositiveInteger)', () => {
    it('deve validar datas calendariamente corretas incluindo anos bissextos', () => {
      expect(isValidCalendarDate('2024-12-31')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 é bissexto
      expect(isValidCalendarDate('2020-02-29')).toBe(true); // 2020 é bissexto
      expect(isValidCalendarDate('2024-01-01')).toBe(true);
      expect(isValidCalendarDate('2024-04-30')).toBe(true);
    });

    it('deve rejeitar datas inexistentes ou inválidas no calendário', () => {
      expect(isValidCalendarDate('2023-02-29')).toBe(false); // 2023 não é bissexto
      expect(isValidCalendarDate('2024-02-30')).toBe(false); // Fevereiro nunca tem 30 dias
      expect(isValidCalendarDate('2024-02-31')).toBe(false);
      expect(isValidCalendarDate('2024-04-31')).toBe(false); // Abril tem 30 dias
      expect(isValidCalendarDate('2024-06-31')).toBe(false); // Junho tem 30 dias
      expect(isValidCalendarDate('2024-09-31')).toBe(false); // Setembro tem 30 dias
      expect(isValidCalendarDate('2024-11-31')).toBe(false); // Novembro tem 30 dias
      expect(isValidCalendarDate('2024-13-01')).toBe(false); // Mês 13
      expect(isValidCalendarDate('2024-00-15')).toBe(false); // Mês 0
      expect(isValidCalendarDate('2024-05-00')).toBe(false); // Dia 0
      expect(isValidCalendarDate('2024-05-32')).toBe(false); // Dia 32
      expect(isValidCalendarDate(null)).toBe(false);
      expect(isValidCalendarDate('')).toBe(false);
      expect(isValidCalendarDate('abc')).toBe(false);
      expect(isValidCalendarDate('2024-02-29abc')).toBe(false);
    });

    it('deve aceitar inteiros decimais estritamente positivos para VERSAO', () => {
      expect(parseStrictPositiveInteger('1')).toBe(1);
      expect(parseStrictPositiveInteger('2')).toBe(2);
      expect(parseStrictPositiveInteger(' 10 ')).toBe(10);
      expect(parseStrictPositiveInteger('99')).toBe(99);
    });

    it('deve rejeitar VERSAO contendo caracteres não numéricos como "1abc"', () => {
      expect(parseStrictPositiveInteger('1abc')).toBeNull();
      expect(parseStrictPositiveInteger('v1')).toBeNull();
      expect(parseStrictPositiveInteger('1.0')).toBeNull();
      expect(parseStrictPositiveInteger('1.5')).toBeNull();
      expect(parseStrictPositiveInteger('1e5')).toBeNull();
      expect(parseStrictPositiveInteger('0')).toBeNull();
      expect(parseStrictPositiveInteger('-1')).toBeNull();
      expect(parseStrictPositiveInteger('')).toBeNull();
      expect(parseStrictPositiveInteger(null)).toBeNull();
      expect(parseStrictPositiveInteger(undefined)).toBeNull();
    });
  });

  describe('Type Guards e Tipos Estritos de ShareClass (isCvmShareClass & parseCvmShareClass)', () => {
    it('deve validar corretamente as classes homologadas CVM', () => {
      expect(isCvmShareClass('ON')).toBe(true);
      expect(isCvmShareClass('PN')).toBe(true);
      expect(isCvmShareClass('PNA')).toBe(true);
      expect(isCvmShareClass('PNB')).toBe(true);
      expect(isCvmShareClass('UNT')).toBe(true);

      expect(parseCvmShareClass('ON')).toBe('ON');
      expect(parseCvmShareClass('PN')).toBe('PN');
      expect(parseCvmShareClass('UNT')).toBe('UNT');
    });

    it('deve rejeitar valores inválidos sem uso de coerção insegura (as any)', () => {
      expect(isCvmShareClass('ORD')).toBe(false);
      expect(isCvmShareClass('XYZ')).toBe(false);
      expect(isCvmShareClass('')).toBe(false);
      expect(isCvmShareClass(null)).toBe(false);
      expect(isCvmShareClass(undefined)).toBe(false);
      expect(isCvmShareClass(123)).toBe(false);

      expect(parseCvmShareClass('ORD')).toBeNull();
      expect(parseCvmShareClass('XYZ')).toBeNull();
      expect(parseCvmShareClass(null)).toBeNull();
    });
  });

  describe('Resolução Estrita de shares_count por Classe do Ativo (resolveSharesCountByClass)', () => {
    it('deve selecionar estritamente a quantidade ordinária quando shareClass for ON', () => {
      const result = resolveSharesCountByClass(sampleComposition, 'ON', sampleContext);
      expect(result).not.toBeNull();
      expect(result?.toString()).toBe('7442454142');
      expect(result instanceof Decimal).toBe(true);
    });

    it('deve selecionar estritamente a quantidade preferencial quando shareClass for PN', () => {
      const result = resolveSharesCountByClass(sampleComposition, 'PN', sampleContext);
      expect(result).not.toBeNull();
      expect(result?.toString()).toBe('5602042788');
      expect(result instanceof Decimal).toBe(true);
    });

    it('deve selecionar a quantidade preferencial quando shareClass for PNA ou PNB', () => {
      const resultA = resolveSharesCountByClass(sampleComposition, 'PNA', sampleContext);
      expect(resultA?.toString()).toBe('5602042788');

      const resultB = resolveSharesCountByClass(sampleComposition, 'PNB', sampleContext);
      expect(resultB?.toString()).toBe('5602042788');
    });

    it('deve selecionar a quantidade total quando shareClass for UNT (Unit)', () => {
      const result = resolveSharesCountByClass(sampleComposition, 'UNT', sampleContext);
      expect(result?.toString()).toBe('13044496930');
    });

    it('deve retornar null quando a classe de ação for ausente, vazia ou nula', () => {
      expect(resolveSharesCountByClass(sampleComposition, null, sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(sampleComposition, undefined, sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(sampleComposition, '', sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(sampleComposition, '   ', sampleContext)).toBeNull();
    });

    it('deve retornar null quando a classe de ação for desconhecida ou ambígua (sem fallback)', () => {
      expect(resolveSharesCountByClass(sampleComposition, 'XYZ', sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(sampleComposition, 'ORD_INVAL', sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(sampleComposition, 'CUSTOM', sampleContext)).toBeNull();
    });

    it('NÃO deve fazer fallback para total quando ativo for ON ou PN', () => {
      const compSemOn: CvmCapitalCompositionData = {
        ...sampleComposition,
        ordinaryShares: null,
      };
      // ON não pode fazer fallback para totalShares!
      expect(resolveSharesCountByClass(compSemOn, 'ON', sampleContext)).toBeNull();

      const compSemPn: CvmCapitalCompositionData = {
        ...sampleComposition,
        preferredShares: null,
      };
      // PN não pode fazer fallback para totalShares ou ordinaryShares!
      expect(resolveSharesCountByClass(compSemPn, 'PN', sampleContext)).toBeNull();

      const compSemTotal: CvmCapitalCompositionData = {
        ...sampleComposition,
        totalShares: null,
      };
      expect(resolveSharesCountByClass(compSemTotal, 'UNT', sampleContext)).toBeNull();
    });

    it('deve preservar estritamente Decimal(0) quando a companhia declarar zero ações para a classe', () => {
      const compNovoMercado: CvmCapitalCompositionData = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
        ordinaryShares: new Decimal('15757657000'),
        preferredShares: new Decimal(0), // Companhia sem ações PN
        totalShares: new Decimal('15757657000'),
      };
      const context = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
      };

      const resultPn = resolveSharesCountByClass(compNovoMercado, 'PN', context);
      expect(resultPn).not.toBeNull();
      expect(resultPn?.isZero()).toBe(true);
      expect(resultPn?.toString()).toBe('0');
    });

    it('deve retornar null quando a composição for nula ou inexistente', () => {
      expect(resolveSharesCountByClass(null, 'ON', sampleContext)).toBeNull();
      expect(resolveSharesCountByClass(undefined, 'ON', sampleContext)).toBeNull();
    });

    it('deve rejeitar e retornar null se houver incompatibilidade de CNPJ da companhia', () => {
      const contextDivergente = {
        ...sampleContext,
        cnpj: '99999999000199', // CNPJ divergente
      };
      expect(resolveSharesCountByClass(sampleComposition, 'ON', contextDivergente)).toBeNull();
    });

    it('deve rejeitar e retornar null se houver incompatibilidade de data de referência (período)', () => {
      const contextDivergente = {
        ...sampleContext,
        referenceDate: '2023-12-31', // Exercício divergente
      };
      expect(resolveSharesCountByClass(sampleComposition, 'ON', contextDivergente)).toBeNull();
    });

    it('deve rejeitar e retornar null se houver incompatibilidade de versão do reporte', () => {
      const contextDivergente = {
        ...sampleContext,
        version: 2, // Composição v1 vs Balanço v2
      };
      expect(resolveSharesCountByClass(sampleComposition, 'ON', contextDivergente)).toBeNull();
    });

    it('deve preservar precisão Decimal pura sem aplicar qualquer escala arbitrária ou heurística', () => {
      const compPrecisao: CvmCapitalCompositionData = {
        cnpj: '33000167000101',
        referenceDate: '2024-12-31',
        version: 1,
        ordinaryShares: new Decimal('123456789012345678'),
        preferredShares: new Decimal('987654321098765432'),
        totalShares: new Decimal('1111111110111111110'),
      };
      const result = resolveSharesCountByClass(compPrecisao, 'ON', sampleContext);
      expect(result?.toString()).toBe('123456789012345678');
    });
  });

  describe('Streaming Parser de Composição de Capital (parseCvmCapitalCompositionStream)', () => {
    it('deve parsear stream CSV oficial com cabeçalho CVM, extraindo ON, PN e TOTAL em Decimal', async () => {
      async function* mockStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;QT_ACAO_ORDIN_CAP_INTEGR;QT_ACAO_PREF_CAP_INTEGR;QT_ACAO_TOTAL_CAP_INTEGR;QT_ACAO_ORDIN_TESOURO;QT_ACAO_PREF_TESOURO;QT_ACAO_TOTAL_TESOURO';
        yield '33.000.167/0001-01;2024-12-31;1;PETROLEO BRASILEIRO S.A. PETROBRAS;7442454142;5602042788;13044496930;22786568;0;22786568';
        yield '07.526.557/0001-00;2024-12-31;2;AMBEV S.A.;15757657000;0;15757657000;0;0;0';
      }

      const rows: CvmCapitalCompositionData[] = [];
      for await (const row of parseCvmCapitalCompositionStream(mockStream())) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);

      // Petrobras
      expect(rows[0].cnpj).toBe('33000167000101');
      expect(rows[0].referenceDate).toBe('2024-12-31');
      expect(rows[0].version).toBe(1);
      expect(rows[0].ordinaryShares?.toString()).toBe('7442454142');
      expect(rows[0].preferredShares?.toString()).toBe('5602042788');
      expect(rows[0].totalShares?.toString()).toBe('13044496930');

      // Ambev
      expect(rows[1].cnpj).toBe('07526557000100');
      expect(rows[1].version).toBe(2);
      expect(rows[1].ordinaryShares?.toString()).toBe('15757657000');
      expect(rows[1].preferredShares?.toString()).toBe('0');
      expect(rows[1].preferredShares?.isZero()).toBe(true);
      expect(rows[1].totalShares?.toString()).toBe('15757657000');
    });

    it('deve lançar CvmInvalidHeaderError quando o cabeçalho não contiver colunas obrigatórias', async () => {
      async function* invalidStream() {
        yield 'COLUNA_A;COLUNA_B;COLUNA_C';
        yield '1;2;3';
      }
      const iterator = parseCvmCapitalCompositionStream(invalidStream());
      await expect(iterator.next()).rejects.toThrow(CvmInvalidHeaderError);
    });

    it('deve descartar linhas corrompidas com CNPJ inválido ou campos não numéricos', async () => {
      async function* corruptedStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;QT_ACAO_ORDIN_CAP_INTEGR;QT_ACAO_PREF_CAP_INTEGR;QT_ACAO_TOTAL_CAP_INTEGR;QT_ACAO_ORDIN_TESOURO;QT_ACAO_PREF_TESOURO;QT_ACAO_TOTAL_TESOURO';
        // CNPJ inválido
        yield 'INVALID_CNPJ;2024-12-31;1;CIA;1000;0;1000;0;0;0';
        // Quantidade não numérica
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;CORROMPIDO;0;1000;0;0;0';
        // Versão inválida
        yield '33.000.167/0001-01;2024-12-31;NOT_A_NUM;PETROBRAS;1000;0;1000;0;0;0';
      }

      const rows: CvmCapitalCompositionData[] = [];
      for await (const row of parseCvmCapitalCompositionStream(corruptedStream())) {
        rows.push(row);
      }
      expect(rows).toHaveLength(0);
    });

    it('deve descartar linhas com VERSAO parcial como "1abc" ou data calendariamente impossível como "2024-02-31"', async () => {
      async function* invalidVersionAndDateStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;QT_ACAO_ORDIN_CAP_INTEGR;QT_ACAO_PREF_CAP_INTEGR;QT_ACAO_TOTAL_CAP_INTEGR;QT_ACAO_ORDIN_TESOURO;QT_ACAO_PREF_TESOURO;QT_ACAO_TOTAL_TESOURO';
        // VERSAO = '1abc' (antigo parseInt aceitava como 1, mas agora é rejeitado estritamente)
        yield '33.000.167/0001-01;2024-12-31;1abc;PETROBRAS;7442454142;5602042788;13044496930;0;0;0';
        // DT_REFER = '2024-02-31' (data inexistente no calendário)
        yield '33.000.167/0001-01;2024-02-31;1;PETROBRAS;7442454142;5602042788;13044496930;0;0;0';
        // Linha válida
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;7442454142;5602042788;13044496930;0;0;0';
      }

      const rows: CvmCapitalCompositionData[] = [];
      for await (const row of parseCvmCapitalCompositionStream(invalidVersionAndDateStream())) {
        rows.push(row);
      }
      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(1);
      expect(rows[0].referenceDate).toBe('2024-12-31');
    });
  });

  describe('Integração com convertStatementToFundamentals', () => {
    const sampleRawStatement: CvmRawStatementData = {
      cnpj: '33000167000101',
      cvmCode: '009512',
      companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
      referenceDate: '2024-12-31',
      periodType: 'annual',
      statementType: 'CONSOLIDATED',
      exerciseOrder: 'ÚLTIMO',
      version: 1,
      accounts: new Map<string, Decimal>([
        ['1', new Decimal('1065000000000.0000')],
        ['2.03', new Decimal('485000000000.0000')],
        ['3.01', new Decimal('511000000000.0000')],
        ['3.11', new Decimal('124600000000.0000')],
        ['1.01.01', new Decimal('50000000000.0000')],
        ['2.01.04', new Decimal('30000000000.0000')],
        ['2.02.01', new Decimal('250000000000.0000')],
        ['3.99', new Decimal('9.54')], // Conta 3.99 reportada como LPA em R$/ação, JAMAIS sharesCount!
      ]),
      capitalComposition: sampleComposition,
      sourceReference: JSON.stringify({ source: 'cvm_dfp' }),
    };

    it('deve resolver sharesCount com a classe informada em options ({ shareClass: "ON" })', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement, { shareClass: 'ON' });
      expect(converted.sharesCount?.toString()).toBe('7442454142');
      // Garante que a conta 3.99 não foi utilizada
      expect(converted.sharesCount?.toString()).not.toBe('9.54');
    });

    it('deve resolver sharesCount com a classe informada em options ({ shareClass: "PN" })', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement, { shareClass: 'PN' });
      expect(converted.sharesCount?.toString()).toBe('5602042788');
    });

    it('deve manter sharesCount como null se options.shareClass não for informada', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement);
      expect(converted.sharesCount).toBeNull();
    });

    it('deve manter ebitda e dividendsDeclared como null na Etapa 2', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement, { shareClass: 'ON' });
      expect(converted.ebitda).toBeNull();
      expect(converted.dividendsDeclared).toBeNull();
    });

    it('deve preservar integridade dos campos da Etapa 1 (grossDebt, cashEquivalents, netDebt)', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement, { shareClass: 'ON' });
      expect(converted.cashEquivalents?.toString()).toBe('50000000000');
      expect(converted.grossDebt?.toString()).toBe('280000000000');
      expect(converted.netDebt?.toString()).toBe('230000000000');
    });

    it('deve preservar capitalComposition no ConvertedFundamentals para resolução contextual posterior', () => {
      const converted = convertStatementToFundamentals(sampleRawStatement);
      expect(converted.capitalComposition).toBeDefined();
      expect(converted.capitalComposition?.ordinaryShares?.toString()).toBe('7442454142');
      expect(converted.capitalComposition?.preferredShares?.toString()).toBe('5602042788');
    });

    it('deve propagar capitalComposition através de adaptAggregatedStatementToRawStatement', () => {
      const aggregated = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual' as const,
        statementType: 'CONSOLIDATED' as const,
        exerciseOrder: 'ÚLTIMO' as const,
        version: 1,
        netRevenue: new Decimal('511000000000'),
        netIncome: new Decimal('124600000000'),
        totalEquity: new Decimal('485000000000'),
        totalAssets: new Decimal('1065000000000'),
        grossDebt: new Decimal('280000000000'),
        cashEquivalents: new Decimal('50000000000'),
        shortTermDebt: new Decimal('30000000000'),
        longTermDebt: new Decimal('250000000000'),
        capitalComposition: sampleComposition,
        sharesCount: null,
        ebitda: null,
        dividendsDeclared: null,
        sourceReference: JSON.stringify({ source: 'cvm_dfp' }),
      };

      const raw = adaptAggregatedStatementToRawStatement(aggregated);
      expect(raw.capitalComposition).toBe(sampleComposition);

      const converted = convertStatementToFundamentals(raw, { shareClass: 'PN' });
      expect(converted.sharesCount?.toString()).toBe('5602042788');
    });
  });

  describe('Resolução Determinística para Ativos Alvo (ResolvedAssetTarget - Sem Persistência)', () => {
    const targetPetr3: ResolvedAssetTarget = {
      assetId: '00000000-0000-0000-0000-000000000001',
      ticker: 'PETR3',
      assetType: 'STOCK',
      shareClass: 'ON',
      bindingId: 'b0000000-0000-0000-0000-000000000001',
    };

    const targetPetr4: ResolvedAssetTarget = {
      assetId: '00000000-0000-0000-0000-000000000002',
      ticker: 'PETR4',
      assetType: 'STOCK',
      shareClass: 'PN',
      bindingId: 'b0000000-0000-0000-0000-000000000002',
    };

    const targetKlbn11: ResolvedAssetTarget = {
      assetId: '00000000-0000-0000-0000-000000000003',
      ticker: 'KLBN11',
      assetType: 'STOCK',
      shareClass: 'UNT',
      bindingId: 'b0000000-0000-0000-0000-000000000003',
    };

    const targetSemClasse: ResolvedAssetTarget = {
      assetId: '00000000-0000-0000-0000-000000000004',
      ticker: 'ATIVO3',
      assetType: 'STOCK',
      shareClass: null,
      bindingId: 'b0000000-0000-0000-0000-000000000004',
    };

    it('deve resolver shares_count como ordinaryShares para alvo PETR3 (ON)', () => {
      const sharesCount = targetPetr3.shareClass
        ? resolveSharesCountByClass(sampleComposition, targetPetr3.shareClass, sampleContext)
        : null;

      expect(sharesCount).not.toBeNull();
      expect(sharesCount?.toString()).toBe('7442454142');
    });

    it('deve resolver shares_count como preferredShares para alvo PETR4 (PN)', () => {
      const sharesCount = targetPetr4.shareClass
        ? resolveSharesCountByClass(sampleComposition, targetPetr4.shareClass, sampleContext)
        : null;

      expect(sharesCount).not.toBeNull();
      expect(sharesCount?.toString()).toBe('5602042788');
    });

    it('deve resolver shares_count como totalShares para alvo Unit KLBN11 (UNT)', () => {
      const sharesCount = targetKlbn11.shareClass
        ? resolveSharesCountByClass(sampleComposition, targetKlbn11.shareClass, sampleContext)
        : null;

      expect(sharesCount).not.toBeNull();
      expect(sharesCount?.toString()).toBe('13044496930');
    });

    it('deve retornar null se o alvo não possuir shareClass homologada (sem fallback)', () => {
      const sharesCount = targetSemClasse.shareClass
        ? resolveSharesCountByClass(sampleComposition, targetSemClasse.shareClass, sampleContext)
        : null;

      expect(sharesCount).toBeNull();
    });

    it('deve retornar null se houver incompatibilidade entre o demonstrativo contábil e a composição acionária', () => {
      const contextIncompativel = {
        cnpj: sampleContext.cnpj,
        referenceDate: '2023-12-31', // Ano divergente
        version: sampleContext.version,
      };

      const sharesCount = targetPetr3.shareClass
        ? resolveSharesCountByClass(sampleComposition, targetPetr3.shareClass, contextIncompativel)
        : null;

      expect(sharesCount).toBeNull();
    });
  });

  describe('Calibração Determinística de Escala (Ambev x Petrobras x Casos de Borda)', () => {
    const ambevComposition: CvmCapitalCompositionData = {
      cnpj: '07526557000100',
      referenceDate: '2024-12-31',
      version: 1,
      companyLegalName: 'AMBEV S.A.',
      ordinaryShares: new Decimal('15757657'),
      preferredShares: new Decimal('0'),
      totalShares: new Decimal('15757657'),
    };

    const petrobrasComposition: CvmCapitalCompositionData = {
      cnpj: '33000167000101',
      referenceDate: '2024-12-31',
      version: 1,
      companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
      ordinaryShares: new Decimal('7442454142'),
      preferredShares: new Decimal('5602042788'),
      totalShares: new Decimal('13044496930'),
    };

    it('deve calibrar a escala da Ambev (x1000) usando o LPA oficial da DRE (3.99.01.01)', () => {
      const ambevContext = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
        netIncome: new Decimal('14458428000'), // R$ 14,46 bilhões
        officialLpa: new Decimal('0.91755'), // R$ 0,91755 / ação
        totalEquity: new Decimal('99579693000'), // R$ 99,58 bilhões
      };

      const shares = resolveSharesCountByClass(ambevComposition, 'ON', ambevContext);
      expect(shares).not.toBeNull();
      expect(shares?.toString()).toBe('15757657000');
    });

    it('deve preservar a escala unitária da Petrobras (x1) sem multiplicar por 1000', () => {
      const petrContext = {
        cnpj: '33000167000101',
        referenceDate: '2024-12-31',
        version: 1,
        netIncome: new Decimal('124600000000'),
        officialLpa: new Decimal('9.5523'),
        totalEquity: new Decimal('485000000000'),
      };

      const sharesON = resolveSharesCountByClass(petrobrasComposition, 'ON', petrContext);
      expect(sharesON).not.toBeNull();
      expect(sharesON?.toString()).toBe('7442454142');

      const sharesPN = resolveSharesCountByClass(petrobrasComposition, 'PN', petrContext);
      expect(sharesPN).not.toBeNull();
      expect(sharesPN?.toString()).toBe('5602042788');
    });

    it('deve retornar null para empresa sem ações declaradas ou composição ausente', () => {
      const missingComposition: CvmCapitalCompositionData = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'SEM ACOES S.A.',
        ordinaryShares: null,
        preferredShares: null,
        totalShares: null,
      };

      const context = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
      };

      expect(resolveSharesCountByClass(missingComposition, 'ON', context)).toBeNull();
      expect(resolveSharesCountByClass(missingComposition, 'PN', context)).toBeNull();
      expect(resolveSharesCountByClass(missingComposition, 'UNT', context)).toBeNull();
      expect(resolveSharesCountByClass(null, 'ON', context)).toBeNull();
    });

    it('deve aplicar calibração por VPA quando LPA oficial não estiver disponível mas VPA for anômalo (> 1000)', () => {
      const ambevContextSemLpa = {
        cnpj: '07526557000100',
        referenceDate: '2024-12-31',
        version: 1,
        netIncome: new Decimal('14458428000'),
        totalEquity: new Decimal('99579693000'), // PL ~99,58 bi / 15.757.657 = VPA 6319 > 1000
      };

      const shares = resolveSharesCountByClass(ambevComposition, 'ON', ambevContextSemLpa);
      expect(shares).not.toBeNull();
      expect(shares?.toString()).toBe('15757657000');
    });

    it('deve integrar calibração ao fluxo completo de convertStatementToFundamentals', () => {
      const rawAmbev: CvmRawStatementData = {
        cnpj: '07526557000100',
        cvmCode: '023264',
        companyLegalName: 'AMBEV S.A.',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        filingDate: '2025-02-27',
        accounts: new Map<string, Decimal>([
          ['1', new Decimal('141203875000')],
          ['2.03', new Decimal('99579693000')],
          ['3.01', new Decimal('84323565000')],
          ['3.11', new Decimal('14458428000')],
          ['3.99.01.01', new Decimal('0.91755')],
        ]),
        capitalComposition: ambevComposition,
        officialLpa: new Decimal('0.91755'),
        sourceReference: JSON.stringify({ source: 'cvm_dfp' }),
      };

      const converted = convertStatementToFundamentals(rawAmbev, { shareClass: 'ON' });
      expect(converted.sharesCount?.toString()).toBe('15757657000');
      expect(converted.officialLpa?.toString()).toBe('0.91755');
    });
  });
});

