import { describe, expect, it } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  adaptAggregatedStatementToRawStatement,
  convertStatementToFundamentals,
  formatReferencePeriod,
  isDeclaredDividendsAccount,
  isOperatingDepreciationAmortization,
  selectStatementsForPublication,
  validateFinancialSanity,
} from '@/modules/market-data/domain/cvm-fundamentals-engine';
import {
  CvmFinancialSanityError,
  CvmIncompleteStatementError,
  type CvmDmplOriginEvidence,
  type CvmRawStatementData,
} from '@/modules/market-data/domain/cvm-fundamentals.types';
import type { CvmAggregatedStatement } from '@/modules/market-data/domain/cvm-parser.types';

describe('CVM Fundamentals Conversion Engine (Unit)', () => {
  const sampleValidStatement: CvmRawStatementData = {
    cnpj: '33000167000101',
    cvmCode: '009512',
    companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
    referenceDate: '2024-12-31',
    periodType: 'annual',
    statementType: 'CONSOLIDATED',
    exerciseOrder: 'ÚLTIMO',
    version: 1,
    filingDate: '2025-03-01',
    accounts: new Map<string, Decimal>([
      ['1', new Decimal('1065000000000.0000')],       // Ativo Total
      ['1.01', new Decimal('200000000000.0000')],     // Ativo Circulante
      ['1.01.01', new Decimal('50000000000.0000')],   // Caixa e Equivalentes
      ['2.01', new Decimal('180000000000.0000')],     // Passivo Circulante
      ['2.01.04', new Decimal('30000000000.0000')],   // Empréstimos e Financiamentos CP
      ['2.02', new Decimal('400000000000.0000')],     // Passivo Não Circulante
      ['2.02.01', new Decimal('250000000000.0000')],  // Empréstimos e Financiamentos LP
      ['2.03', new Decimal('485000000000.0000')],     // Patrimônio Líquido
      ['3.01', new Decimal('511000000000.0000')],     // Receita Líquida
      ['3.03', new Decimal('190000000000.0000')],     // EBIT
      ['3.11', new Decimal('124600000000.0000')],     // Lucro Líquido
    ]),
    sourceReference: JSON.stringify({
      source: 'cvm_dfp',
      fileId: 'a0000000-0000-4000-8000-000000000001',
      runId: 'b0000000-0000-4000-8000-000000000002',
      parserVersion: '1.0.0',
    }),
  };

  describe('Formatação de Período', () => {
    it('deve formatar data anual para YYYY-FY', () => {
      expect(formatReferencePeriod('2024-12-31', 'annual')).toBe('2024-FY');
      expect(formatReferencePeriod('2023-12-31')).toBe('2023-FY');
    });

    it('deve rejeitar data inválida', () => {
      expect(() => formatReferencePeriod('invalid')).toThrow(CvmFinancialSanityError);
    });
  });

  describe('Conversão e Mapeamento de Contas Contábeis', () => {
    it('deve mapear contas obrigatórias e cálculos com precisão Decimal', () => {
      const converted = convertStatementToFundamentals(sampleValidStatement);

      expect(converted.referencePeriod).toBe('2024-FY');
      expect(converted.periodType).toBe('annual');
      expect(converted.statementType).toBe('CONSOLIDATED');
      expect(converted.isRestated).toBe(false);
      expect(converted.version).toBe(1);

      // Fatos contábeis principais
      expect(converted.totalAssets.toString()).toBe('1065000000000');
      expect(converted.totalEquity.toString()).toBe('485000000000');
      expect(converted.netRevenue.toString()).toBe('511000000000');
      expect(converted.netIncome.toString()).toBe('124600000000');
      expect(converted.ebitda).toBeNull(); // EBITDA mantido estritamente null na Etapa 1 (aguardando DFC na Etapa 3)
      expect(converted.sharesCount).toBeNull(); // Não lê da conta 3.99
      expect(converted.dividendsDeclared).toBeNull(); // Aguardando DMPL na Etapa 4
      expect(converted.cashEquivalents?.toString()).toBe('50000000000');

      // Dívida Bruta = 2.01.04 (30bi) + 2.02.01 (250bi) = 280bi
      expect(converted.grossDebt?.toString()).toBe('280000000000');

      // Dívida Líquida = 280bi - 50bi = 230bi
      expect(converted.netDebt?.toString()).toBe('230000000000');
    });

    it('deve aceitar conta 3.09 como fallback quando 3.11 não estiver presente', () => {
      const stmtWith309 = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmtWith309.accounts.delete('3.11');
      stmtWith309.accounts.set('3.09', new Decimal('88000000000.0000'));

      const converted = convertStatementToFundamentals(stmtWith309);
      expect(converted.netIncome.toString()).toBe('88000000000');
    });

    it('deve marcar isRestated como true quando version > 1', () => {
      const stmtV2 = {
        ...sampleValidStatement,
        version: 2,
      };
      const converted = convertStatementToFundamentals(stmtV2);
      expect(converted.version).toBe(2);
      expect(converted.isRestated).toBe(true);
    });

    it('deve preservar Decimal(0) para contas presentes com saldo zero sem converter para null', () => {
      const stmtZero = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmtZero.accounts.set('1.01.01', new Decimal(0));
      stmtZero.accounts.set('2.01.04', new Decimal(0));
      stmtZero.accounts.set('2.02.01', new Decimal('50000000000.0000'));

      const converted = convertStatementToFundamentals(stmtZero);
      expect(converted.cashEquivalents).not.toBeNull();
      expect(converted.cashEquivalents?.isZero()).toBe(true);
      expect(converted.grossDebt?.toString()).toBe('50000000000');
      // netDebt = 50bi - 0 = 50bi
      expect(converted.netDebt?.toString()).toBe('50000000000');
    });
  });

  describe('Regras Estritas de Dívida Bruta e Dívida Líquida', () => {
    it('deve definir grossDebt e netDebt como null se faltar subconta 2.01.04 (CP)', () => {
      const stmt = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmt.accounts.delete('2.01.04');

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.grossDebt).toBeNull();
      expect(converted.netDebt).toBeNull();
    });

    it('deve definir grossDebt e netDebt como null se faltar subconta 2.02.01 (LP)', () => {
      const stmt = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmt.accounts.delete('2.02.01');

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.grossDebt).toBeNull();
      expect(converted.netDebt).toBeNull();
    });

    it('deve definir netDebt como null se grossDebt estiver presente mas cashEquivalents faltar', () => {
      const stmt = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmt.accounts.delete('1.01.01');

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.grossDebt?.toString()).toBe('280000000000');
      expect(converted.cashEquivalents).toBeNull();
      expect(converted.netDebt).toBeNull();
    });
  });

  describe('Sanity Checks e Tratamento de Valores Especiais', () => {
    it('deve aceitar prejuízo líquido e patrimônio líquido negativo (passivo a descoberto)', () => {
      const stmtDistressed = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmtDistressed.accounts.set('3.11', new Decimal('-5000000000.0000')); // Prejuízo de 5bi
      stmtDistressed.accounts.set('2.03', new Decimal('-12000000000.0000')); // Passivo a descoberto de 12bi

      const converted = convertStatementToFundamentals(stmtDistressed);
      expect(converted.netIncome.toString()).toBe('-5000000000');
      expect(converted.totalEquity.toString()).toBe('-12000000000');
    });

    it('deve rejeitar com CvmFinancialSanityError se Ativo Total for <= 0', () => {
      const stmtZeroAssets = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmtZeroAssets.accounts.set('1', new Decimal('0'));

      expect(() => convertStatementToFundamentals(stmtZeroAssets)).toThrow(CvmFinancialSanityError);

      stmtZeroAssets.accounts.set('1', new Decimal('-1000'));
      expect(() => convertStatementToFundamentals(stmtZeroAssets)).toThrow(CvmFinancialSanityError);
    });

    it('deve rejeitar com CvmFinancialSanityError se Dívida Bruta ou Caixa forem negativos', () => {
      const stmtNegDebt = {
        ...sampleValidStatement,
        accounts: new Map(sampleValidStatement.accounts),
      };
      stmtNegDebt.accounts.set('2.01.04', new Decimal('-500000000000.0000')); // Força grossDebt negativo

      expect(() => convertStatementToFundamentals(stmtNegDebt)).toThrow(CvmFinancialSanityError);
    });

    it('deve rejeitar com CvmIncompleteStatementError se qualquer conta essencial faltar', () => {
      const missingAccounts = ['1', '2.03', '3.01'];

      for (const acc of missingAccounts) {
        const stmtMissing = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
        };
        stmtMissing.accounts.delete(acc);

        expect(() => convertStatementToFundamentals(stmtMissing)).toThrow(CvmIncompleteStatementError);
      }
    });
  });

  describe('Seleção de Demonstrações e Fallback Contábil', () => {
    it('deve priorizar CONSOLIDATED e descartar INDIVIDUAL para a mesma companhia e período', () => {
      const consolidated: CvmRawStatementData = {
        ...sampleValidStatement,
        statementType: 'CONSOLIDATED',
        version: 1,
      };

      const individual: CvmRawStatementData = {
        ...sampleValidStatement,
        statementType: 'INDIVIDUAL',
        version: 1,
        accounts: new Map(sampleValidStatement.accounts),
      };
      individual.accounts.set('3.01', new Decimal('300000000000.0000')); // Receita individual diferente

      const selectedMap = selectStatementsForPublication([individual, consolidated]);
      const key = `${sampleValidStatement.cnpj}#${sampleValidStatement.cvmCode}#${sampleValidStatement.referenceDate}`;

      expect(selectedMap.has(key)).toBe(true);
      const chosen = selectedMap.get(key)!;
      expect(chosen.statementType).toBe('CONSOLIDATED');
      expect(chosen.netRevenue.toString()).toBe('511000000000');
    });

    it('deve selecionar maior VERSAO entre múltiplas demonstrações consolidadas', () => {
      const consolidatedV1: CvmRawStatementData = {
        ...sampleValidStatement,
        version: 1,
      };

      const consolidatedV2: CvmRawStatementData = {
        ...sampleValidStatement,
        version: 2,
        accounts: new Map(sampleValidStatement.accounts),
      };
      consolidatedV2.accounts.set('3.01', new Decimal('520000000000.0000')); // Receita retificada

      const selectedMap = selectStatementsForPublication([consolidatedV1, consolidatedV2]);
      const key = `${sampleValidStatement.cnpj}#${sampleValidStatement.cvmCode}#${sampleValidStatement.referenceDate}`;

      const chosen = selectedMap.get(key)!;
      expect(chosen.version).toBe(2);
      expect(chosen.isRestated).toBe(true);
      expect(chosen.netRevenue.toString()).toBe('520000000000');
    });

    it('deve usar INDIVIDUAL como fallback somente quando CONSOLIDATED válida estiver ausente', () => {
      const individual: CvmRawStatementData = {
        ...sampleValidStatement,
        statementType: 'INDIVIDUAL',
        version: 1,
      };

      const selectedMap = selectStatementsForPublication([individual]);
      const key = `${sampleValidStatement.cnpj}#${sampleValidStatement.cvmCode}#${sampleValidStatement.referenceDate}`;

      expect(selectedMap.has(key)).toBe(true);
      const chosen = selectedMap.get(key)!;
      expect(chosen.statementType).toBe('INDIVIDUAL');
    });
  });

  describe('Adaptador de Tipos: CvmAggregatedStatement -> CvmRawStatementData', () => {
    it('deve adaptar fielmente um CvmAggregatedStatement para CvmRawStatementData e permitir conversão', () => {
      const aggregated: CvmAggregatedStatement = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        netRevenue: new Decimal('511000000000.0000'),
        netIncome: new Decimal('124000000000.0000'),
        totalEquity: new Decimal('410000000000.0000'),
        totalAssets: new Decimal('1065000000000.0000'),
        grossDebt: null,
        cashEquivalents: null,
        ebitda: null,
        sharesCount: null,
        dividendsDeclared: null,
        sourceReference: JSON.stringify({
          fileId: 'a1b2c3d4-0000-0000-0000-000000000001',
          runId: 'b2c3d4e5-0000-0000-0000-000000000002',
          parserVersion: '1.0.0',
          entityLevel: 'COMPANY',
          assetBindingPurpose: 'PUBLICATION_ALIAS',
        }),
      };

      const adaptedRaw = adaptAggregatedStatementToRawStatement(aggregated);

      expect(adaptedRaw.cnpj).toBe(aggregated.cnpj);
      expect(adaptedRaw.cvmCode).toBe(aggregated.cvmCode);
      expect(adaptedRaw.referenceDate).toBe(aggregated.referenceDate);
      expect(adaptedRaw.accounts.get('1')?.toString()).toBe('1065000000000');
      expect(adaptedRaw.accounts.get('2.03')?.toString()).toBe('410000000000');
      expect(adaptedRaw.accounts.get('3.01')?.toString()).toBe('511000000000');
      expect(adaptedRaw.accounts.get('3.11')?.toString()).toBe('124000000000');

      const converted = convertStatementToFundamentals(adaptedRaw);
      expect(converted.referencePeriod).toBe('2024-FY');
      expect(converted.periodType).toBe('annual');
      expect(converted.statementType).toBe('CONSOLIDATED');
      expect(converted.version).toBe(1);
      expect(converted.isRestated).toBe(false);
      expect(converted.netRevenue.toString()).toBe('511000000000');
      expect(converted.netIncome.toString()).toBe('124000000000');
      expect(converted.totalEquity.toString()).toBe('410000000000');
      expect(converted.totalAssets.toString()).toBe('1065000000000');
      expect(converted.grossDebt).toBeNull();
      expect(converted.cashEquivalents).toBeNull();
      expect(converted.netDebt).toBeNull();
    });

    it('deve adaptar CvmAggregatedStatement com caixa e parcelas de dívida preenchidos e calcular grossDebt e netDebt', () => {
      const aggregatedWithDebt: CvmAggregatedStatement = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        netRevenue: new Decimal('511000000000.0000'),
        netIncome: new Decimal('124000000000.0000'),
        totalEquity: new Decimal('410000000000.0000'),
        totalAssets: new Decimal('1065000000000.0000'),
        grossDebt: new Decimal('280000000000.0000'),
        cashEquivalents: new Decimal('50000000000.0000'),
        shortTermDebt: new Decimal('30000000000.0000'),
        longTermDebt: new Decimal('250000000000.0000'),
        ebitda: null,
        sharesCount: null,
        dividendsDeclared: null,
        sourceReference: JSON.stringify({
          fileId: 'a1b2c3d4-0000-0000-0000-000000000001',
          runId: 'b2c3d4e5-0000-0000-0000-000000000002',
          parserVersion: '1.0.0',
          entityLevel: 'COMPANY',
          assetBindingPurpose: 'PUBLICATION_ALIAS',
        }),
      };

      const adaptedRaw = adaptAggregatedStatementToRawStatement(aggregatedWithDebt);
      expect(adaptedRaw.accounts.get('1.01.01')?.toString()).toBe('50000000000');
      expect(adaptedRaw.accounts.get('2.01.04')?.toString()).toBe('30000000000');
      expect(adaptedRaw.accounts.get('2.02.01')?.toString()).toBe('250000000000');

      const converted = convertStatementToFundamentals(adaptedRaw);
      expect(converted.cashEquivalents?.toString()).toBe('50000000000');
      expect(converted.grossDebt?.toString()).toBe('280000000000');
      // netDebt = 280bi - 50bi = 230bi
      expect(converted.netDebt?.toString()).toBe('230000000000');
    });
  });

  describe('Etapa 3 — EBITDA baseado na DFC e Sanidade Financeira', () => {
    it('deve calcular EBITDA determinístico a partir de DRE 3.05 e DFC 6.01.01', () => {
      const stmt: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('190000000000.0000')], // EBIT
          ['6.01.01.02', new Decimal('67000000000.0000')], // D&A DFC
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.ebitda).not.toBeNull();
      // EBITDA = 190bi + 67bi = 257bi
      expect(converted.ebitda?.toString()).toBe('257000000000');
      expect(converted.dividendsDeclared).toBeNull();
    });

    it('deve rejeitar bypass de dfcDepreciationAmortization fornecido sem conta DFC válida e manter depreciationAmortization e ebitda como null (regressão)', () => {
      // Cenário 1: Sem nenhuma conta DFC em accounts
      const stmtSemDfc: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('190000000000.0000')], // EBIT presente
        ]),
        // Tentativa de bypass sem conta DFC oficial em accounts
        dfcDepreciationAmortization: new Decimal('67000000000.0000'),
      };

      const convertedSemDfc = convertStatementToFundamentals(stmtSemDfc);
      expect(convertedSemDfc.depreciationAmortization).toBeNull();
      expect(convertedSemDfc.ebitda).toBeNull();

      // Cenário 2: Com conta DFC presente, porém com descrição não operacional rejeitada
      const stmtDfcInvalida: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('190000000000.0000')],
          ['6.01.01.10', new Decimal('67000000000.0000')],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.10', 'Amortização de ativos financeiros'],
        ]),
        dfcDepreciationAmortization: new Decimal('67000000000.0000'),
      };

      const convertedInvalida = convertStatementToFundamentals(stmtDfcInvalida);
      expect(convertedInvalida.depreciationAmortization).toBeNull();
      expect(convertedInvalida.ebitda).toBeNull();
    });

    it('deve resultar em ebitda null quando DRE 3.05 estiver ausente mesmo com DFC válida', () => {
      const stmt: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['6.01.01.02', new Decimal('67000000000.0000')],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
        dfcDepreciationAmortization: new Decimal('67000000000.0000'),
      };
      stmt.accounts.delete('3.05');

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.depreciationAmortization?.toString()).toBe('67000000000');
      expect(converted.ebitda).toBeNull();
    });

    it('deve resultar em ebitda null quando DFC estiver ausente', () => {
      const stmt: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('190000000000.0000')],
        ]),
      };

      const converted = convertStatementToFundamentals(stmt);
      expect(converted.ebitda).toBeNull();
    });

    it('deve calcular EBITDA quando componente presente for zero (Decimal 0)', () => {
      // 1. D&A = 0
      const stmtZeroDA: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('100000000.0000')],
          ['6.01.01.02', new Decimal(0)],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };
      const convertedZeroDA = convertStatementToFundamentals(stmtZeroDA);
      expect(convertedZeroDA.ebitda?.toString()).toBe('100000000');

      // 2. EBIT = 0
      const stmtZeroEbit: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal(0)],
          ['6.01.01.02', new Decimal('40000000.0000')],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };
      const convertedZeroEbit = convertStatementToFundamentals(stmtZeroEbit);
      expect(convertedZeroEbit.ebitda?.toString()).toBe('40000000');

      // 3. Ambos = 0
      const stmtBothZero: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal(0)],
          ['6.01.01.02', new Decimal(0)],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };
      const convertedBothZero = convertStatementToFundamentals(stmtBothZero);
      expect(convertedBothZero.ebitda?.isZero()).toBe(true);
    });

    it('deve calcular EBITDA com sinais contábeis oficiais quando EBIT for negativo (prejuízo operacional)', () => {
      const stmtNegativeEbit: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('-50000000.0000')], // Prejuízo operacional
          ['6.01.01.02', new Decimal('30000000.0000')], // D&A
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };

      const converted = convertStatementToFundamentals(stmtNegativeEbit);
      // EBITDA = -50M + 30M = -20M
      expect(converted.ebitda?.toString()).toBe('-20000000');
    });

    it('deve preservar precisão Decimal em cálculos com casas decimais estendidas', () => {
      const stmtHighPrecision: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.05', new Decimal('123456789.1234567890')],
          ['6.01.01.02', new Decimal('987654321.9876543210')],
        ]),
        accountDescriptions: new Map([
          ['6.01.01.02', 'Depreciação e Amortização'],
        ]),
      };

      const converted = convertStatementToFundamentals(stmtHighPrecision);
      // 123456789.1234567890 + 987654321.9876543210 = 1111111111.11111111
      expect(converted.ebitda?.toString()).toBe('1111111111.11111111');
    });

    it('não deve fazer fallback para conta 3.99 ou contas arbitrárias para EBITDA', () => {
      const stmtWith399: CvmRawStatementData = {
        ...sampleValidStatement,
        accounts: new Map([
          ...sampleValidStatement.accounts,
          ['3.99', new Decimal('190000000000.0000')], // Conta 3.99 não permitida
          ['9.99', new Decimal('67000000000.0000')], // Conta 9.99 arbitrária
        ]),
      };
      stmtWith399.accounts.delete('3.05');

      const converted = convertStatementToFundamentals(stmtWith399);
      expect(converted.ebitda).toBeNull();
    });

    it('deve adaptar statement com ebit e depreciationAmortization em adaptAggregatedStatementToRawStatement', () => {
      const aggregatedWithEbitda: CvmAggregatedStatement = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        netRevenue: new Decimal('511000000000.0000'),
        netIncome: new Decimal('124000000000.0000'),
        totalEquity: new Decimal('410000000000.0000'),
        totalAssets: new Decimal('1065000000000.0000'),
        grossDebt: new Decimal('280000000000.0000'),
        cashEquivalents: new Decimal('50000000000.0000'),
        ebit: new Decimal('190000000000.0000'),
        depreciationAmortization: new Decimal('67000000000.0000'),
        ebitda: new Decimal('257000000000.0000'),
        sharesCount: null,
        dividendsDeclared: null,
        sourceReference: JSON.stringify({
          fileId: 'a1b2c3d4-0000-0000-0000-000000000001',
          runId: 'b2c3d4e5-0000-0000-0000-000000000002',
          parserVersion: '1.0.0',
          entityLevel: 'COMPANY',
          assetBindingPurpose: 'PUBLICATION_ALIAS',
        }),
      };

      const raw = adaptAggregatedStatementToRawStatement(aggregatedWithEbitda);
      expect(raw.accounts.get('3.05')?.toString()).toBe('190000000000');
      expect(raw.dfcDepreciationAmortization?.toString()).toBe('67000000000');

      const converted = convertStatementToFundamentals(raw);
      expect(converted.ebitda?.toString()).toBe('257000000000');
    });

    it('deve rejeitar classificação de D&A quando a descrição for ausente, vazia ou puramente genérica', () => {
      // 1. Descrição ausente / undefined
      expect(isOperatingDepreciationAmortization('6.01.01.02', undefined)).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', null)).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', '')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', '   ')).toBe(false);

      // 2. Descrição curta ou puramente genérica
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Outros')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Ajustes')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Outros Ajustes')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Ajuste ao Lucro')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Conciliação')).toBe(false);
    });

    it('deve rejeitar contas de DFC direta (6.01.02, 6.01.03, 6.01.04) e contas financeiras de amortização', () => {
      // 1. Códigos da DFC direta (não operacionais na CVM)
      expect(isOperatingDepreciationAmortization('6.01.02', 'Fornecedores - Materiais e Serviços')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.03', 'Fornecedores - Energia Elétrica')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.04', 'Outros')).toBe(false);

      // 2. Amortizações financeiras, de captação e dívida
      expect(
        isOperatingDepreciationAmortization('6.01.01.18', 'Amortização de custos de captação de debêntures')
      ).toBe(false);
      expect(
        isOperatingDepreciationAmortization('6.01.01.19', 'Amortização do custo de transação de empréstimos')
      ).toBe(false);
      expect(
        isOperatingDepreciationAmortization('6.01.01.20', 'Amortização de despesas antecipadas')
      ).toBe(false);
      expect(
        isOperatingDepreciationAmortization('6.01.01.21', 'Amortização de ágio e deságio')
      ).toBe(false);
      expect(
        isOperatingDepreciationAmortization('6.01.01.22', 'Amortização tributos diferidos')
      ).toBe(false);
    });

    it('deve rejeitar explicitamente amortizações de ativos financeiros, instrumentos financeiros, valor justo, custo amortizado, aplicações financeiras e demais descrições semanticamente não operacionais', () => {
      // 1. Amortização de ativos financeiros
      expect(isOperatingDepreciationAmortization('6.01.01.10', 'Amortização de ativos financeiros')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.10', 'Amortização de ativo financeiro')).toBe(false);

      // 2. Amortização de instrumentos financeiros
      expect(isOperatingDepreciationAmortization('6.01.01.11', 'Amortização de instrumentos financeiros')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.11', 'Amortização de instrumento financeiro')).toBe(false);

      // 3. Amortização de valor justo
      expect(isOperatingDepreciationAmortization('6.01.01.12', 'Amortização de ajuste a valor justo')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.12', 'Amortização a valor justo')).toBe(false);

      // 4. Amortização ao custo amortizado
      expect(isOperatingDepreciationAmortization('6.01.01.13', 'Amortização de títulos ao custo amortizado')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.13', 'Amortização ao custo amortizado')).toBe(false);

      // 5. Amortização de aplicações financeiras
      expect(isOperatingDepreciationAmortization('6.01.01.14', 'Amortização de aplicações financeiras')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.14', 'Amortização de aplicação financeira')).toBe(false);

      // 6. Demais descrições semanticamente não operacionais
      expect(isOperatingDepreciationAmortization('6.01.01.15', 'Amortização de títulos e valores mobiliários')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.16', 'Amortização de operações de crédito')).toBe(false);
      expect(isOperatingDepreciationAmortization('6.01.01.17', 'Amortização de títulos de renda fixa')).toBe(false);
    });

    it('deve aceitar exclusivamente termos comprovados de D&A operacional em 6.01.01.*', () => {
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Depreciação e amortização')).toBe(true);
      expect(isOperatingDepreciationAmortization('6.01.01.02', 'Depreciação e Amortização')).toBe(true);
      expect(isOperatingDepreciationAmortization('6.01.01.03', 'Depreciação do ativo de direito de uso')).toBe(true);
      expect(isOperatingDepreciationAmortization('6.01.01.04', 'Exaustão de recursos minerais')).toBe(true);
      expect(isOperatingDepreciationAmortization('6.01.01.05', 'Amortização de intangíveis')).toBe(true);
      expect(isOperatingDepreciationAmortization('6.01.01.06', 'Depreciação do imobilizado')).toBe(true);
    });
  });

  describe('Dividendos Declarados baseados na DMPL (Unit - Etapa 4)', () => {
    describe('Validação Semântica de Contas de Dividendos (isDeclaredDividendsAccount)', () => {
      it('deve aceitar conta sintética 5.04.06 com descrições oficiais comprovadas de dividendos', () => {
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos Intermediários')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos Intercalares')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos Adicionais')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos de exercícios anteriores')).toBe(true);
      });

      it('deve rejeitar propostas de dividendos sem evidência contábil deliberada válida', () => {
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos Propostos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Proposta de dividendos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos - Proposta da Administração')).toBe(false);
      });

      it('deve aceitar subcontas legítimas 5.04.06.* com descrições comprovadas', () => {
        expect(isDeclaredDividendsAccount('5.04.06.01', 'Dividendos Adicionais')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06.02', 'Dividendos de exercícios anteriores')).toBe(true);
        expect(isDeclaredDividendsAccount('5.04.06.03', 'Dividendos complementares')).toBe(true);
      });

      it('deve rejeitar categoricamente JCP 5.04.07 e descrições contendo JCP ou juros', () => {
        // Código de JCP na DMPL é 5.04.07 (Lei 9.249/95 Art. 9º - fiscalmente e contabilmente distinto)
        expect(isDeclaredDividendsAccount('5.04.07', 'Juros sobre Capital Próprio')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.07', 'JCP')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Juros sobre Capital Próprio')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos e Juros sobre Capital Próprio')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos e JCP')).toBe(false);
      });

      it('deve rejeitar dividendos pagos da DFC e descrições contendo pagamento', () => {
        expect(isDeclaredDividendsAccount('6.03.04', 'Dividendos pagos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos Pagos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Pagamento de dividendos')).toBe(false);
      });

      it('deve rejeitar dividendos prescritos, cancelados, revertidos ou não reclamados', () => {
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos prescritos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Reversão de dividendos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Cancelamento de dividendos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Dividendos não reclamados')).toBe(false);
      });

      it('deve rejeitar participações de não controladores e retenções tributárias', () => {
        expect(isDeclaredDividendsAccount('5.04.06', 'Participação dos não controladores')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Imposto de renda retido sobre dividendos')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Tributos sobre dividendos')).toBe(false);
      });

      it('deve rejeitar descrições genéricas, curtas ou ausentes', () => {
        expect(isDeclaredDividendsAccount('5.04.06', undefined)).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', null)).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', '')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', '   ')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Div')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06', 'Outros')).toBe(false);
        expect(isDeclaredDividendsAccount('5.04.06.01', 'Outras transações')).toBe(false);
      });

      it('deve rejeitar contas de outros demonstrativos (DRE, DFC, BPA, BPP) ou não documentadas', () => {
        expect(isDeclaredDividendsAccount('3.01', 'Receita Líquida')).toBe(false);
        expect(isDeclaredDividendsAccount('3.09', 'Lucro Líquido')).toBe(false);
        expect(isDeclaredDividendsAccount('3.11', 'Lucro Líquido Consolidado')).toBe(false);
        expect(isDeclaredDividendsAccount('3.99', 'Dividendos por Ação')).toBe(false);
        expect(isDeclaredDividendsAccount('2.03', 'Patrimônio Líquido')).toBe(false);
        expect(isDeclaredDividendsAccount('6.01.01.01', 'Depreciação')).toBe(false);
      });
    });

    describe('Conversão com Dividendos Declarados (convertStatementToFundamentals)', () => {
      function createValidDmplOrigin(
        stmt: CvmRawStatementData,
        overrides?: Partial<CvmDmplOriginEvidence>
      ): CvmDmplOriginEvidence {
        return {
          statementOrigin: stmt.statementType === 'INDIVIDUAL' ? 'DMPL_ind' : 'DMPL_con',
          statementType: stmt.statementType,
          selectedColumn: 'Patrimônio Líquido',
          cnpj: stmt.cnpj,
          cvmCode: stmt.cvmCode,
          referenceDate: stmt.referenceDate,
          version: stmt.version,
          accountCode: '5.04.06',
          validatedDescription: 'Dividendos',
          declaredAmount: new Decimal('15000000000.0000'),
          exerciseOrder: 'ÚLTIMO',
          ...overrides,
        };
      }

      it('deve extrair dividendos declarados da DMPL como Decimal positivo a partir de valor negativo na DMPL', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['5.04.06', 'Dividendos'],
          ]),
        };
        // Na DMPL, redução de PL por dividendos é registrada como negativa (-15 bi)
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          declaredAmount: new Decimal('15000000000.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeInstanceOf(Decimal);
        expect(converted.dividendsDeclared?.toString()).toBe('15000000000');
      });

      it('deve preservar estritamente Decimal(0) quando o valor comprovado for zero (não converter para null)', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['5.04.06', 'Dividendos'],
          ]),
        };
        stmt.accounts.set('5.04.06', new Decimal('0.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          declaredAmount: new Decimal('0.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).not.toBeNull();
        expect(converted.dividendsDeclared).toBeInstanceOf(Decimal);
        expect(converted.dividendsDeclared?.isZero()).toBe(true);
        expect(converted.dividendsDeclared?.toString()).toBe('0');
      });

      it('deve manter dividendsDeclared como null quando a conta de DMPL estiver ausente', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
        };
        // Sem conta 5.04.06 e sem dmplOrigin
        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('deve suportar segregação em subcontas 5.04.06.* quando a conta sintética 5.04.06 estiver ausente', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['5.04.06.01', 'Dividendos adicionais'],
            ['5.04.06.02', 'Dividendos de exercícios anteriores'],
          ]),
        };
        stmt.accounts.set('5.04.06.01', new Decimal('-2500000.0000'));
        stmt.accounts.set('5.04.06.02', new Decimal('-3500000.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          accountCode: '5.04.06.01+5.04.06.02',
          validatedDescription: 'Dividendos adicionais',
          declaredAmount: new Decimal('6000000.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        // Soma = 2.5mi + 3.5mi = 6mi
        expect(converted.dividendsDeclared?.toString()).toBe('6000000');
      });

      it('deve priorizar a conta sintética 5.04.06 e não duplicar valores quando subcontas coexistirem', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['5.04.06', 'Dividendos'],
            ['5.04.06.01', 'Dividendos adicionais'],
          ]),
        };
        stmt.accounts.set('5.04.06', new Decimal('-10000000.0000')); // Sintética total
        stmt.accounts.set('5.04.06.01', new Decimal('-3000000.0000')); // Subconta filha
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          accountCode: '5.04.06',
          validatedDescription: 'Dividendos',
          declaredAmount: new Decimal('10000000.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        // Usa exclusivamente a sintética: 10mi (não soma 13mi!)
        expect(converted.dividendsDeclared?.toString()).toBe('10000000');
      });

      it('deve rejeitar tentativas de bypass via dmplDividendsDeclared sem contas DMPL comprovadas', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          dmplDividendsDeclared: new Decimal('9999999999'), // bypass tentado sem origem
        };

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('deve rejeitar discrepâncias entre dmplDividendsDeclared e as contas oficiais da DMPL', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['5.04.06', 'Dividendos'],
          ]),
          dmplDividendsDeclared: new Decimal('9999999999'), // Valor divergente da conta
        };
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          declaredAmount: new Decimal('15000000000.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('deve lançar CvmFinancialSanityError se dividendsDeclared for negativo (sanity check)', () => {
        const invalidConverted = {
          ...convertStatementToFundamentals(sampleValidStatement),
          dividendsDeclared: new Decimal('-5000'),
        };

        expect(() => validateFinancialSanity(invalidConverted)).toThrow(CvmFinancialSanityError);
        try {
          validateFinancialSanity(invalidConverted);
        } catch (e: any) {
          expect(e.reason).toBe('DIVIDENDS_DECLARED_NEGATIVE');
        }
      });

      it('deve lançar CvmFinancialSanityError se dividendsDeclared não for instância de Decimal', () => {
        const invalidConverted = {
          ...convertStatementToFundamentals(sampleValidStatement),
          dividendsDeclared: 5000 as any,
        };

        expect(() => validateFinancialSanity(invalidConverted)).toThrow(CvmFinancialSanityError);
        try {
          validateFinancialSanity(invalidConverted);
        } catch (e: any) {
          expect(e.reason).toBe('DIVIDENDS_DECLARED_INVALID_FORMAT');
        }
      });
    });

    describe('Bloqueio de Injeção Artificial de Conta DMPL (Testes Negativos Obrigatórios)', () => {
      function createValidDmplOrigin(
        stmt: CvmRawStatementData,
        overrides?: Partial<CvmDmplOriginEvidence>
      ): CvmDmplOriginEvidence {
        return {
          statementOrigin: stmt.statementType === 'INDIVIDUAL' ? 'DMPL_ind' : 'DMPL_con',
          statementType: stmt.statementType,
          selectedColumn: 'Patrimônio Líquido',
          cnpj: stmt.cnpj,
          cvmCode: stmt.cvmCode,
          referenceDate: stmt.referenceDate,
          version: stmt.version,
          accountCode: '5.04.06',
          validatedDescription: 'Dividendos',
          declaredAmount: new Decimal('15000000000.0000'),
          exerciseOrder: 'ÚLTIMO',
          ...overrides,
        };
      }

      it('1. deve resultar em null quando accounts contiver 5.04.06 sem metadado de origem DMPL', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map([['5.04.06', 'Dividendos']]),
        };
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));
        // Sem dmplOrigin
        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('2. deve resultar em null quando accountDescriptions contiver Dividendos sem metadado de origem DMPL', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map([['5.04.06', 'Dividendos']]),
        };
        // Sem dmplOrigin
        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('3. deve resultar em null quando dmplDividendsDeclared for fornecido diretamente sem evidência da DMPL', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          dmplDividendsDeclared: new Decimal('15000000000.0000'),
          // Sem dmplOrigin
        };
        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('4. deve resultar em null quando origem DMPL for incompatível com CNPJ, período, versão ou tipo de demonstrativo', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map([['5.04.06', 'Dividendos']]),
        };
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));

        // 4a. CNPJ incompatível
        stmt.dmplOrigin = createValidDmplOrigin(stmt, { cnpj: '00000000000199' });
        expect(convertStatementToFundamentals(stmt).dividendsDeclared).toBeNull();

        // 4b. Data de referência incompatível
        stmt.dmplOrigin = createValidDmplOrigin(stmt, { referenceDate: '2023-12-31' });
        expect(convertStatementToFundamentals(stmt).dividendsDeclared).toBeNull();

        // 4c. Versão incompatível
        stmt.dmplOrigin = createValidDmplOrigin(stmt, { version: 2 });
        expect(convertStatementToFundamentals(stmt).dividendsDeclared).toBeNull();

        // 4d. statementType incompatível (origem DMPL_ind para demonstrativo CONSOLIDATED)
        stmt.dmplOrigin = createValidDmplOrigin(stmt, { statementOrigin: 'DMPL_ind' });
        expect(convertStatementToFundamentals(stmt).dividendsDeclared).toBeNull();
      });

      it('5. deve resultar em null quando origem DMPL tiver coluna rejeitada (Participação dos Não Controladores)', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map([['5.04.06', 'Dividendos']]),
        };
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          selectedColumn: 'Participação dos Não Controladores',
        });

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });

      it('6. deve resultar em null quando houver divergência entre o valor da conta DMPL e o valor transportado em dmplDividendsDeclared', () => {
        const stmt: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map([['5.04.06', 'Dividendos']]),
          dmplDividendsDeclared: new Decimal('9999999999.0000'), // Divergente
        };
        stmt.accounts.set('5.04.06', new Decimal('-15000000000.0000'));
        stmt.dmplOrigin = createValidDmplOrigin(stmt, {
          declaredAmount: new Decimal('15000000000.0000'),
        });

        const converted = convertStatementToFundamentals(stmt);
        expect(converted.dividendsDeclared).toBeNull();
      });
    });

    describe('Segurança Contábil e Não Regressão das Etapas 1-3', () => {
      function createValidDmplOrigin(
        stmt: CvmRawStatementData,
        overrides?: Partial<CvmDmplOriginEvidence>
      ): CvmDmplOriginEvidence {
        return {
          statementOrigin: stmt.statementType === 'INDIVIDUAL' ? 'DMPL_ind' : 'DMPL_con',
          statementType: stmt.statementType,
          selectedColumn: 'Patrimônio Líquido',
          cnpj: stmt.cnpj,
          cvmCode: stmt.cvmCode,
          referenceDate: stmt.referenceDate,
          version: stmt.version,
          accountCode: '5.04.06',
          validatedDescription: 'Dividendos',
          declaredAmount: new Decimal('45000000000.0000'),
          exerciseOrder: 'ÚLTIMO',
          ...overrides,
        };
      }

      it('deve preservar integralmente EBITDA, D&A, Dívida Bruta, Caixa, Dívida Líquida e Ações', () => {
        const fullStatement: CvmRawStatementData = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
          accountDescriptions: new Map<string, string>([
            ['6.01.01.01', 'Depreciação e Amortização'],
            ['5.04.06', 'Dividendos'],
          ]),
        };
        fullStatement.accounts.set('3.05', new Decimal('190000000000.0000')); // EBIT
        fullStatement.accounts.set('6.01.01.01', new Decimal('67000000000.0000')); // D&A
        fullStatement.accounts.set('5.04.06', new Decimal('-45000000000.0000')); // DMPL Dividendos
        fullStatement.dmplOrigin = createValidDmplOrigin(fullStatement, {
          declaredAmount: new Decimal('45000000000.0000'),
        });

        const converted = convertStatementToFundamentals(fullStatement);

        // Etapa 1
        expect(converted.totalAssets.toString()).toBe('1065000000000');
        expect(converted.totalEquity.toString()).toBe('485000000000');
        expect(converted.netRevenue.toString()).toBe('511000000000');
        expect(converted.netIncome.toString()).toBe('124600000000');
        expect(converted.cashEquivalents?.toString()).toBe('50000000000');
        expect(converted.grossDebt?.toString()).toBe('280000000000');
        expect(converted.netDebt?.toString()).toBe('230000000000');

        // Etapa 3
        expect(converted.depreciationAmortization?.toString()).toBe('67000000000');
        expect(converted.ebitda?.toString()).toBe('257000000000');

        // Etapa 4
        expect(converted.dividendsDeclared?.toString()).toBe('45000000000');
      });

      it('NÃO deve aceitar lucro líquido (3.11/3.09), patrimônio líquido (2.03) ou conta 3.99 como dividendos', () => {
        const stmtWithoutDmpl = {
          ...sampleValidStatement,
          accounts: new Map(sampleValidStatement.accounts),
        };
        // As contas 3.11 (124.6 bi), 2.03 (485 bi) estão presentes, mas 5.04.06 NÃO está
        const converted = convertStatementToFundamentals(stmtWithoutDmpl);
        expect(converted.dividendsDeclared).toBeNull();
        expect(converted.dividendsDeclared).not.toBe(converted.netIncome);
        expect(converted.dividendsDeclared).not.toBe(converted.totalEquity);
      });

      it('deve transportar dividendos declarados corretamente através de adaptAggregatedStatementToRawStatement', () => {
        const aggregatedWithDividends: CvmAggregatedStatement = {
          cnpj: '33000167000101',
          cvmCode: '009512',
          companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
          referenceDate: '2024-12-31',
          periodType: 'annual',
          statementType: 'CONSOLIDATED',
          exerciseOrder: 'ÚLTIMO',
          version: 1,
          netRevenue: new Decimal('511000000000.0000'),
          netIncome: new Decimal('124600000000.0000'),
          totalEquity: new Decimal('485000000000.0000'),
          totalAssets: new Decimal('1065000000000.0000'),
          grossDebt: new Decimal('280000000000.0000'),
          cashEquivalents: new Decimal('50000000000.0000'),
          ebit: new Decimal('190000000000.0000'),
          depreciationAmortization: new Decimal('67000000000.0000'),
          ebitda: new Decimal('257000000000.0000'),
          sharesCount: null,
          dividendsDeclared: new Decimal('32000000000.0000'),
          dmplOrigin: {
            statementOrigin: 'DMPL_con',
            statementType: 'CONSOLIDATED',
            selectedColumn: 'Patrimônio Líquido',
            cnpj: '33000167000101',
            cvmCode: '009512',
            referenceDate: '2024-12-31',
            version: 1,
            accountCode: '5.04.06',
            validatedDescription: 'Dividendos',
            declaredAmount: new Decimal('32000000000.0000'),
            exerciseOrder: 'ÚLTIMO',
          },
          sourceReference: JSON.stringify({
            fileId: 'a1b2c3d4-0000-0000-0000-000000000001',
            runId: 'b2c3d4e5-0000-0000-0000-000000000002',
            parserVersion: '1.0.0',
            entityLevel: 'COMPANY',
            assetBindingPurpose: 'PUBLICATION_ALIAS',
          }),
        };

        const raw = adaptAggregatedStatementToRawStatement(aggregatedWithDividends);
        expect(raw.accounts.get('5.04.06')?.toString()).toBe('32000000000');
        expect(raw.accountDescriptions?.get('5.04.06')).toBe('Dividendos');
        expect(raw.dmplDividendsDeclared?.toString()).toBe('32000000000');
        expect(raw.dmplOrigin).not.toBeNull();

        const converted = convertStatementToFundamentals(raw);
        expect(converted.dividendsDeclared?.toString()).toBe('32000000000');
      });
    });
  });
});
