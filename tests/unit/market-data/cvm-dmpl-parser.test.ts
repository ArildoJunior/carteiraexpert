import { describe, expect, it } from 'vitest';
import { Decimal } from '@/lib/decimal';
import { parseCvmDmplStream, type ParsedCvmDmplRow } from '@/modules/market-data/domain/cvm-dmpl-parser';
import {
  CvmDfpAggregator,
  type ParsedCvmStatementRow,
} from '@/modules/market-data/domain/cvm-dfp-parser';
import {
  CvmInvalidHeaderError,
  type CvmDfpMetrics,
  type CvmParserContext,
} from '@/modules/market-data/domain/cvm-parser.types';

async function* createLineStream(lines: string[]): AsyncGenerator<string, void, unknown> {
  for (const line of lines) {
    yield line;
  }
}

describe('CVM DMPL Parser (Unit - Etapa 4)', () => {
  const validHeader =
    'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';

  const sampleContext: CvmParserContext = {
    fileId: 'a0000000-0000-4000-8000-000000000001',
    sourceFileType: 'DFP_ZIP',
    referenceYear: 2024,
    runId: 'b0000000-0000-4000-8000-000000000002',
    parserVersion: '1.0.0',
  };

  it('deve processar linha válida de dividendos declarados na DMPL com escala MIL', async () => {
    const lines = [
      validHeader,
      '33.000.167/0001-01;2024-12-31;1;PETROLEO BRASILEIRO S.A. PETROBRAS;009512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-15000000.0000000000;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con')) {
      results.push(row);
    }

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.cnpj).toBe('33000167000101');
    expect(r.cvmCode).toBe('009512');
    expect(r.referenceDate).toBe('2024-12-31');
    expect(r.version).toBe(1);
    expect(r.column).toBe('Patrimônio Líquido');
    expect(r.accountCode).toBe('5.04.06');
    expect(r.accountDescription).toBe('Dividendos');
    // -15000000 * 1000 = -15000000000
    expect(r.accountValue.toString()).toBe('-15000000000');
  });

  it('deve processar linha com escala UNIDADE preservando o valor exato', async () => {
    const lines = [
      validHeader,
      '00.000.000/0001-91;2024-12-31;2;BANCO DO BRASIL S.A.;001023;DF Consolidado;REAL;UNIDADE;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-500000.50;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con')) {
      results.push(row);
    }

    expect(results).toHaveLength(1);
    expect(results[0].accountValue.toString()).toBe('-500000.5');
    expect(results[0].version).toBe(2);
  });

  it('deve exigir statementOrigin obrigatório ("DMPL_con" ou "DMPL_ind") e rejeitar ausência ou valor inválido', async () => {
    const lines = [validHeader];
    await expect(async () => {
      for await (const _row of parseCvmDmplStream(createLineStream(lines), undefined as any)) {
        // no-op
      }
    }).rejects.toThrow(/statementOrigin é obrigatório/);

    await expect(async () => {
      for await (const _row of parseCvmDmplStream(createLineStream(lines), 'INVALID' as any)) {
        // no-op
      }
    }).rejects.toThrow(/statementOrigin é obrigatório/);
  });

  it('deve lançar CvmInvalidHeaderError quando colunas obrigatórias estiverem ausentes', async () => {
    const invalidHeader = 'CNPJ_CIA;DT_REFER;VERSAO;CD_CVM'; // faltando COLUNA_DF, CD_CONTA, VL_CONTA, etc.
    const lines = [invalidHeader, '33000167000101;2024-12-31;1;009512'];

    await expect(async () => {
      for await (const _row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con')) {
        // no-op
      }
    }).rejects.toThrow(CvmInvalidHeaderError);
  });

  it('deve ignorar linhas com ORDEM_EXERC = PENÚLTIMO e contabilizar métrica', async () => {
    const metrics: CvmDfpMetrics = {
      totalLinesRead: 0,
      relevantLinesProcessed: 0,
      skippedPenultimoLines: 0,
      invalidScaleLines: 0,
      corruptedLinesCount: 0,
      conflictingDuplicateLines: 0,
      conflictingStatementsDiscarded: 0,
      unregisteredCompaniesSkipped: 0,
      unsupportedSectorCompaniesSkipped: 0,
      highestVersionIncompleteDiscarded: 0,
      missingNetIncomeDiscarded: 0,
      completeStatementsEmitted: 0,
    };

    const lines = [
      validHeader,
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;PENÚLTIMO;2023-01-01;2023-12-31;Patrimônio Líquido;5.04.06;Dividendos;-10000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-15000.00;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con', metrics)) {
      results.push(row);
    }

    expect(results).toHaveLength(1);
    expect(results[0].accountValue.toString()).toBe('-15000000');
    expect(metrics.skippedPenultimoLines).toBe(1);
    expect(metrics.relevantLinesProcessed).toBe(1);
  });

  it('deve filtrar colunas na DMPL_con: aceita Patrimônio Líquido e Patrimônio Líquido Consolidado, rejeitando não controladores e reservas', async () => {
    const lines = [
      validHeader,
      // Descartadas: colunas analíticas/de reserva e terceiros
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Capital Social Integralizado;5.04.06;Dividendos;0.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Reservas de Lucro;5.04.06;Dividendos;-15000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Participação dos Não Controladores;5.04.06;Dividendos;-2000.00;S',
      // Aceitas em DMPL_con:
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-15000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido Consolidado;5.04.06;Dividendos;-17000.00;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con')) {
      results.push(row);
    }

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.column)).toEqual([
      'Patrimônio Líquido',
      'Patrimônio Líquido Consolidado',
    ]);
    expect(results[0].accountValue.toString()).toBe('-15000000');
    expect(results[1].accountValue.toString()).toBe('-17000000');
  });

  it('deve filtrar colunas na DMPL_ind: aceita exclusivamente Patrimônio Líquido e rejeita Patrimônio Líquido Consolidado', async () => {
    const lines = [
      validHeader,
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido Consolidado;5.04.06;Dividendos;-17000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Participação dos Não Controladores;5.04.06;Dividendos;-2000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-15000.00;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_ind')) {
      results.push(row);
    }

    expect(results).toHaveLength(1);
    expect(results[0].column).toBe('Patrimônio Líquido');
    expect(results[0].statementOrigin).toBe('DMPL_ind');
    expect(results[0].accountValue.toString()).toBe('-15000000');
  });

  it('deve aceitar subcontas 5.04.06.* e rejeitar contas de outros grupos como JCP 5.04.07', async () => {
    const lines = [
      validHeader,
      // Contas aceitas
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-10000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06.01;Dividendos Adicionais;-5000.00;N',
      // Contas rejeitadas
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.07;Juros sobre Capital Próprio;-8000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.01;Aumento de Capital;20000.00;S',
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;3.99;Conta Genérica;100.00;N',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con')) {
      results.push(row);
    }

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.accountCode)).toEqual(['5.04.06', '5.04.06.01']);
  });

  it('deve ignorar linhas corrompidas (data inexistente, versão alfanumérica, escala inválida) sem quebrar o fluxo', async () => {
    const metrics: CvmDfpMetrics = {
      totalLinesRead: 0,
      relevantLinesProcessed: 0,
      skippedPenultimoLines: 0,
      invalidScaleLines: 0,
      corruptedLinesCount: 0,
      conflictingDuplicateLines: 0,
      conflictingStatementsDiscarded: 0,
      unregisteredCompaniesSkipped: 0,
      unsupportedSectorCompaniesSkipped: 0,
      highestVersionIncompleteDiscarded: 0,
      missingNetIncomeDiscarded: 0,
      completeStatementsEmitted: 0,
    };

    const lines = [
      validHeader,
      // Data inválida (fevereiro 30)
      '33.000.167/0001-01;2024-02-30;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-02-30;Patrimônio Líquido;5.04.06;Dividendos;-1000.00;S',
      // Versão inválida (alfanumérica)
      '33.000.167/0001-01;2024-12-31;1abc;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-1000.00;S',
      // Escala inválida
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;BILHAO;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-1000.00;S',
      // Valor não numérico
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;N/A;S',
      // Linha íntegra
      '33.000.167/0001-01;2024-12-31;1;PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-5000.00;S',
    ];

    const results: ParsedCvmDmplRow[] = [];
    for await (const row of parseCvmDmplStream(createLineStream(lines), 'DMPL_con', metrics)) {
      results.push(row);
    }

    expect(results).toHaveLength(1);
    expect(results[0].accountValue.toString()).toBe('-5000000');
    expect(metrics.corruptedLinesCount).toBe(3);
    expect(metrics.invalidScaleLines).toBe(1);
  });

  describe('Integração com CvmDfpAggregator', () => {
    function createDummyStatementRows(version = 1): ParsedCvmStatementRow[] {
      return [
        {
          cnpj: '33000167000101',
          cvmCode: '009512',
          referenceDate: '2024-12-31',
          version,
          companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          physicalType: 'BPA_con',
          accountCode: '1',
          accountDescription: 'Ativo Total',
          accountValue: new Decimal('1000000000'),
        },
        {
          cnpj: '33000167000101',
          cvmCode: '009512',
          referenceDate: '2024-12-31',
          version,
          companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          physicalType: 'BPP_con',
          accountCode: '2.03',
          accountDescription: 'Patrimônio Líquido',
          accountValue: new Decimal('500000000'),
        },
        {
          cnpj: '33000167000101',
          cvmCode: '009512',
          referenceDate: '2024-12-31',
          version,
          companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          physicalType: 'DRE_con',
          accountCode: '3.01',
          accountDescription: 'Receita Líquida',
          accountValue: new Decimal('800000000'),
        },
        {
          cnpj: '33000167000101',
          cvmCode: '009512',
          referenceDate: '2024-12-31',
          version,
          companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
          physicalType: 'DRE_con',
          accountCode: '3.11',
          accountDescription: 'Lucro Líquido',
          accountValue: new Decimal('200000000'),
        },
      ];
    }

    it('deve agregar dividendos declarados da DMPL no demonstrativo consolidado final e gerar dmplOrigin', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-65000000.00'),
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      // Converte magnitude negativa para magnitude positiva
      expect(statements[0].dividendsDeclared?.toString()).toBe('65000000');
      expect(statements[0].dmplOrigin).toBeDefined();
      expect(statements[0].dmplOrigin?.statementOrigin).toBe('DMPL_con');
      expect(statements[0].dmplOrigin?.statementType).toBe('CONSOLIDATED');
      expect(statements[0].dmplOrigin?.selectedColumn).toBe('Patrimônio Líquido');
      expect(statements[0].dmplOrigin?.accountCode).toBe('5.04.06');
      expect(statements[0].dmplOrigin?.declaredAmount.toString()).toBe('65000000');
    });

    it('deve aceitar COLUNA_DF = "Patrimônio Líquido Consolidado" na DMPL_con quando Patrimônio Líquido estiver ausente e rejeitar Não Controladores', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      // Linha de terceiros que deve ser categoricamente rejeitada
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Participação dos Não Controladores',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-123456.00'),
      });

      // Linha consolidada oficial
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido Consolidado',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-80000000.00'),
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].dividendsDeclared?.toString()).toBe('80000000');
      expect(statements[0].dmplOrigin?.selectedColumn).toBe('Patrimônio Líquido Consolidado');
      expect(statements[0].dmplOrigin?.statementOrigin).toBe('DMPL_con');
    });

    it('deve aplicar precedência determinística: preferir "Patrimônio Líquido" sobre "Patrimônio Líquido Consolidado" sem misturar valores', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      // Linha de controladores (vencedora por precedência)
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-50000000.00'),
      });

      // Linha de total consolidado (secundária, não deve ser somada nem sobrepor)
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido Consolidado',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-60000000.00'),
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      // Seleciona exclusivamente os 50mi da coluna preferencial, sem somar nem misturar!
      expect(statements[0].dividendsDeclared?.toString()).toBe('50000000');
      expect(statements[0].dmplOrigin?.selectedColumn).toBe('Patrimônio Líquido');
    });

    it('deve manter dividendsDeclared como null quando a DMPL não for fornecida', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].dividendsDeclared).toBeNull();
      expect(statements[0].dmplOrigin).toBeNull();
    });

    it('deve manter dividendsDeclared como Decimal(0) quando o valor na DMPL for zero', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('0.00'),
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].dividendsDeclared).not.toBeNull();
      expect(statements[0].dividendsDeclared?.isZero()).toBe(true);
      expect(statements[0].dividendsDeclared?.toString()).toBe('0');
      expect(statements[0].dmplOrigin?.declaredAmount.isZero()).toBe(true);
    });

    it('deve ser idempotente diante de duplicidades idênticas na DMPL', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      const dmplRow: ParsedCvmDmplRow = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-40000000.00'),
      };

      agg.ingestDmplRow(dmplRow);
      agg.ingestDmplRow(dmplRow); // Duplicidade idêntica

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].dividendsDeclared?.toString()).toBe('40000000');
    });

    it('deve descartar período quando houver duplicidade conflitante na DMPL', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }

      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-40000000.00'),
      });

      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-50000000.00'), // Valor diferente no mesmo período e versão!
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(0); // Descartado por conflito
      expect(agg.getMetrics().conflictingStatementsDiscarded).toBe(1);
    });

    it('deve isolar estritamente DMPL pela maior versão sem misturar versões anteriores', () => {
      const agg = new CvmDfpAggregator(sampleContext);
      // Ingestão de versão 1 e versão 2
      for (const row of createDummyStatementRows(1)) {
        agg.ingestRow(row);
      }
      for (const row of createDummyStatementRows(2)) {
        agg.ingestRow(row);
      }

      // DMPL versão 1: -10mi
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-10000000.00'),
      });

      // DMPL versão 2 (vencedora): -25mi
      agg.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con',
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-25000000.00'),
      });

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].version).toBe(2);
      expect(statements[0].dividendsDeclared?.toString()).toBe('25000000');
    });

    it('deve rejeitar contaminação cruzada: aggCon rejeita DMPL_ind e aggInd rejeita DMPL_con', () => {
      // 1. Agregador CON não aceita DMPL_ind
      const aggCon = new CvmDfpAggregator(sampleContext, 'CONSOLIDATED');
      for (const row of createDummyStatementRows(1)) {
        aggCon.ingestRow(row);
      }
      aggCon.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_ind', // Erro proposital: tentar injetar individual em CON
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-99000000.00'),
      });
      const conStmts = aggCon.finalize();
      expect(conStmts[0].dividendsDeclared).toBeNull();
      expect(conStmts[0].dmplOrigin).toBeNull();

      // 2. Agregador IND não aceita DMPL_con
      const aggInd = new CvmDfpAggregator(sampleContext, 'INDIVIDUAL');
      for (const row of createDummyStatementRows(1)) {
        aggInd.ingestRow({ ...row, physicalType: row.physicalType.replace('_con', '_ind') as any });
      }
      aggInd.ingestDmplRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        statementOrigin: 'DMPL_con', // Erro proposital: tentar injetar consolidado em IND
        column: 'Patrimônio Líquido',
        accountCode: '5.04.06',
        accountDescription: 'Dividendos',
        accountValue: new Decimal('-77000000.00'),
      });
      const indStmts = aggInd.finalize();
      expect(indStmts[0].dividendsDeclared).toBeNull();
      expect(indStmts[0].dmplOrigin).toBeNull();
    });
  });
});
