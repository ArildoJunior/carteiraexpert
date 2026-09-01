/**
 * CLI Oficial de Ingestão Contábil CVM DFP (Demonstrações Financeiras Padronizadas).
 *
 * Princípios de Segurança e Governança:
 * 1. Exige identificação explícita do ambiente-alvo (via --env=<env> ou TARGET_ENV);
 * 2. Bloqueio incondicional de execução contra produção/staging sem validações homologadas;
 * 3. Operação exclusiva sobre asset_fundamentals e audit_logs;
 * 4. Transação atômica e proteção contra Zip Slip na leitura do pacote compactado;
 * 5. Idempotência estrita: resolução de ativos canônicos vinculados com status APPROVED;
 * 6. Preservação de integridade monetária Decimal e validações de sanidade contábil;
 * 7. Suporte a simulação rigorosa (--dry-run) com bloqueio ativo de escrita.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Carregamento prévio de variáveis de ambiente do .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignora
}

import postgres from 'postgres';
import { Decimal } from '../src/lib/decimal';
import {
  CvmDfpAggregator,
  parseCvmStatementStream,
} from '../src/modules/market-data/domain/cvm-dfp-parser';
import type {
  CvmAggregatedStatement,
  CvmParserContext,
  CvmStatementPhysicalType,
} from '../src/modules/market-data/domain/cvm-parser.types';
import {
  adaptAggregatedStatementToRawStatement,
  selectStatementsForPublication,
} from '../src/modules/market-data/domain/cvm-fundamentals-engine';
import { classifyCvmSector } from '../src/modules/market-data/domain/cvm.schema';
import type { CvmRawStatementData } from '../src/modules/market-data/domain/cvm-fundamentals.types';

export interface DryRunProjectionResult {
  totalApprovedBindings: number;
  distinctApprovedCompanies: number;
  processableBindingsCount: number;
  blockedBindingsCount: number;
  blockedBySector: {
    financialCosif: number;
    holdingPure: number;
    unknown: number;
    other: number;
  };
  coveredBindingsCount: number;
  uncoveredBindingsCount: number;
  uncoveredTickers: string[];
  plannedInserts: number;
  plannedUpdates: number;
  totalPlannedOperations: number;
  expectedAuditLogs: number;
}

export function projectDryRunMetrics(
  approvedBindings: Array<{
    asset_id: string;
    ticker: string;
    company_id: string;
    cnpj: string;
    industry_sector: string | null;
  }>,
  selectedStatementsCnpjs: Set<string>,
  existingAssetIds: Set<string>
): DryRunProjectionResult {
  const distinctCompanies = new Set(approvedBindings.map((b) => b.company_id));

  const processableBindings: typeof approvedBindings = [];
  const blockedBindings: typeof approvedBindings = [];
  const blockedBySector = {
    financialCosif: 0,
    holdingPure: 0,
    unknown: 0,
    other: 0,
  };

  for (const b of approvedBindings) {
    const classification = classifyCvmSector(b.industry_sector);
    if (classification.decision === 'PROCESSABLE') {
      processableBindings.push(b);
    } else {
      blockedBindings.push(b);
      if (classification.classification === 'FINANCIAL_COSIF') {
        blockedBySector.financialCosif++;
      } else if (classification.classification === 'HOLDING_PURE') {
        blockedBySector.holdingPure++;
      } else if (classification.classification === 'UNKNOWN') {
        blockedBySector.unknown++;
      } else {
        blockedBySector.other++;
      }
    }
  }

  const coveredBindings = processableBindings.filter((b) =>
    selectedStatementsCnpjs.has(b.cnpj)
  );
  const uncoveredBindings = processableBindings.filter(
    (b) => !selectedStatementsCnpjs.has(b.cnpj)
  );

  let plannedInserts = 0;
  let plannedUpdates = 0;

  for (const b of coveredBindings) {
    if (existingAssetIds.has(b.asset_id)) {
      plannedUpdates++;
    } else {
      plannedInserts++;
    }
  }

  return {
    totalApprovedBindings: approvedBindings.length,
    distinctApprovedCompanies: distinctCompanies.size,
    processableBindingsCount: processableBindings.length,
    blockedBindingsCount: blockedBindings.length,
    blockedBySector,
    coveredBindingsCount: coveredBindings.length,
    uncoveredBindingsCount: uncoveredBindings.length,
    uncoveredTickers: Array.from(new Set(uncoveredBindings.map((b) => b.ticker))),
    plannedInserts,
    plannedUpdates,
    totalPlannedOperations: coveredBindings.length,
    expectedAuditLogs: coveredBindings.length,
  };
}

export function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    const auth = parsed.username ? '****:****@' : '';
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return 'postgresql://****:****@localhost:5433/carteiraexpert';
  }
}

export function extractZipEntry(
  zipBuffer: Buffer,
  targetFileNamePattern: RegExp
): { fileName: string; data: Buffer } | null {
  const eocdSig = 0x06054b50;
  let eocdPos = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === eocdSig) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos === -1) {
    throw new Error('Estrutura ZIP inválida ou corrompida (EOCD não localizado).');
  }

  const cdOffset = zipBuffer.readUInt32LE(eocdPos + 16);
  const cdEntries = zipBuffer.readUInt16LE(eocdPos + 10);

  let currentOffset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (zipBuffer.readUInt32LE(currentOffset) !== 0x02014b50) break;

    const method = zipBuffer.readUInt16LE(currentOffset + 10);
    const compSize = zipBuffer.readUInt32LE(currentOffset + 20);
    const uncompSize = zipBuffer.readUInt32LE(currentOffset + 24);
    const fnLen = zipBuffer.readUInt16LE(currentOffset + 28);
    const extraLen = zipBuffer.readUInt16LE(currentOffset + 30);
    const commentLen = zipBuffer.readUInt16LE(currentOffset + 32);
    const localOffset = zipBuffer.readUInt32LE(currentOffset + 42);
    const rawFileName = zipBuffer.slice(currentOffset + 46, currentOffset + 46 + fnLen).toString('utf8');

    // Validação de segurança anti-Zip Slip
    if (rawFileName.includes('..') || path.isAbsolute(rawFileName) || rawFileName.startsWith('/') || rawFileName.startsWith('\\')) {
      throw new Error(`Tentativa de Zip Slip detectada na entrada "${rawFileName}".`);
    }

    if (targetFileNamePattern.test(rawFileName)) {
      const lhOffset = localOffset;
      const lhFnLen = zipBuffer.readUInt16LE(lhOffset + 26);
      const lhExtraLen = zipBuffer.readUInt16LE(lhOffset + 28);
      const dataOffset = lhOffset + 30 + lhFnLen + lhExtraLen;
      const compressedData = zipBuffer.slice(dataOffset, dataOffset + compSize);

      let uncompressed: Buffer;
      if (method === 0) {
        uncompressed = compressedData;
      } else if (method === 8) {
        uncompressed = zlib.inflateRawSync(compressedData);
      } else {
        throw new Error(`Método de compressão ZIP não suportado: ${method}`);
      }

      return { fileName: rawFileName, data: uncompressed };
    }

    currentOffset += 46 + fnLen + extraLen + commentLen;
  }

  return null;
}

export async function* createLineStreamFromBuffer(buffer: Buffer): AsyncGenerator<string, void, unknown> {
  const text = buffer.toString('latin1');
  let start = 0;
  while (start < text.length) {
    let next = text.indexOf('\n', start);
    if (next === -1) next = text.length;
    const line = text.slice(start, next);
    start = next + 1;
    yield line;
  }
}

export interface IngestDfpCliOptions {
  inputPath: string;
  referenceYear: number;
  isDryRun: boolean;
  targetEnv: string;
}

export function parseCliArgs(argv: string[]): IngestDfpCliOptions {
  let inputPath = '.local-data/cvm/dfp_cia_aberta_2024.zip';
  let referenceYear = 2024;
  let isDryRun = false;
  let targetEnv = process.env.TARGET_ENV || '';

  for (const arg of argv) {
    if (arg === '--dry-run') {
      isDryRun = true;
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length).trim();
    } else if (arg === '--input' && argv[argv.indexOf(arg) + 1]) {
      inputPath = argv[argv.indexOf(arg) + 1].trim();
    } else if (arg.startsWith('--year=')) {
      referenceYear = parseInt(arg.slice('--year='.length).trim(), 10) || 2024;
    } else if (arg === '--year' && argv[argv.indexOf(arg) + 1]) {
      referenceYear = parseInt(argv[argv.indexOf(arg) + 1].trim(), 10) || 2024;
    } else if (arg.startsWith('--env=')) {
      targetEnv = arg.slice('--env='.length).trim();
    }
  }

  return { inputPath, referenceYear, isDryRun, targetEnv };
}

export async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  console.log('='.repeat(80));
  console.log('CARTEIRAEXPERT — INGESTÃO FINANCEIRA CVM DFP (DEMONSTRAÇÕES PADRONIZADAS)');
  console.log('='.repeat(80));

  // 1. Validação de Guardas de Ambiente
  const normalizedEnv = options.targetEnv.toLowerCase().trim();
  if (!normalizedEnv) {
    console.error('\x1b[31m[ERRO] TARGET_ENV não definido. Defina TARGET_ENV=development ou use --env=development.\x1b[0m');
    process.exit(1);
  }

  if (normalizedEnv !== 'development' && normalizedEnv !== 'local') {
    console.error(`\x1b[31m[BLOQUEIO] Ambiente "${normalizedEnv}" não autorizado para execução local.\x1b[0m`);
    process.exit(1);
  }

  // 2. Leitura e Validação da Conexão do Banco de Dados
  const envPath = path.resolve(process.cwd(), '.env');
  let databaseUrl = process.env.DATABASE_URL;
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        databaseUrl = trimmed.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  if (!databaseUrl) {
    console.error('\x1b[31m[ERRO] DATABASE_URL não encontrada no arquivo .env.\x1b[0m');
    process.exit(1);
  }

  const parsedDbUrl = new URL(databaseUrl);
  if (parsedDbUrl.hostname !== 'localhost' && parsedDbUrl.hostname !== '127.0.0.1') {
    console.error(`\x1b[31m[BLOQUEIO] DATABASE_URL aponta para host remoto "${parsedDbUrl.hostname}". Execução abortada.\x1b[0m`);
    process.exit(1);
  }

  console.log(`[INFO] Ambiente-alvo: \x1b[32m${normalizedEnv}\x1b[0m`);
  console.log(`[INFO] Banco de dados: \x1b[36m${maskConnectionString(databaseUrl)}\x1b[0m`);
  console.log(`[INFO] Arquivo DFP de entrada: \x1b[33m${options.inputPath}\x1b[0m`);
  console.log(`[INFO] Exercício de referência: \x1b[33m${options.referenceYear}\x1b[0m`);
  console.log(`[INFO] Modo de execução: ${options.isDryRun ? '\x1b[33mSIMULAÇÃO (--dry-run)\x1b[0m' : '\x1b[32mESCRITA AUTORIZADA\x1b[0m'}`);

  // 3. Validação de Existência do Arquivo ZIP
  const resolvedZipPath = path.resolve(process.cwd(), options.inputPath);
  if (!fs.existsSync(resolvedZipPath)) {
    console.error(`\x1b[31m[ERRO] Arquivo DFP não encontrado: "${resolvedZipPath}".\x1b[0m`);
    process.exit(1);
  }

  const zipBuffer = fs.readFileSync(resolvedZipPath);
  const fileId = crypto.randomUUID();
  const runId = crypto.randomUUID();

  // 4. Extração dos CSVs Contábeis Oficiais
  console.log('\n[EXTRACÃO] Localizando demonstrativos contábeis dentro do pacote ZIP...');
  const bpaConEntry = extractZipEntry(zipBuffer, new RegExp(`BPA_con_${options.referenceYear}\\.csv$`, 'i'));
  const bppConEntry = extractZipEntry(zipBuffer, new RegExp(`BPP_con_${options.referenceYear}\\.csv$`, 'i'));
  const dreConEntry = extractZipEntry(zipBuffer, new RegExp(`DRE_con_${options.referenceYear}\\.csv$`, 'i'));

  const bpaIndEntry = extractZipEntry(zipBuffer, new RegExp(`BPA_ind_${options.referenceYear}\\.csv$`, 'i'));
  const bppIndEntry = extractZipEntry(zipBuffer, new RegExp(`BPP_ind_${options.referenceYear}\\.csv$`, 'i'));
  const dreIndEntry = extractZipEntry(zipBuffer, new RegExp(`DRE_ind_${options.referenceYear}\\.csv$`, 'i'));

  if (!bpaConEntry || !bppConEntry || !dreConEntry) {
    console.error('\x1b[31m[ERRO] Pacote DFP incompleto: não foram localizados BPA_con, BPP_con e DRE_con.\x1b[0m');
    process.exit(1);
  }

  console.log(`  ✓ BPA Consolidado: ${bpaConEntry.fileName} (${(bpaConEntry.data.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ BPP Consolidado: ${bppConEntry.fileName} (${(bppConEntry.data.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ DRE Consolidado: ${dreConEntry.fileName} (${(dreConEntry.data.length / 1024).toFixed(1)} KB)`);
  if (bpaIndEntry && bppIndEntry && dreIndEntry) {
    console.log(`  ✓ BPA Individual (fallback): ${bpaIndEntry.fileName} (${(bpaIndEntry.data.length / 1024).toFixed(1)} KB)`);
    console.log(`  ✓ BPP Individual (fallback): ${bppIndEntry.fileName} (${(bppIndEntry.data.length / 1024).toFixed(1)} KB)`);
    console.log(`  ✓ DRE Individual (fallback): ${dreIndEntry.fileName} (${(dreIndEntry.data.length / 1024).toFixed(1)} KB)`);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 5. Consulta de Vínculos CVM Aprovados no Banco
    console.log('\n[CONSULTA] Carregando ativos com vínculo CVM aprovado no banco local...');
    const approvedBindings = await sql`
      SELECT ca.id, ca.asset_id, ca.company_id, ca.share_class, ca.status,
             a.ticker, a.name as asset_name, c.cvm_code, c.cnpj, c.legal_name, c.trade_name, c.industry_sector
      FROM cvm_company_assets ca
      JOIN assets a ON a.id = ca.asset_id
      JOIN cvm_companies c ON c.id = ca.company_id
      WHERE ca.status = 'APPROVED'
      ORDER BY a.ticker ASC;
    `;

    console.log(`  Total de ativos canônicos aprovados: ${approvedBindings.length}`);
    const approvedCnpjs = new Set(approvedBindings.map((b: any) => b.cnpj));
    console.log(`  Total de companhias CVM distintas: ${approvedCnpjs.size}`);

    // 6. Parsing e Agregação de Demonstrativos
    console.log('\n[PARSER] Processando demonstrativos consolidados (CON)...');
    const parserContext: CvmParserContext = {
      fileId,
      sourceFileType: 'DFP_ZIP',
      referenceYear: options.referenceYear,
      runId,
      parserVersion: '1.0.0',
    };

    const aggCon = new CvmDfpAggregator(parserContext);
    for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(bpaConEntry.data), 'BPA_con', aggCon.getMetrics())) {
      aggCon.ingestRow(row);
    }
    for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(bppConEntry.data), 'BPP_con', aggCon.getMetrics())) {
      aggCon.ingestRow(row);
    }
    for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(dreConEntry.data), 'DRE_con', aggCon.getMetrics())) {
      aggCon.ingestRow(row);
    }
    const conStatements = aggCon.finalize();
    console.log(`  Demonstrações consolidadas íntegras emitidas: ${conStatements.length}`);

    let indStatements: CvmAggregatedStatement[] = [];
    if (bpaIndEntry && bppIndEntry && dreIndEntry) {
      console.log('[PARSER] Processando demonstrativos individuais (IND) para fallback...');
      const aggInd = new CvmDfpAggregator(parserContext);
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(bpaIndEntry.data), 'BPA_con', aggInd.getMetrics())) {
        aggInd.ingestRow({ ...row, physicalType: 'BPA_con' });
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(bppIndEntry.data), 'BPP_con', aggInd.getMetrics())) {
        aggInd.ingestRow({ ...row, physicalType: 'BPP_con' });
      }
      for await (const row of parseCvmStatementStream(createLineStreamFromBuffer(dreIndEntry.data), 'DRE_con', aggInd.getMetrics())) {
        aggInd.ingestRow({ ...row, physicalType: 'DRE_con' });
      }
      indStatements = aggInd.finalize();
      console.log(`  Demonstrações individuais íntegras emitidas: ${indStatements.length}`);
    }

    // 7. Conversão e Seleção por Precedência Contábil
    const rawStatements: CvmRawStatementData[] = [];
    for (const s of conStatements) {
      rawStatements.push(adaptAggregatedStatementToRawStatement(s));
    }
    for (const s of indStatements) {
      rawStatements.push({
        ...adaptAggregatedStatementToRawStatement(s),
        statementType: 'INDIVIDUAL',
      });
    }

    const selectedStatementsMap = selectStatementsForPublication(rawStatements);
    console.log(`  Demonstrações selecionadas após precedência e sanidade: ${selectedStatementsMap.size}`);

    // 8. Reconciliação dos Ativos Aprovados Cobertos
    const matchedCnpjs = new Set<string>();
    for (const key of selectedStatementsMap.keys()) {
      const [cnpj] = key.split('#');
      matchedCnpjs.add(cnpj);
    }

    // 9. Verificação de Registros Existentes em asset_fundamentals
    const existingFundamentals = await sql`
      SELECT id, asset_id, reference_date, statement_type
      FROM asset_fundamentals;
    `;
    const existingAssetIds = new Set(existingFundamentals.map((f: any) => f.asset_id));

    // 10. Projeção Determinística do Dry-Run com Filtragem Setorial Idêntica ao Domínio
    const projection = projectDryRunMetrics(
      approvedBindings as any,
      matchedCnpjs,
      existingAssetIds
    );

    console.log('\n' + '='.repeat(80));
    console.log('RELATÓRIO DE SIMULAÇÃO (DRY-RUN) — INGESTÃO DFP CVM');
    console.log('='.repeat(80));
    console.log(`Companhias com demonstrativos no ZIP DFP:         ${rawStatements.length}`);
    console.log(`Companhias com vínculo CVM aprovado no banco:    ${projection.distinctApprovedCompanies}`);
    console.log(`Total de vínculos CVM aprovados no banco:        ${projection.totalApprovedBindings}`);
    console.log(`Vínculos elegíveis processáveis (PROCESSABLE):   ${projection.processableBindingsCount}`);
    console.log(`Vínculos bloqueados por política setorial:       ${projection.blockedBindingsCount}`);
    console.log(`  - Bancos e Financeiras (COSIF):                ${projection.blockedBySector.financialCosif}`);
    console.log(`  - Holdings Puras:                              ${projection.blockedBySector.holdingPure}`);
    console.log(`  - Setores não mapeados / outros:               ${projection.blockedBySector.unknown + projection.blockedBySector.other}`);
    console.log(`Vínculos cobertos por BPA, BPP e DRE íntegros:   ${projection.coveredBindingsCount}`);
    console.log(`Ativos sem dados contábeis no arquivo DFP 2024:   ${projection.uncoveredBindingsCount}`);
    console.log(`Operações contábeis totais projetadas:           ${projection.totalPlannedOperations}`);
    console.log(`  - Inserções projetadas (novas linhas físicas):  ${projection.plannedInserts}`);
    console.log(`  - Atualizações projetadas (linhas existentes):  ${projection.plannedUpdates}`);
    console.log(`Registros de auditoria esperados (audit_logs):   ${projection.expectedAuditLogs}`);
    console.log(`Tabelas que serão alteradas no modo escrita:     asset_fundamentals, audit_logs`);
    console.log('='.repeat(80));

    if (projection.uncoveredTickers.length > 0) {
      console.log('\n[INFO] Ativos aprovados sem DFP 2024 no arquivo (ex: IPO recente, cancelado ou sem entrega):');
      console.log(projection.uncoveredTickers.join(', '));
    }

    if (options.isDryRun) {
      console.log('\n\x1b[33m[DRY-RUN CONCLUÍDO] Simulação finalizada com sucesso. Nenhuma escrita foi realizada no banco de dados.\x1b[0m');
      return;
    }

    // 11. Modo de Escrita (Somente quando autorizado explicitamente sem --dry-run)
    console.log('\n[ESCRITA] Iniciando publicação transacional em asset_fundamentals...');
    const { CvmFundamentalsPublisherService } = await import(
      '../src/modules/market-data/server/cvm-fundamentals-publisher.service'
    );
    const publisherService = new CvmFundamentalsPublisherService();
    const publishResult = await publisherService.publishStatements({
      statements: rawStatements,
      actorId: 'cli_cvm_dfp_ingest',
      actorType: 'system',
      context: {
        fileId,
        runId,
        sourceFileType: 'DFP_ZIP',
        referenceYear: options.referenceYear,
        parserVersion: '1.0.0',
      },
    });

    console.log('\x1b[32m[SUCESSO] Ingestão DFP concluída com sucesso!\x1b[0m');
    console.log(JSON.stringify(publishResult, null, 2));
  } catch (error) {
    console.error('\x1b[31m[FALHA] Erro durante a execução da ingestão DFP:\x1b[0m', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
  process.exit(0);
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Erro fatal:', err);
    process.exit(1);
  });
}
