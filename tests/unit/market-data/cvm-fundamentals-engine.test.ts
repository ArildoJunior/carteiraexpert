import { describe, expect, it } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  adaptAggregatedStatementToRawStatement,
  convertStatementToFundamentals,
  formatReferencePeriod,
  selectStatementsForPublication,
  validateFinancialSanity,
} from '@/modules/market-data/domain/cvm-fundamentals-engine';
import {
  CvmFinancialSanityError,
  CvmIncompleteStatementError,
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
      expect(converted.ebitda?.toString()).toBe('190000000000');
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
      stmt.accounts.delete('1.01.02');

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
  });
});
