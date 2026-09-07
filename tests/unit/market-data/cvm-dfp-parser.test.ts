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

  describe('Mapeamento Contábil de BPA e BPP no CvmDfpAggregator (Etapa 1)', () => {
    const baseRow = {
      cnpj: '33000167000101',
      cvmCode: '009512',
      referenceDate: '2024-12-31',
      version: 1,
      companyLegalName: 'PETRÓLEO BRASILEIRO S.A.',
    };

    function feedRequiredAccounts(aggregator: CvmDfpAggregator) {
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo Total',
        accountValue: new Decimal('1000000000'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.03',
        accountDescription: 'Patrimônio Líquido',
        accountValue: new Decimal('400000000'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'DRE_con',
        accountCode: '3.01',
        accountDescription: 'Receita Líquida',
        accountValue: new Decimal('500000000'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'DRE_con',
        accountCode: '3.11',
        accountDescription: 'Lucro Líquido',
        accountValue: new Decimal('120000000'),
      });
    }

    it('deve capturar 1.01.01 (caixa), 2.01.04 (CP) e 2.02.01 (LP), calculando dívida bruta quando ambas as parcelas estiverem presentes', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Ingestão de Caixa (BPA 1.01.01)
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPA_con',
        accountCode: '1.01.01',
        accountDescription: 'Caixa e Equivalentes de Caixa',
        accountValue: new Decimal('50000000.0000'),
      });

      // Ingestão de Dívida CP (BPP 2.01.04) e Dívida LP (BPP 2.02.01)
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.01.04',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('30000000.0000'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.02.01',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('70000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.cashEquivalents?.toString()).toBe('50000000');
      expect(stmt.shortTermDebt?.toString()).toBe('30000000');
      expect(stmt.longTermDebt?.toString()).toBe('70000000');
      expect(stmt.grossDebt?.toString()).toBe('100000000'); // 30M + 70M = 100M
      expect(stmt.ebitda).toBeNull();
      expect(stmt.sharesCount).toBeNull();
      expect(stmt.dividendsDeclared).toBeNull();
    });

    it('deve definir grossDebt como null se a parcela de curto prazo (2.01.04) estiver ausente', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Somente parcela LP presente
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.02.01',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('70000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.shortTermDebt).toBeNull();
      expect(stmt.longTermDebt?.toString()).toBe('70000000');
      expect(stmt.grossDebt).toBeNull(); // Regra estrita: ausência de parcela invalida grossDebt
    });

    it('deve definir grossDebt como null se a parcela de longo prazo (2.02.01) estiver ausente', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Somente parcela CP presente
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.01.04',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('30000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.shortTermDebt?.toString()).toBe('30000000');
      expect(stmt.longTermDebt).toBeNull();
      expect(stmt.grossDebt).toBeNull(); // Regra estrita: ausência de parcela invalida grossDebt
    });

    it('deve definir cashEquivalents como null quando 1.01.01 estiver ausente', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].cashEquivalents).toBeNull();
    });

    it('deve diferenciar rigorosamente conta ausente (null) de conta presente com valor zero (Decimal(0))', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Ingestão com valor ZERO explícito para Caixa e Dívida CP
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPA_con',
        accountCode: '1.01.01',
        accountDescription: 'Caixa e Equivalentes de Caixa',
        accountValue: new Decimal('0'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.01.04',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('0'),
      });
      aggregator.ingestRow({
        ...baseRow,
        physicalType: 'BPP_con',
        accountCode: '2.02.01',
        accountDescription: 'Empréstimos e Financiamentos',
        accountValue: new Decimal('50000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // Caixa presente com valor zero NÃO pode ser null
      expect(stmt.cashEquivalents).not.toBeNull();
      expect(stmt.cashEquivalents?.isZero()).toBe(true);
      expect(stmt.cashEquivalents?.toString()).toBe('0');

      // Dívida CP presente com valor zero NÃO pode ser null
      expect(stmt.shortTermDebt).not.toBeNull();
      expect(stmt.shortTermDebt?.isZero()).toBe(true);

      // Dívida bruta calculada corretamente: 0 + 50M = 50M
      expect(stmt.grossDebt).not.toBeNull();
      expect(stmt.grossDebt?.toString()).toBe('50000000');
    });

    it('deve preservar precisão Decimal em escala MIL e UNIDADE para contas de balanço', async () => {
      async function* mockStreamMil() {
        yield 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-12-31;1.01.01;Caixa e Equivalentes de Caixa;28595666.1234567890;S';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-12-31;2.01.04;Empréstimos e Financiamentos;1276391.0000000000;S';
        yield '33.000.167/0001-01;2024-12-31;1;PETROBRAS;9512;DF Consolidado;REAL;MIL;ÚLTIMO;2024-12-31;2.02.01;Empréstimos e Financiamentos;2176337.0000000000;S';
      }

      const metrics: any = { totalLinesRead: 0, relevantLinesProcessed: 0, skippedPenultimoLines: 0 };
      const rows: any[] = [];
      for await (const row of parseCvmStatementStream(mockStreamMil(), 'BPA_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(3);
      // 28595666.1234567890 * 1000 = 28595666123.456789
      expect(rows[0].accountValue.toString()).toBe('28595666123.456789');
      // 1276391 * 1000 = 1276391000
      expect(rows[1].accountValue.toString()).toBe('1276391000');
      // 2176337 * 1000 = 2176337000
      expect(rows[2].accountValue.toString()).toBe('2176337000');
    });

    it('deve associar capitalComposition à maior versão do demonstrativo contábil', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Ingestão de composição acionária com mesma versão (v1)
      aggregator.ingestCapitalCompositionRow({
        cnpj: '33000167000101',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETRÓLEO BRASILEIRO S.A.',
        ordinaryShares: new Decimal('7442454142'),
        preferredShares: new Decimal('5602042788'),
        totalShares: new Decimal('13044496930'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.capitalComposition).toBeDefined();
      expect(stmt.capitalComposition?.ordinaryShares?.toString()).toBe('7442454142');
      expect(stmt.capitalComposition?.preferredShares?.toString()).toBe('5602042788');
      expect(stmt.capitalComposition?.totalShares?.toString()).toBe('13044496930');
    });

    it('deve manter capitalComposition como null se houver divergência de versão', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedRequiredAccounts(aggregator);

      // Composição informada para v2, mas demonstrativo contábil consolidado em v1
      aggregator.ingestCapitalCompositionRow({
        cnpj: '33000167000101',
        referenceDate: '2024-12-31',
        version: 2, // Divergente
        companyLegalName: 'PETRÓLEO BRASILEIRO S.A.',
        ordinaryShares: new Decimal('7442454142'),
        preferredShares: new Decimal('5602042788'),
        totalShares: new Decimal('13044496930'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      expect(statements[0].capitalComposition).toBeNull();
    });

    it('deve descartar linhas com VERSAO parcial como "1abc" ou data inválida como "2024-02-31" em parseCvmStatementStream', async () => {
      async function* invalidStream() {
        yield 'CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;DENOM_CIA;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA';
        // Linha com VERSAO = '1abc' (deve ser descartada como corrompida)
        yield '33.000.167/0001-01;009512;2024-12-31;1abc;PETROBRAS;MIL;ÚLTIMO;1;Ativo Total;1000';
        // Linha com data impossível '2024-02-31' (deve ser descartada como corrompida)
        yield '33.000.167/0001-01;009512;2024-02-31;1;PETROBRAS;MIL;ÚLTIMO;1;Ativo Total;1000';
        // Linha válida
        yield '33.000.167/0001-01;009512;2024-12-31;1;PETROBRAS;MIL;ÚLTIMO;1;Ativo Total;1000';
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
      for await (const row of parseCvmStatementStream(invalidStream(), 'BPA_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].version).toBe(1);
      expect(rows[0].referenceDate).toBe('2024-12-31');
      expect(metrics.corruptedLinesCount).toBe(2);
    });
  });

  describe('Etapa 3 — Demonstração dos Fluxos de Caixa (DFC) e Cálculo de EBITDA', () => {
    function feedCoreAccounts(
      agg: CvmDfpAggregator,
      cnpj = '33000167000101',
      cvmCode = '009512',
      refDate = '2024-12-31',
      version = 1
    ) {
      agg.ingestRow({
        cnpj,
        cvmCode,
        referenceDate: refDate,
        version,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPA_con',
        accountCode: '1',
        accountDescription: 'Ativo Total',
        accountValue: new Decimal('1000000000.0000'),
      });
      agg.ingestRow({
        cnpj,
        cvmCode,
        referenceDate: refDate,
        version,
        companyLegalName: 'PETROBRAS',
        physicalType: 'BPP_con',
        accountCode: '2.03',
        accountDescription: 'Patrimônio Líquido',
        accountValue: new Decimal('500000000.0000'),
      });
      agg.ingestRow({
        cnpj,
        cvmCode,
        referenceDate: refDate,
        version,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.01',
        accountDescription: 'Receita Líquida',
        accountValue: new Decimal('800000000.0000'),
      });
      agg.ingestRow({
        cnpj,
        cvmCode,
        referenceDate: refDate,
        version,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.11',
        accountDescription: 'Lucro Líquido',
        accountValue: new Decimal('150000000.0000'),
      });
    }

    it('deve parsear stream de DFC_MI_con e DFC_MD_con com parseCvmStatementStream', async () => {
      async function* mockDfcStream() {
        yield 'CNPJ_CIA;CD_CVM;DT_REFER;VERSAO;DENOM_CIA;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA';
        yield '33.000.167/0001-01;009512;2024-12-31;1;PETROBRAS;MIL;ÚLTIMO;6.01.01.04;Depreciação, depleção e amortização;67033000.0000000000';
      }

      const metrics: any = { totalLinesRead: 0, relevantLinesProcessed: 0, skippedPenultimoLines: 0 };
      const rows: any[] = [];
      for await (const row of parseCvmStatementStream(mockDfcStream(), 'DFC_MI_con', metrics)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].physicalType).toBe('DFC_MI_con');
      expect(rows[0].accountCode).toBe('6.01.01.04');
      // 67033000 * 1000 = 67033000000
      expect(rows[0].accountValue.toString()).toBe('67033000000');
    });

    it('deve calcular EBITDA quando EBIT (DRE 3.05) e D&A (DFC 6.01.01) forem conhecidos', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // EBIT em DRE 3.05 = 100.000.000
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // D&A em DFC_MI 6.01.01.02 = 45.000.000
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('45000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.ebit?.toString()).toBe('100000000');
      expect(stmt.depreciationAmortization?.toString()).toBe('45000000');
      // EBITDA = 100M + 45M = 145M
      expect(stmt.ebitda?.toString()).toBe('145000000');
      expect(stmt.dividendsDeclared).toBeNull();
    });

    it('deve manter ebitda como null quando a DFC estiver ausente', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // Apenas DRE 3.05, sem DFC
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.ebit?.toString()).toBe('100000000');
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('deve manter ebitda como null quando o EBIT (3.05) estiver ausente, mesmo com DFC presente', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator); // sem 3.05

      // D&A presente
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('45000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.ebit).toBeNull();
      expect(stmt.depreciationAmortization?.toString()).toBe('45000000');
      expect(stmt.ebitda).toBeNull();
    });

    it('deve diferenciar estritamente conta ausente (null) de conta presente com valor zero (Decimal 0)', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // EBIT = 50.000.000
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('50000000.0000'),
      });

      // D&A presente com valor exatamente ZERO
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal(0),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.depreciationAmortization).not.toBeNull();
      expect(stmt.depreciationAmortization?.isZero()).toBe(true);
      // EBITDA = 50M + 0 = 50M (calculável e não nulo!)
      expect(stmt.ebitda?.toString()).toBe('50000000');
    });

    it('deve calcular EBITDA corretamente com sinais contábeis oficiais (EBIT negativo/prejuízo operacional)', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // EBIT negativo: -80.000.000 (prejuízo operacional)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('-80000000.0000'),
      });

      // D&A positivo: +50.000.000
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('50000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.ebit?.toString()).toBe('-80000000');
      expect(stmt.depreciationAmortization?.toString()).toBe('50000000');
      // EBITDA = -80M + 50M = -30M
      expect(stmt.ebitda?.toString()).toBe('-30000000');
    });

    it('deve consolidar múltiplas subcontas legítimas de D&A na DFC', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // Subconta 1: Depreciação de imobilizado (40M)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação de Imobilizado',
        accountValue: new Decimal('40000000.0000'),
      });

      // Subconta 2: Depreciação direito de uso (15M)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.03',
        accountDescription: 'Depreciação do ativo de direito de uso',
        accountValue: new Decimal('15000000.0000'),
      });

      // Subconta 3: Exaustão (5M)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.04',
        accountDescription: 'Exaustão de Recursos Minerais',
        accountValue: new Decimal('5000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // D&A total = 40M + 15M + 5M = 60M
      expect(stmt.depreciationAmortization?.toString()).toBe('60000000');
      // EBITDA = 100M + 60M = 160M
      expect(stmt.ebitda?.toString()).toBe('160000000');
    });

    it('deve excluir amortizações financeiras e despesas antecipadas do cálculo de D&A', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // D&A operacional legítimo (35M)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('35000000.0000'),
      });

      // Amortização financeira de empréstimos/debêntures (não operacional)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.18',
        accountDescription: 'Amortização de custos de captação de debêntures',
        accountValue: new Decimal('10000000.0000'),
      });

      // Amortização de despesas antecipadas (não operacional)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.19',
        accountDescription: 'Amortização de despesas antecipadas',
        accountValue: new Decimal('2000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // Apenas a D&A operacional de 35M deve ser considerada
      expect(stmt.depreciationAmortization?.toString()).toBe('35000000');
      expect(stmt.ebitda?.toString()).toBe('135000000');
    });

    it('não deve fazer fallback de DFC para versões inferiores quando a versão vencedora não possuir DFC', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);

      // V1 completa com DFC
      feedCoreAccounts(aggregator, '33000167000101', '009512', '2024-12-31', 1);
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'EBIT',
        accountValue: new Decimal('100000000.0000'),
      });
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('30000000.0000'),
      });

      // V2 (versão vencedora) completa com BPA, BPP, DRE, mas SEM DFC
      feedCoreAccounts(aggregator, '33000167000101', '009512', '2024-12-31', 2);
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 2,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'EBIT',
        accountValue: new Decimal('120000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.version).toBe(2);
      expect(stmt.ebit?.toString()).toBe('120000000');
      // Proibido fallback para DFC da v1!
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('não deve associar DFC de períodos incompatíveis', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);

      // Demonstrativo de 2024
      feedCoreAccounts(aggregator, '33000167000101', '009512', '2024-12-31', 1);
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'EBIT',
        accountValue: new Decimal('100000000.0000'),
      });

      // DFC de 2023 fornecida erroneamente
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2023-12-31', // Período anterior
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('40000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt2024 = statements.find((s) => s.referenceDate === '2024-12-31');

      expect(stmt2024).toBeDefined();
      expect(stmt2024?.ebitda).toBeNull();
      expect(stmt2024?.depreciationAmortization).toBeNull();
    });

    it('não deve utilizar conta 3.99 ou contas arbitrárias não documentadas como fallback', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // DRE contendo conta arbitrária 3.99 ao invés de 3.05
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.99',
        accountDescription: 'Outras Receitas/Despesas 3.99',
        accountValue: new Decimal('100000000.0000'),
      });

      // DFC contendo conta fora de 6.01.01 (ex: amortização de empréstimo 6.03.02)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.03.02',
        accountDescription: 'Amortização de Empréstimos',
        accountValue: new Decimal('50000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // Conta 3.99 não é aceita para EBIT
      expect(stmt.ebit).toBeNull();
      // Conta 6.03.02 não é aceita para D&A
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('deve rejeitar DFC direta (DFC_MD_con) com código não comprovado e manter ebitda como null', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('80000000.0000'),
      });

      // DFC Método Direto fornecida (comprovadamente não possui D&A na CVM)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MD_con',
        accountCode: '6.01.02',
        accountDescription: 'Fornecedores - Materiais e Serviços',
        accountValue: new Decimal('20000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // DFC Direta não fornece D&A -> depreciationAmortization e ebitda devem ser null
      expect(stmt.ebit?.toString()).toBe('80000000');
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('deve rejeitar conta de DFC quando accountDescription estiver ausente ou vazia', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // Conta 6.01.01.02 sem descrição (string vazia ou apenas espaços)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.02',
        accountDescription: '',
        accountValue: new Decimal('30000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('deve rejeitar amortização financeira sem descrição ou com descrição de captação/dívida', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // 1. Amortização financeira com descrição de dívida/captação
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.01.01.18',
        accountDescription: 'Amortização do custo de transação de empréstimos e debêntures',
        accountValue: new Decimal('15000000.0000'),
      });

      // 2. Amortização financeira com código não operacional fora de 6.01.01 e sem descrição
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MI_con',
        accountCode: '6.03.03',
        accountDescription: '',
        accountValue: new Decimal('25000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('não deve combinar DRE_con com DFC individual (incompatibilidade entre tipos de demonstração)', () => {
      const aggregator = new CvmDfpAggregator(validParentZipContext);
      feedCoreAccounts(aggregator);

      // DRE Consolidada
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DRE_con',
        accountCode: '3.05',
        accountDescription: 'Resultado Antes do Resultado Financeiro e dos Tributos',
        accountValue: new Decimal('100000000.0000'),
      });

      // DFC fornecida em demonstrativo não consolidado (individual / outro physicalType)
      aggregator.ingestRow({
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        version: 1,
        companyLegalName: 'PETROBRAS',
        physicalType: 'DFC_MD_con', // Não é DFC_MI_con
        accountCode: '6.01.01.02',
        accountDescription: 'Depreciação e Amortização',
        accountValue: new Decimal('50000000.0000'),
      });

      const statements = aggregator.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // Deve preservar isolamento do slot DFC_MI_con: D&A e EBITDA permanecem nulos
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });
  });
});
