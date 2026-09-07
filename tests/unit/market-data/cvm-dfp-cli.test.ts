import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  parseCliArgs,
  maskConnectionString,
  extractZipEntry,
  createLineStreamFromBuffer,
  projectDryRunMetrics,
  runDfpIngestionPipeline,
} from '../../../scripts/ingest-cvm-dfp';
import { Decimal } from '../../../src/lib/decimal';
import {
  CvmDfpAggregator,
  parseCvmStatementStream,
} from '../../../src/modules/market-data/domain/cvm-dfp-parser';
import {
  convertStatementToFundamentals,
  selectStatementsForPublication,
  adaptAggregatedStatementToRawStatement,
} from '../../../src/modules/market-data/domain/cvm-fundamentals-engine';
import type { CvmRawStatementData } from '../../../src/modules/market-data/domain/cvm-fundamentals.types';
import type { CvmParserContext } from '../../../src/modules/market-data/domain/cvm-parser.types';

function createMockZipBuffer(fileName: string, content: string): Buffer {
  const uncompressed = Buffer.from(content, 'utf8');
  const compressed = zlib.deflateRawSync(uncompressed);

  // Local Header
  const fnBuf = Buffer.from(fileName, 'utf8');
  const localHeader = Buffer.alloc(30 + fnBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // Sig
  localHeader.writeUInt16LE(20, 4); // Version
  localHeader.writeUInt16LE(0, 6); // Flags
  localHeader.writeUInt16LE(8, 8); // Compression method (Deflate)
  localHeader.writeUInt16LE(0, 10); // Time
  localHeader.writeUInt16LE(0, 12); // Date
  localHeader.writeUInt32LE(0, 14); // CRC32 (dummy)
  localHeader.writeUInt32LE(compressed.length, 18); // Comp Size
  localHeader.writeUInt32LE(uncompressed.length, 22); // Uncomp Size
  localHeader.writeUInt16LE(fnBuf.length, 26); // Name len
  localHeader.writeUInt16LE(0, 28); // Extra len
  fnBuf.copy(localHeader, 30);

  const localOffset = 0;

  // Central Directory
  const cdHeader = Buffer.alloc(46 + fnBuf.length);
  cdHeader.writeUInt32LE(0x02014b50, 0); // Sig
  cdHeader.writeUInt16LE(20, 4); // Made by
  cdHeader.writeUInt16LE(20, 6); // Extract ver
  cdHeader.writeUInt16LE(0, 8); // Flags
  cdHeader.writeUInt16LE(8, 10); // Method
  cdHeader.writeUInt16LE(0, 12); // Time
  cdHeader.writeUInt16LE(0, 14); // Date
  cdHeader.writeUInt32LE(0, 16); // CRC32
  cdHeader.writeUInt32LE(compressed.length, 20); // Comp Size
  cdHeader.writeUInt32LE(uncompressed.length, 24); // Uncomp Size
  cdHeader.writeUInt16LE(fnBuf.length, 28); // Name len
  cdHeader.writeUInt16LE(0, 30); // Extra len
  cdHeader.writeUInt16LE(0, 32); // Comment len
  cdHeader.writeUInt16LE(0, 34); // Disk
  cdHeader.writeUInt16LE(0, 36); // Int attr
  cdHeader.writeUInt32LE(0, 38); // Ext attr
  cdHeader.writeUInt32LE(localOffset, 42); // Local offset
  fnBuf.copy(cdHeader, 46);

  const cdOffset = localHeader.length + compressed.length;

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Sig
  eocd.writeUInt16LE(0, 4); // Disk
  eocd.writeUInt16LE(0, 6); // CD Disk
  eocd.writeUInt16LE(1, 8); // Entries disk
  eocd.writeUInt16LE(1, 10); // Total entries
  eocd.writeUInt32LE(cdHeader.length, 12); // CD size
  eocd.writeUInt32LE(cdOffset, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // Comment len

  return Buffer.concat([localHeader, compressed, cdHeader, eocd]);
}

function createMultiFileZipBuffer(files: Array<{ fileName: string; content: string }>): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let currentLocalOffset = 0;

  for (const file of files) {
    const uncompressed = Buffer.from(file.content, 'latin1');
    const compressed = zlib.deflateRawSync(uncompressed);
    const fnBuf = Buffer.from(file.fileName, 'utf8');

    const localHeader = Buffer.alloc(30 + fnBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Sig
    localHeader.writeUInt16LE(20, 4); // Version
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Method (Deflate)
    localHeader.writeUInt16LE(0, 10); // Time
    localHeader.writeUInt16LE(0, 12); // Date
    localHeader.writeUInt32LE(0, 14); // CRC32
    localHeader.writeUInt32LE(compressed.length, 18); // Comp Size
    localHeader.writeUInt32LE(uncompressed.length, 22); // Uncomp Size
    localHeader.writeUInt16LE(fnBuf.length, 26); // Name len
    localHeader.writeUInt16LE(0, 28); // Extra len
    fnBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    const cdHeader = Buffer.alloc(46 + fnBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Sig
    cdHeader.writeUInt16LE(20, 4); // Made by
    cdHeader.writeUInt16LE(20, 6); // Extract ver
    cdHeader.writeUInt16LE(0, 8); // Flags
    cdHeader.writeUInt16LE(8, 10); // Method
    cdHeader.writeUInt16LE(0, 12); // Time
    cdHeader.writeUInt16LE(0, 14); // Date
    cdHeader.writeUInt32LE(0, 16); // CRC32
    cdHeader.writeUInt32LE(compressed.length, 20); // Comp Size
    cdHeader.writeUInt32LE(uncompressed.length, 24); // Uncomp Size
    cdHeader.writeUInt16LE(fnBuf.length, 28); // Name len
    cdHeader.writeUInt16LE(0, 30); // Extra len
    cdHeader.writeUInt16LE(0, 32); // Comment len
    cdHeader.writeUInt16LE(0, 34); // Disk
    cdHeader.writeUInt16LE(0, 36); // Int attr
    cdHeader.writeUInt32LE(0, 38); // Ext attr
    cdHeader.writeUInt32LE(currentLocalOffset, 42); // Local offset
    fnBuf.copy(cdHeader, 46);

    cdHeaders.push(cdHeader);
    currentLocalOffset += localHeader.length + compressed.length;
  }

  const cdTotalBuf = Buffer.concat(cdHeaders);
  const cdOffset = currentLocalOffset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Sig
  eocd.writeUInt16LE(0, 4); // Disk
  eocd.writeUInt16LE(0, 6); // CD Disk
  eocd.writeUInt16LE(files.length, 8); // Entries disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  eocd.writeUInt32LE(cdTotalBuf.length, 12); // CD size
  eocd.writeUInt32LE(cdOffset, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // Comment len

  return Buffer.concat([...localHeaders, cdTotalBuf, eocd]);
}

describe('CVM DFP CLI & Ingestion Unit Tests', () => {
  describe('1. Parsing de Argumentos CLI e Máscara de Credenciais', () => {
    it('deve usar valores padrão quando nenhum argumento for fornecido', () => {
      const args = parseCliArgs([]);
      expect(args.inputPath).toBe('.local-data/cvm/dfp_cia_aberta_2024.zip');
      expect(args.referenceYear).toBe(2024);
      expect(args.isDryRun).toBe(false);
    });

    it('deve processar flags customizadas (--input, --year, --dry-run, --env)', () => {
      const args = parseCliArgs([
        '--input=.local-data/custom.zip',
        '--year=2023',
        '--dry-run',
        '--env=development',
      ]);
      expect(args.inputPath).toBe('.local-data/custom.zip');
      expect(args.referenceYear).toBe(2023);
      expect(args.isDryRun).toBe(true);
      expect(args.targetEnv).toBe('development');
    });

    it('deve mascarar credenciais de conexão do banco de dados', () => {
      const masked = maskConnectionString('postgresql://admin:secret123@localhost:5433/carteiraexpert');
      expect(masked).toBe('postgresql://****:****@localhost:5433/carteiraexpert');
      expect(masked).not.toContain('admin');
      expect(masked).not.toContain('secret123');
    });
  });

  describe('2. Utilitário de Extração ZIP Seguro', () => {
    it('deve extrair arquivo correspondente com sucesso', () => {
      const zipBuf = createMockZipBuffer('dfp_cia_aberta_BPA_con_2024.csv', 'CNPJ_CIA;CD_CVM\n33000167000101;009512');
      const entry = extractZipEntry(zipBuf, /BPA_con_2024\.csv$/i);

      expect(entry).not.toBeNull();
      expect(entry?.fileName).toBe('dfp_cia_aberta_BPA_con_2024.csv');
      expect(entry?.data.toString('utf8')).toContain('33000167000101');
    });

    it('deve extrair arquivo de composição de capital com sucesso', () => {
      const zipBuf = createMockZipBuffer(
        'dfp_cia_aberta_composicao_capital_2024.csv',
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;QT_ACAO_ORDIN_CAP_INTEGR\n33000167000101;2024-12-31;1;PETROBRAS;7442454142'
      );
      const entry = extractZipEntry(zipBuf, /composicao_capital_2024\.csv$/i);

      expect(entry).not.toBeNull();
      expect(entry?.fileName).toBe('dfp_cia_aberta_composicao_capital_2024.csv');
      expect(entry?.data.toString('utf8')).toContain('7442454142');
    });

    it('deve bloquear tentativa de Zip Slip com path traversal', () => {
      const zipBuf = createMockZipBuffer('../malicious.txt', 'evil');
      expect(() => extractZipEntry(zipBuf, /malicious/)).toThrow(/Zip Slip/);
    });

    it('deve falhar se o arquivo ZIP estiver corrompido sem EOCD', () => {
      const corruptedBuf = Buffer.from('not a zip buffer');
      expect(() => extractZipEntry(corruptedBuf, /test/)).toThrow(/EOCD não localizado/);
    });
  });

  describe('3. Stream de Linhas e Agregação Contábil DFP', () => {
    it('deve iterar corretamente linha por linha a partir do buffer', async () => {
      const sample = Buffer.from('linha1\nlinha2\r\nlinha3\n', 'utf8');
      const lines: string[] = [];
      for await (const line of createLineStreamFromBuffer(sample)) {
        lines.push(line);
      }
      expect(lines).toEqual(['linha1', 'linha2\r', 'linha3']);
    });

    it('deve consolidar contas e calcular indicadores prioritários', () => {
      const accounts = new Map<string, Decimal>();
      accounts.set('1', new Decimal('500000000')); // Ativo Total: 500M
      accounts.set('2.03', new Decimal('200000000')); // PL: 200M
      accounts.set('3.01', new Decimal('100000000')); // Receita Líquida: 100M
      accounts.set('3.11', new Decimal('25000000')); // Lucro Líquido: 25M
      accounts.set('3.05', new Decimal('35000000')); // EBITDA: 35M
      accounts.set('2.01.04', new Decimal('20000000')); // Dívida CP: 20M
      accounts.set('2.02.01', new Decimal('80000000')); // Dívida LP: 80M
      accounts.set('1.01.01', new Decimal('30000000')); // Caixa: 30M

      const rawStmt: CvmRawStatementData = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        sourceReference: '{"source":"cvm_dfp"}',
        accounts,
      };

      const converted = convertStatementToFundamentals(rawStmt);

      expect(converted.totalAssets.toString()).toBe('500000000');
      expect(converted.totalEquity.toString()).toBe('200000000');
      expect(converted.netRevenue.toString()).toBe('100000000');
      expect(converted.netIncome.toString()).toBe('25000000');
      expect(converted.grossDebt?.toString()).toBe('100000000'); // 20M + 80M
      expect(converted.cashEquivalents?.toString()).toBe('30000000');
      expect(converted.netDebt?.toString()).toBe('70000000'); // 100M - 30M
      expect(converted.referencePeriod).toBe('2024-FY');
    });

    it('deve priorizar demonstrações CONSOLIDATED sobre INDIVIDUAL', () => {
      const accountsCon = new Map<string, Decimal>();
      accountsCon.set('1', new Decimal('500000000'));
      accountsCon.set('2.03', new Decimal('200000000'));
      accountsCon.set('3.01', new Decimal('100000000'));
      accountsCon.set('3.11', new Decimal('25000000'));

      const accountsInd = new Map<string, Decimal>();
      accountsInd.set('1', new Decimal('400000000'));
      accountsInd.set('2.03', new Decimal('180000000'));
      accountsInd.set('3.01', new Decimal('80000000'));
      accountsInd.set('3.11', new Decimal('20000000'));

      const stmtCon: CvmRawStatementData = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        sourceReference: '{"source":"cvm_dfp"}',
        accounts: accountsCon,
      };

      const stmtInd: CvmRawStatementData = {
        cnpj: '33000167000101',
        cvmCode: '009512',
        companyLegalName: 'PETROBRAS',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'INDIVIDUAL',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        sourceReference: '{"source":"cvm_dfp"}',
        accounts: accountsInd,
      };

      const selected = selectStatementsForPublication([stmtInd, stmtCon]);

      expect(selected.size).toBe(1);
      const chosen = selected.get('33000167000101#009512#2024-12-31');
      expect(chosen?.statementType).toBe('CONSOLIDATED');
      expect(chosen?.netRevenue.toString()).toBe('100000000');
    });
  });

  describe('4. Projeção Determinística de Métricas do Dry-Run', () => {
    it('deve aplicar filtragem setorial idêntica ao domínio e decompor bloqueios', () => {
      const mockBindings = [
        // Processáveis
        {
          asset_id: 'asset-abev',
          ticker: 'ABEV3',
          company_id: 'comp-abev',
          cnpj: '00000000000001',
          industry_sector: 'Bebidas e Fumo',
        },
        {
          asset_id: 'asset-wege',
          ticker: 'WEGE3',
          company_id: 'comp-wege',
          cnpj: '00000000000002',
          industry_sector: 'Emp. Adm. Part. - Máqs., Equip., Veíc. e Peças',
        },
        // Bloqueados
        {
          asset_id: 'asset-bbdc',
          ticker: 'BBDC4',
          company_id: 'comp-bbdc',
          cnpj: '00000000000003',
          industry_sector: 'Intermediação Financeira',
        },
        {
          asset_id: 'asset-csud',
          ticker: 'CSUD3',
          company_id: 'comp-csud',
          cnpj: '00000000000004',
          industry_sector: 'Emp. Adm. Part. - Sem Setor Principal',
        },
        {
          asset_id: 'asset-vale',
          ticker: 'VALE3',
          company_id: 'comp-vale',
          cnpj: '00000000000005',
          industry_sector: 'Mineração',
        },
      ];

      const selectedCnpjs = new Set([
        '00000000000001', // ABEV3 (presente)
        '00000000000003', // BBDC4 (presente mas bloqueado)
      ]);

      const existingAssetIds = new Set(['asset-abev']);

      const projection = projectDryRunMetrics(
        mockBindings,
        selectedCnpjs,
        existingAssetIds
      );

      expect(projection.totalApprovedBindings).toBe(5);
      expect(projection.distinctApprovedCompanies).toBe(5);
      expect(projection.processableBindingsCount).toBe(2); // ABEV3 e WEGE3
      expect(projection.blockedBindingsCount).toBe(3); // BBDC4, CSUD3, VALE3
      expect(projection.blockedBySector.financialCosif).toBe(1);
      expect(projection.blockedBySector.holdingPure).toBe(1);
      expect(projection.blockedBySector.unknown).toBe(1);

      expect(projection.coveredBindingsCount).toBe(1); // ABEV3
      expect(projection.uncoveredBindingsCount).toBe(1); // WEGE3
      expect(projection.uncoveredTickers).toEqual(['WEGE3']);

      expect(projection.plannedUpdates).toBe(1); // asset-abev existe
      expect(projection.plannedInserts).toBe(0);
      expect(projection.totalPlannedOperations).toBe(1);
      expect(projection.expectedAuditLogs).toBe(1);
    });

    it('deve projetar corretamente duplicidade de ativos vinculados à mesma companhia', () => {
      const mockBindings = [
        {
          asset_id: 'petr4-id-1',
          ticker: 'PETR4',
          company_id: 'comp-petr',
          cnpj: '33000167000101',
          industry_sector: 'Petróleo e Gás',
        },
        {
          asset_id: 'petr4-id-2',
          ticker: 'PETR4',
          company_id: 'comp-petr',
          cnpj: '33000167000101',
          industry_sector: 'Petróleo e Gás',
        },
      ];

      const selectedCnpjs = new Set(['33000167000101']);
      const existingAssetIds = new Set(['petr4-id-1']);

      const projection = projectDryRunMetrics(
        mockBindings,
        selectedCnpjs,
        existingAssetIds
      );

      expect(projection.processableBindingsCount).toBe(2);
      expect(projection.distinctApprovedCompanies).toBe(1);
      expect(projection.coveredBindingsCount).toBe(2);
      expect(projection.plannedUpdates).toBe(1);
      expect(projection.plannedInserts).toBe(1);
      expect(projection.totalPlannedOperations).toBe(2);
      expect(projection.expectedAuditLogs).toBe(2);
    });
  });

  describe('5. Ingestão de DFC pelo fluxo do ZIP e Cálculo de EBITDA (sem persistência)', () => {
    it('deve extrair arquivo DFC_MI_con do pacote ZIP com sucesso', () => {
      const zipBuf = createMockZipBuffer(
        'dfp_cia_aberta_DFC_MI_con_2024.csv',
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00'
      );
      const entry = extractZipEntry(zipBuf, /DFC_MI_con_2024\.csv$/i);

      expect(entry).not.toBeNull();
      expect(entry?.fileName).toBe('dfp_cia_aberta_DFC_MI_con_2024.csv');
      expect(entry?.data.toString('utf8')).toContain('Depreciação e Amortização');
    });

    it('deve processar DFC_MI_con pelo fluxo do ZIP e calcular EBITDA no agregador sem persistência', async () => {
      const bpaData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa;50000.00';
      const bppData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Dívida CP;30000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Dívida LP;250000.00';
      const dreData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida;500000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido;100000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00';
      const dfcData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00';

      const parserContext: CvmParserContext = {
        fileId: crypto.randomUUID(),
        sourceFileType: 'DFP_ZIP',
        referenceYear: 2024,
        runId: crypto.randomUUID(),
        parserVersion: '1.0.0',
      };

      const agg = new CvmDfpAggregator(parserContext);
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(bpaData, 'latin1')), 'BPA_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(bppData, 'latin1')), 'BPP_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(dreData, 'latin1')), 'DRE_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(dfcData, 'latin1')), 'DFC_MI_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      // EBIT: 150.000 * 1.000 = 150.000.000
      // D&A: 50.000 * 1.000 = 50.000.000
      // EBITDA = 150M + 50M = 200.000.000
      expect(stmt.ebit?.toString()).toBe('150000000');
      expect(stmt.depreciationAmortization?.toString()).toBe('50000000');
      expect(stmt.ebitda?.toString()).toBe('200000000');
      expect(stmt.dividendsDeclared).toBeNull();
    });

    it('deve manter ebitda e depreciationAmortization como nulos quando DFC estiver ausente do fluxo do ZIP', async () => {
      const bpaData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00';
      const bppData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00';
      const dreData = 'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida;500000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido;100000.00\n33000167000101;2024-12-31;1;PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00';

      const parserContext: CvmParserContext = {
        fileId: crypto.randomUUID(),
        sourceFileType: 'DFP_ZIP',
        referenceYear: 2024,
        runId: crypto.randomUUID(),
        parserVersion: '1.0.0',
      };

      const agg = new CvmDfpAggregator(parserContext);
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(bpaData, 'latin1')), 'BPA_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(bppData, 'latin1')), 'BPP_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(Buffer.from(dreData, 'latin1')), 'DRE_con', agg.getMetrics())) {
        agg.ingestRow(row);
      }

      const statements = agg.finalize();
      expect(statements).toHaveLength(1);
      const stmt = statements[0];

      expect(stmt.ebit?.toString()).toBe('150000000');
      expect(stmt.depreciationAmortization).toBeNull();
      expect(stmt.ebitda).toBeNull();
    });

    it('deve executar o fluxo real de runDfpIngestionPipeline utilizando ZIP sintético com BPA, BPP, DRE e DFC_MI_con sem banco ou publicação', async () => {
      const bpaCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;50000.00',
      ].join('\n');

      const bppCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;30000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;250000.00',
      ].join('\n');

      const dreCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;500000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido Consolidado;100000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00',
      ].join('\n');

      const dfcCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00',
      ].join('\n');

      const zipBuffer = createMultiFileZipBuffer([
        { fileName: 'dfp_cia_aberta_BPA_con_2024.csv', content: bpaCsv },
        { fileName: 'dfp_cia_aberta_BPP_con_2024.csv', content: bppCsv },
        { fileName: 'dfp_cia_aberta_DRE_con_2024.csv', content: dreCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_con_2024.csv', content: dfcCsv },
      ]);

      const result = await runDfpIngestionPipeline({
        inputPath: 'dummy.zip',
        referenceYear: 2024,
        isDryRun: true,
        targetEnv: 'development',
        zipBuffer,
        skipDatabase: true,
      });

      // 1. Demonstrações Consolidadas no Agregador
      expect(result.conStatements).toHaveLength(1);
      const con = result.conStatements[0];
      expect(con.cnpj).toBe('33000167000101');
      expect(con.cvmCode).toBe('009512');
      expect(con.exerciseOrder).toBe('ÚLTIMO');
      expect(con.ebit?.toString()).toBe('150000000');
      expect(con.depreciationAmortization?.toString()).toBe('50000000');
      expect(con.ebitda?.toString()).toBe('200000000');
      expect(con.dividendsDeclared).toBeNull();

      // 2. Demonstrações Selecionadas após Precedência Contábil e Sanidade
      expect(result.selectedStatements).toHaveLength(1);
      const selected = result.selectedStatements[0];
      expect(selected.statementType).toBe('CONSOLIDATED');
      expect(selected.version).toBe(1);
      expect(selected.isRestated).toBe(false);
      expect(selected.currency).toBe('BRL');
      expect(selected.netRevenue.toString()).toBe('500000000');
      expect(selected.netIncome.toString()).toBe('100000000');
      expect(selected.totalAssets.toString()).toBe('1000000000');
      expect(selected.totalEquity.toString()).toBe('400000000');
      expect(selected.cashEquivalents?.toString()).toBe('50000000');
      expect(selected.grossDebt?.toString()).toBe('280000000');
      expect(selected.netDebt?.toString()).toBe('230000000');
      expect(selected.depreciationAmortization?.toString()).toBe('50000000');
      expect(selected.ebitda?.toString()).toBe('200000000');
      expect(selected.dividendsDeclared).toBeNull();
    });

    it('deve executar o fluxo real de runDfpIngestionPipeline com ZIP sintético incluindo DMPL_con extraindo dividendsDeclared com skipDatabase', async () => {
      const bpaCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;50000.00',
      ].join('\n');

      const bppCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;30000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;250000.00',
      ].join('\n');

      const dreCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;500000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido Consolidado;100000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00',
      ].join('\n');

      const dfcCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00',
      ].join('\n');

      const dmplCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-35000.00;S',
      ].join('\n');

      const zipBuffer = createMultiFileZipBuffer([
        { fileName: 'dfp_cia_aberta_BPA_con_2024.csv', content: bpaCsv },
        { fileName: 'dfp_cia_aberta_BPP_con_2024.csv', content: bppCsv },
        { fileName: 'dfp_cia_aberta_DRE_con_2024.csv', content: dreCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_con_2024.csv', content: dfcCsv },
        { fileName: 'dfp_cia_aberta_DMPL_con_2024.csv', content: dmplCsv },
      ]);

      const result = await runDfpIngestionPipeline({
        inputPath: 'dummy.zip',
        referenceYear: 2024,
        isDryRun: true,
        targetEnv: 'development',
        zipBuffer,
        skipDatabase: true,
      });

      // 1. Demonstrações Consolidadas agregadas
      expect(result.conStatements).toHaveLength(1);
      const con = result.conStatements[0];
      expect(con.ebit?.toString()).toBe('150000000');
      expect(con.depreciationAmortization?.toString()).toBe('50000000');
      expect(con.ebitda?.toString()).toBe('200000000');
      // DMPL -35000 * 1000 = -35000000 -> abs() = 35000000
      expect(con.dividendsDeclared?.toString()).toBe('35000000');

      // 2. Demonstrações Selecionadas pós conversão
      expect(result.selectedStatements).toHaveLength(1);
      const selected = result.selectedStatements[0];
      expect(selected.ebitda?.toString()).toBe('200000000');
      expect(selected.dividendsDeclared?.toString()).toBe('35000000');
      expect(selected.dividendsDeclared).toBeInstanceOf(Decimal);
    });

    it('deve executar pipeline com DMPL_con aceitando COLUNA_DF = "Patrimônio Líquido Consolidado" e rejeitando Não Controladores', async () => {
      const bpaCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;50000.00',
      ].join('\n');

      const bppCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;30000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;250000.00',
      ].join('\n');

      const dreCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;500000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido Consolidado;100000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00',
      ].join('\n');

      const dfcCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00',
      ].join('\n');

      // DMPL com Patrimônio Líquido Consolidado e linha rejeitada de Participação dos Não Controladores
      const dmplCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido Consolidado;5.04.06;Dividendos;-42000.00;S',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Participação dos Não Controladores;5.04.06;Dividendos;-8000.00;S',
      ].join('\n');

      const zipBuffer = createMultiFileZipBuffer([
        { fileName: 'dfp_cia_aberta_BPA_con_2024.csv', content: bpaCsv },
        { fileName: 'dfp_cia_aberta_BPP_con_2024.csv', content: bppCsv },
        { fileName: 'dfp_cia_aberta_DRE_con_2024.csv', content: dreCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_con_2024.csv', content: dfcCsv },
        { fileName: 'dfp_cia_aberta_DMPL_con_2024.csv', content: dmplCsv },
      ]);

      const result = await runDfpIngestionPipeline({
        inputPath: 'dummy.zip',
        referenceYear: 2024,
        isDryRun: true,
        targetEnv: 'development',
        zipBuffer,
        skipDatabase: true,
      });

      expect(result.conStatements).toHaveLength(1);
      const con = result.conStatements[0];
      // Aceita Patrimônio Líquido Consolidado (42mi) e rejeita Não Controladores (8mi não somados!)
      expect(con.dividendsDeclared?.toString()).toBe('42000000');
      expect(con.dmplOrigin?.selectedColumn).toBe('Patrimônio Líquido Consolidado');
      expect(con.dmplOrigin?.statementOrigin).toBe('DMPL_con');

      expect(result.selectedStatements).toHaveLength(1);
      const selected = result.selectedStatements[0];
      expect(selected.dividendsDeclared?.toString()).toBe('42000000');
    });

    it('deve executar pipeline com fallback DMPL_ind utilizando ZIP sintético com demonstrativos individuais sem demonstrativo consolidado', async () => {
      const bpaIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;800000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;40000.00',
      ].join('\n');

      const bppIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;350000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;20000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;180000.00',
      ].join('\n');

      const dreIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.09;Lucro Líquido do Período;80000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;110000.00',
      ].join('\n');

      const dfcIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;30000.00',
      ].join('\n');

      const dmplIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-18000.00;S',
      ].join('\n');

      // Nenhum arquivo _con no ZIP! Apenas _ind
      const zipBuffer = createMultiFileZipBuffer([
        { fileName: 'dfp_cia_aberta_BPA_ind_2024.csv', content: bpaIndCsv },
        { fileName: 'dfp_cia_aberta_BPP_ind_2024.csv', content: bppIndCsv },
        { fileName: 'dfp_cia_aberta_DRE_ind_2024.csv', content: dreIndCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_ind_2024.csv', content: dfcIndCsv },
        { fileName: 'dfp_cia_aberta_DMPL_ind_2024.csv', content: dmplIndCsv },
      ]);

      const result = await runDfpIngestionPipeline({
        inputPath: 'dummy_ind.zip',
        referenceYear: 2024,
        isDryRun: true,
        targetEnv: 'development',
        zipBuffer,
        skipDatabase: true,
      });

      // 1. Nenhum consolidado produzido
      expect(result.conStatements).toHaveLength(0);

      // 2. Individual processado com sucesso
      expect(result.indStatements).toHaveLength(1);
      const ind = result.indStatements[0];
      expect(ind.statementType).toBe('INDIVIDUAL');
      expect(ind.cnpj).toBe('33000167000101');
      expect(ind.referenceDate).toBe('2024-12-31');
      expect(ind.version).toBe(1);
      expect(ind.ebit?.toString()).toBe('110000000');
      expect(ind.depreciationAmortization?.toString()).toBe('30000000');
      expect(ind.ebitda?.toString()).toBe('140000000');
      expect(ind.dividendsDeclared?.toString()).toBe('18000000');
      expect(ind.dmplOrigin?.statementOrigin).toBe('DMPL_ind');
      expect(ind.dmplOrigin?.statementType).toBe('INDIVIDUAL');
      expect(ind.dmplOrigin?.selectedColumn).toBe('Patrimônio Líquido');

      // 3. Selecionado como fallback contábil legítimo
      expect(result.selectedStatements).toHaveLength(1);
      const selected = result.selectedStatements[0];
      expect(selected.statementType).toBe('INDIVIDUAL');
      expect(selected.referencePeriod).toBe('2024-FY');
      expect(selected.dividendsDeclared?.toString()).toBe('18000000');
      expect(selected.dividendsDeclared).toBeInstanceOf(Decimal);
    });

    it('deve priorizar DMPL_con sobre DMPL_ind quando ambos os demonstrativos coexistirem sem misturar contas', async () => {
      // CON
      const bpaConCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;1000000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;50000.00',
      ].join('\n');
      const bppConCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;30000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;250000.00',
      ].join('\n');
      const dreConCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;500000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.11;Lucro Líquido Consolidado;100000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;150000.00',
      ].join('\n');
      const dfcConCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;50000.00',
      ].join('\n');
      const dmplConCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-25000.00;S',
      ].join('\n');

      // IND
      const bpaIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1;Ativo Total;800000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;1.01.01;Caixa e Equivalentes de Caixa;40000.00',
      ].join('\n');
      const bppIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.03;Patrimônio Líquido;350000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.01.04;Empréstimos e Financiamentos CP;20000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;2.02.01;Empréstimos e Financiamentos LP;180000.00',
      ].join('\n');
      const dreIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.01;Receita Líquida de Vendas;400000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.09;Lucro Líquido do Período;80000.00',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;3.05;Resultado Antes do Resultado Financeiro e dos Tributos;110000.00',
      ].join('\n');
      const dfcIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;ESCALA_MOEDA;ORDEM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;MIL;ÚLTIMO;6.01.01.02;Depreciação e Amortização;30000.00',
      ].join('\n');
      const dmplIndCsv = [
        'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;COLUNA_DF;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
        '33000167000101;2024-12-31;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF;REAL;MIL;ÚLTIMO;2024-01-01;2024-12-31;Patrimônio Líquido;5.04.06;Dividendos;-10000.00;S',
      ].join('\n');

      const zipBuffer = createMultiFileZipBuffer([
        { fileName: 'dfp_cia_aberta_BPA_con_2024.csv', content: bpaConCsv },
        { fileName: 'dfp_cia_aberta_BPP_con_2024.csv', content: bppConCsv },
        { fileName: 'dfp_cia_aberta_DRE_con_2024.csv', content: dreConCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_con_2024.csv', content: dfcConCsv },
        { fileName: 'dfp_cia_aberta_DMPL_con_2024.csv', content: dmplConCsv },
        { fileName: 'dfp_cia_aberta_BPA_ind_2024.csv', content: bpaIndCsv },
        { fileName: 'dfp_cia_aberta_BPP_ind_2024.csv', content: bppIndCsv },
        { fileName: 'dfp_cia_aberta_DRE_ind_2024.csv', content: dreIndCsv },
        { fileName: 'dfp_cia_aberta_DFC_MI_ind_2024.csv', content: dfcIndCsv },
        { fileName: 'dfp_cia_aberta_DMPL_ind_2024.csv', content: dmplIndCsv },
      ]);

      const result = await runDfpIngestionPipeline({
        inputPath: 'dummy_both.zip',
        referenceYear: 2024,
        isDryRun: true,
        targetEnv: 'development',
        zipBuffer,
        skipDatabase: true,
      });

      expect(result.conStatements).toHaveLength(1);
      expect(result.indStatements).toHaveLength(1);

      // Comprova origens nos agregadores antes da consolidação/seleção
      expect(result.conStatements[0].dividendsDeclared?.toString()).toBe('25000000');
      expect(result.conStatements[0].dmplOrigin?.statementOrigin).toBe('DMPL_con');
      expect(result.conStatements[0].dmplOrigin?.statementType).toBe('CONSOLIDATED');

      expect(result.indStatements[0].dividendsDeclared?.toString()).toBe('10000000');
      expect(result.indStatements[0].dmplOrigin?.statementOrigin).toBe('DMPL_ind');
      expect(result.indStatements[0].dmplOrigin?.statementType).toBe('INDIVIDUAL');

      // Precedência contábil obrigatória: CONSOLIDATED vence INDIVIDUAL
      expect(result.selectedStatements).toHaveLength(1);
      const selected = result.selectedStatements[0];
      expect(selected.statementType).toBe('CONSOLIDATED');
      // Deve usar exclusivamente o valor de DMPL_con (25mi), NUNCA o de DMPL_ind (10mi) nem a soma (35mi)
      expect(selected.dividendsDeclared?.toString()).toBe('25000000');
    });
  });
});
