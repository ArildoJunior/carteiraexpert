import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import {
  parseCliArgs,
  maskConnectionString,
  extractZipEntry,
  createLineStreamFromBuffer,
  projectDryRunMetrics,
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

    it('deve extrair arquivo correspondente com sucesso', () => {
      const zipBuf = createMockZipBuffer('dfp_cia_aberta_BPA_con_2024.csv', 'CNPJ_CIA;CD_CVM\n33000167000101;009512');
      const entry = extractZipEntry(zipBuf, /BPA_con_2024\.csv$/i);

      expect(entry).not.toBeNull();
      expect(entry?.fileName).toBe('dfp_cia_aberta_BPA_con_2024.csv');
      expect(entry?.data.toString('utf8')).toContain('33000167000101');
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
});
