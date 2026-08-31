import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { describe, expect, it } from 'vitest';
import {
  CvmDfpAggregator,
  assertStreamContextCompatibility,
  parseCvmStatementStream,
  validateCvmParserContext,
} from '@/modules/market-data/domain/cvm-dfp-parser';
import { parseCvmCadStream } from '@/modules/market-data/domain/cvm-cad-parser';
import {
  CvmIncompatibleStreamContextError,
  CvmInvalidContextError,
  CvmInvalidHeaderError,
  type CvmDfpMetrics,
  type CvmParserContext,
} from '@/modules/market-data/domain/cvm-parser.types';
import { Decimal } from '@/lib/decimal';

describe('CVM DFP Parser & Streaming Aggregator (Unit & Stream)', () => {
  const validParentZipContext: CvmParserContext = {
    fileId: 'a0000000-0000-4000-8000-000000000001',
    sourceFileType: 'DFP_ZIP',
    referenceYear: 2024,
    runId: 'b0000000-0000-4000-8000-000000000002',
    parserVersion: '1.0.0',
  };

  describe('Validação Prévia do Contexto de Proveniência do ZIP Pai', () => {
    it('deve aceitar contexto com UUIDs válidos, sourceFileType DFP_ZIP, ano de referência e parserVersion', () => {
      expect(() => validateCvmParserContext(validParentZipContext)).not.toThrow();
    });

    it('deve rejeitar contexto sem fileId ou com UUID inválido', () => {
      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          fileId: 'not-a-uuid',
        })
      ).toThrow(CvmInvalidContextError);

      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          fileId: '',
        })
      ).toThrow(CvmInvalidContextError);
    });

    it('deve rejeitar contexto com sourceFileType inválido ou que represente CSV individual', () => {
      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          sourceFileType: 'BPA_CSV' as any,
        })
      ).toThrow(CvmInvalidContextError);
    });

    it('deve rejeitar contexto com referenceYear inválido', () => {
      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          referenceYear: 1800,
        })
      ).toThrow(CvmInvalidContextError);

      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          referenceYear: 2150,
        })
      ).toThrow(CvmInvalidContextError);
    });

    it('deve rejeitar contexto sem runId ou com UUID inválido', () => {
      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          runId: 'invalid-run-id',
        })
      ).toThrow(CvmInvalidContextError);
    });

    it('deve rejeitar contexto com parserVersion vazia', () => {
      expect(() =>
        validateCvmParserContext({
          ...validParentZipContext,
          parserVersion: '   ',
        })
      ).toThrow(CvmInvalidContextError);
    });
  });

  describe('Compatibilidade Integral de Contexto entre Streams', () => {
    it('deve aceitar streams que compartilham o mesmo contexto do ZIP pai', () => {
      const bpaStreamContext: CvmParserContext = { ...validParentZipContext };
      expect(() =>
        assertStreamContextCompatibility(validParentZipContext, bpaStreamContext)
      ).not.toThrow();
    });

    it('deve rejeitar divergência em fileId com CvmIncompatibleStreamContextError', () => {
      const divergentContext: CvmParserContext = {
        ...validParentZipContext,
        fileId: 'a0000000-0000-4000-8000-000000000099',
      };
      expect(() =>
        assertStreamContextCompatibility(validParentZipContext, divergentContext)
      ).toThrow(CvmIncompatibleStreamContextError);
    });

    it('deve rejeitar divergência em runId com CvmIncompatibleStreamContextError', () => {
      const divergentContext: CvmParserContext = {
        ...validParentZipContext,
        runId: 'b0000000-0000-4000-8000-000000000099',
      };
      expect(() =>
        assertStreamContextCompatibility(validParentZipContext, divergentContext)
      ).toThrow(CvmIncompatibleStreamContextError);
    });

    it('deve rejeitar divergência em referenceYear com CvmIncompatibleStreamContextError', () => {
      const divergentContext: CvmParserContext = {
        ...validParentZipContext,
        referenceYear: 2023,
      };
      expect(() =>
        assertStreamContextCompatibility(validParentZipContext, divergentContext)
      ).toThrow(CvmIncompatibleStreamContextError);
    });

    it('deve rejeitar divergência em parserVersion com CvmIncompatibleStreamContextError', () => {
      const divergentContext: CvmParserContext = {
        ...validParentZipContext,
        parserVersion: '2.0.0',
      };
      expect(() =>
        assertStreamContextCompatibility(validParentZipContext, divergentContext)
      ).toThrow(CvmIncompatibleStreamContextError);
    });
  });

  describe('Parser de Linhas Contábeis Individuais (parseCvmStatementStream)', () => {
    it('deve processar linhas ÚLTIMO, aplicar escala MIL/UNIDADE e ignorar linhas PENÚLTIMO', async () => {
      async function* mockBpaStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';
        // Linha ÚLTIMO em MIL -> 100 * 1000 = 100000
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-12-31;1;Ativo Total;100.0000000000;S';
        // Linha PENÚLTIMO -> Deve ser ignorada
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;PENÚLTIMO;2023-12-31;1;Ativo Total;90.0000000000;S';
        // Linha ÚLTIMO em UNIDADE -> 500
        yield '33.592.510/0001-54;2024-12-31;1;VALE;4170;DF Consolidado;REAL;UNIDADE;ÚLTIMO;2024-12-31;1;Ativo Total;500.0000000000;S';
      }

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

      const rows: any[] = [];
      for await (const row of parseCvmStatementStream(mockBpaStream(), 'BPA_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);
      expect(metrics.totalLinesRead).toBe(4);
      expect(metrics.relevantLinesProcessed).toBe(2);
      expect(metrics.skippedPenultimoLines).toBe(1);

      // Petrobras: 100 * 1000 = 100000 em Decimal
      expect(rows[0].cnpj).toBe('33000167000101');
      expect(rows[0].cvmCode).toBe('009512');
      expect(rows[0].accountValue.toString()).toBe('100000');
      expect(rows[0].accountValue instanceof Decimal).toBe(true);

      // Vale: 500 em Decimal
      expect(rows[1].cnpj).toBe('33592510000154');
      expect(rows[1].cvmCode).toBe('004170');
      expect(rows[1].accountValue.toString()).toBe('500');
    });

    it('deve suportar valores contábeis negativos (prejuízos) e valores com ponto decimal', async () => {
      async function* mockDreStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;3.11;Prejuízo Consolidado;-2500.5000000000;S';
      }

      const metrics: any = { totalLinesRead: 0, relevantLinesProcessed: 0, skippedPenultimoLines: 0 };
      const rows: any[] = [];
      for await (const row of parseCvmStatementStream(mockDreStream(), 'DRE_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      // -2500.5 * 1000 = -2500500 em Decimal
      expect(rows[0].accountValue.toString()).toBe('-2500500');
      expect(rows[0].accountValue.isNegative()).toBe(true);
    });

    it('deve descartar linhas com valores numéricos corrompidos ou escalas desconhecidas', async () => {
      async function* corruptedStream() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF;REAL;MIL;ÚLTIMO;2024-12-31;1;Ativo;CORROMPIDO;S';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF;REAL;BILHAO;ÚLTIMO;2024-12-31;1;Ativo;100;S';
      }

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

      const rows: any[] = [];
      for await (const row of parseCvmStatementStream(corruptedStream(), 'BPA_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(0);
      expect(metrics.corruptedLinesCount).toBe(1);
      expect(metrics.invalidScaleLines).toBe(1);
    });

    it('deve lançar CvmInvalidHeaderError se o cabeçalho for incompatível', async () => {
      async function* invalidStream() {
        yield 'COLUNA_A;COLUNA_B';
        yield '1;2';
      }
      const metrics: any = { totalLinesRead: 0 };
      const iterator = parseCvmStatementStream(invalidStream(), 'BPA_con', metrics);
      await expect(iterator.next()).rejects.toThrow(CvmInvalidHeaderError);
    });
  });

  describe('Precedência de VERSAO Canônica Tripartite e Isolamento de Entidades', () => {
    it('deve rastrear versões independentes para duas entidades com mesmo CNPJ/data mas CD_CVM distintos', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);

      // Entidade A: CD_CVM 001111 com VERSAO 1 e 2
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '001111',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'CIA A',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo',
        accountValue: new Decimal(100),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '001111',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'CIA A',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo',
        accountValue: new Decimal(200),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '001111',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'CIA A',
        physicalType: 'BPP_con',
        accountCode: '2.03',
        accountDescription: 'PL',
        accountValue: new Decimal(150),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '001111',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'CIA A',
        physicalType: 'DRE_con',
        accountCode: '3.01',
        accountDescription: 'Receita',
        accountValue: new Decimal(300),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '001111',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'CIA A',
        physicalType: 'DRE_con',
        accountCode: '3.11',
        accountDescription: 'Lucro',
        accountValue: new Decimal(50),
      });

      // Entidade B: mesmo CNPJ/data, mas CD_CVM 002222 somente com VERSAO 1
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '002222',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'CIA B',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo',
        accountValue: new Decimal(500),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '002222',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'CIA B',
        physicalType: 'BPP_con',
        accountCode: '2.03',
        accountDescription: 'PL',
        accountValue: new Decimal(400),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '002222',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'CIA B',
        physicalType: 'DRE_con',
        accountCode: '3.01',
        accountDescription: 'Receita',
        accountValue: new Decimal(600),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '002222',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'CIA B',
        physicalType: 'DRE_con',
        accountCode: '3.11',
        accountDescription: 'Lucro',
        accountValue: new Decimal(80),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(2);

      const stmtA = statements.find((s) => s.cvmCode === '001111')!;
      expect(stmtA).toBeDefined();
      expect(stmtA.version).toBe(2); // Entidade A consolidou na v2
      expect(stmtA.totalAssets.toString()).toBe('200');

      const stmtB = statements.find((s) => s.cvmCode === '002222')!;
      expect(stmtB).toBeDefined();
      expect(stmtB.version).toBe(1); // Entidade B consolidou na v1, sem contaminação da v2 de A
      expect(stmtB.totalAssets.toString()).toBe('500');
    });
  });

  describe('Tratamento de Duplicidades e Detecção de Conflitos', () => {
    it('deve garantir idempotência estrita com duplicidades idênticas em ordens diferentes', () => {
      const row1 = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPA_con' as const,
        accountCode: '1',
        accountDescription: 'Ativo Total',
        accountValue: new Decimal(1000),
      };
      const rowPL = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPP_con' as const,
        accountCode: '2.03',
        accountDescription: 'PL',
        accountValue: new Decimal(500),
      };
      const rowRec = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con' as const,
        accountCode: '3.01',
        accountDescription: 'Receita',
        accountValue: new Decimal(800),
      };
      const rowLucro = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con' as const,
        accountCode: '3.11',
        accountDescription: 'Lucro',
        accountValue: new Decimal(200),
      };

      // Execução 1: ordem padrão com repetição
      const agg1 = new CvmDfpAggregator(validParentZipContext);
      agg1.ingestRow(row1);
      agg1.ingestRow(row1); // Repetição idêntica
      agg1.ingestRow(rowPL);
      agg1.ingestRow(rowRec);
      agg1.ingestRow(rowLucro);
      const res1 = agg1.finalize();

      // Execução 2: ordem inversa com repetição
      const agg2 = new CvmDfpAggregator(validParentZipContext);
      agg2.ingestRow(rowLucro);
      agg2.ingestRow(rowRec);
      agg2.ingestRow(rowPL);
      agg2.ingestRow(row1);
      agg2.ingestRow(row1); // Repetição idêntica
      const res2 = agg2.finalize();

      expect(res1).toHaveLength(1);
      expect(res2).toHaveLength(1);
      expect(res1[0].totalAssets.toString()).toBe(res2[0].totalAssets.toString());
      expect(res1[0].sourceReference).toBe(res2[0].sourceReference);
    });

    it('deve descartar período que contenha duplicidades conflitantes (valores numéricos divergentes)', () => {
      const agg = new CvmDfpAggregator(validParentZipContext);

      // Ingestão com conta '1' divergente: primeiro 1000, depois 9999
      agg.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo Total',
        accountValue: new Decimal(1000),
      });
      agg.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo Total',
        accountValue: new Decimal(9999), // CONFLITO!
      });
      agg.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPP_con',
        accountCode: '2.03',
        accountDescription: 'PL',
        accountValue: new Decimal(500),
      });
      agg.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.01',
        accountDescription: 'Receita',
        accountValue: new Decimal(800),
      });
      agg.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.11',
        accountDescription: 'Lucro',
        accountValue: new Decimal(200),
      });

      const statements = agg.finalize();
      const metrics = agg.getMetrics();

      // Período afetado por conflito deve ser descartado
      expect(statements).toHaveLength(0);
      expect(metrics.conflictingDuplicateLines).toBe(1);
      expect(metrics.conflictingStatementsDiscarded).toBe(1);
      expect(metrics.completeStatementsEmitted).toBe(0);
    });
  });

  describe('Streaming Real com Leitura Física das Fixtures (latin1, \\r\\n e \\n)', () => {
    it('deve agregar BPA, BPP e DRE das fixtures físicas, selecionar a maior versão e aplicar fallback de lucro líquido', async () => {
      // 1. Carrega o cadastro para filtragem de setores elegíveis
      const cadPath = path.resolve(process.cwd(), 'tests/fixtures/cvm/cad_sample.csv');
      const cadRl = readline.createInterface({
        input: fs.createReadStream(cadPath, { encoding: 'latin1' }),
        crlfDelay: Infinity,
      });
      const { companies: eligibleCadCompanies } = await parseCvmCadStream(cadRl);

      // 2. Inicializa o agregador com o contexto obrigatório do ZIP pai e cadastro
      const aggregator = new CvmDfpAggregator(validParentZipContext, eligibleCadCompanies);

      // 3. Alimenta BPA_con
      const bpaPath = path.resolve(process.cwd(), 'tests/fixtures/cvm/dfp_bpa_sample.csv');
      const bpaRl = readline.createInterface({
        input: fs.createReadStream(bpaPath, { encoding: 'latin1' }),
        crlfDelay: Infinity,
      });
      for await (const row of parseCvmStatementStream(bpaRl, 'BPA_con', aggregator.getMetrics())) {
        aggregator.ingestRow(row);
      }

      // 4. Alimenta BPP_con
      const bppPath = path.resolve(process.cwd(), 'tests/fixtures/cvm/dfp_bpp_sample.csv');
      const bppRl = readline.createInterface({
        input: fs.createReadStream(bppPath, { encoding: 'latin1' }),
        crlfDelay: Infinity,
      });
      for await (const row of parseCvmStatementStream(bppRl, 'BPP_con', aggregator.getMetrics())) {
        aggregator.ingestRow(row);
      }

      // 5. Alimenta DRE_con
      const drePath = path.resolve(process.cwd(), 'tests/fixtures/cvm/dfp_dre_sample.csv');
      const dreRl = readline.createInterface({
        input: fs.createReadStream(drePath, { encoding: 'latin1' }),
        crlfDelay: Infinity,
      });
      for await (const row of parseCvmStatementStream(dreRl, 'DRE_con', aggregator.getMetrics())) {
        aggregator.ingestRow(row);
      }

      // 6. Finaliza a consolidação
      const statements = aggregator.finalize();
      const metrics = aggregator.getMetrics();

      // Devem ser emitidos exatamente 2 demonstrativos completos: Petrobras e Vale
      expect(statements).toHaveLength(2);
      expect(metrics.completeStatementsEmitted).toBe(2);

      // ─── Teste Petrobras (Maior Versão 2 Consolidada) ─────────────────────
      const petr = statements.find((s) => s.cnpj === '33000167000101')!;
      expect(petr).toBeDefined();
      expect(petr.version).toBe(2); // Precedência determinística de maior versão
      expect(petr.cvmCode).toBe('009512');
      expect(petr.netRevenue.toString()).toBe('490829000000'); // 490829000 MIL * 1000
      expect(petr.totalAssets.toString()).toBe('1089761000000'); // 1089761000 MIL * 1000
      expect(petr.totalEquity.toString()).toBe('400587000000'); // 400587000 MIL * 1000
      expect(petr.netIncome.toString()).toBe('30431000000'); // 30431000 MIL * 1000 (Conta 3.11)

      // Garantia dos campos nulos do MVP
      expect(petr.grossDebt).toBeNull();
      expect(petr.cashEquivalents).toBeNull();
      expect(petr.ebitda).toBeNull();
      expect(petr.sharesCount).toBeNull();
      expect(petr.dividendsDeclared).toBeNull();

      // Validação do sourceReference
      const petrSourceRef = JSON.parse(petr.sourceReference);
      expect(petrSourceRef.fileId).toBe(validParentZipContext.fileId);
      expect(petrSourceRef.runId).toBe(validParentZipContext.runId);
      expect(petrSourceRef.cnpj).toBe('33000167000101');
      expect(petrSourceRef.version).toBe(2);
      expect(petrSourceRef.entityLevel).toBe('COMPANY');
      expect(petrSourceRef.assetBindingPurpose).toBe('PUBLICATION_ALIAS');

      // ─── Teste Vale (Fallback de Lucro Líquido para 3.09) ─────────────────
      const vale = statements.find((s) => s.cnpj === '33592510000154')!;
      expect(vale).toBeDefined();
      expect(vale.version).toBe(1);
      expect(vale.cvmCode).toBe('004170');
      expect(vale.netRevenue.toString()).toBe('206005000000'); // UNIDADE
      expect(vale.totalAssets.toString()).toBe('487538000000');
      expect(vale.totalEquity.toString()).toBe('213720000000');
      expect(vale.netIncome.toString()).toBe('30431000000'); // Extraído da conta 3.09 (fallback de 3.11 ausente)

      // ─── Teste Empresa Incompleta (Descarte da Maior Versão Incompleta) ──
      const incompleta = statements.find((s) => s.cnpj === '99999999000199');
      expect(incompleta).toBeUndefined();

      // ─── Teste Empresa Sem Lucro (Descarte por Falta de 3.11 e 3.09) ──────
      const semLucro = statements.find((s) => s.cnpj === '88888888000188');
      expect(semLucro).toBeUndefined();
    });
  });
});
