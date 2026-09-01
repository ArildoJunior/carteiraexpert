import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { parseCvmCadStream } from '../domain/cvm-cad-parser';
import { parseCvmFcaStream } from '../domain/cvm-fca-parser';
import { CvmMatchingEngine } from '../domain/cvm-matching-engine';
import type {
  CanonicalAssetMatchingInput,
  CvmCompanyMatchingInput,
  CvmMatchingBatchResult,
  CvmSecurityMappingInput,
  ExistingBindingMatchingInput,
} from '../domain/cvm-matching.types';

export interface LocalFileInspection {
  fileName: string;
  filePath: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  encodingDetected: string | null;
  error?: string | null;
}

export interface CvmCadastralDryRunReport {
  timestamp: string;
  mode: 'DRY_RUN_READ_ONLY';
  sourceDirectory: string;
  filesInspection: {
    cadCiaAberta: LocalFileInspection;
    fcaValoresMobiliarios: LocalFileInspection;
  };
  cadastralMetrics: {
    totalCompaniesParsed: number;
    activeCompanies: number;
    canceledCompanies: number;
    suspendedCompanies: number;
    eligibleSectors: number;
  } | null;
  fcaMetrics: {
    totalSecuritiesParsed: number;
    distinctTickers: number;
  } | null;
  canonicalAssetsEvaluatedCount: number;
  summary: {
    approvedCandidatesCount: number;
    pendingReviewCount: number;
    noMatchCount: number;
    outOfScopeCount: number;
    protectedExistingBindingsCount: number;
  };
  batchResult: CvmMatchingBatchResult;
  limitations: string[];
}

/**
 * Utilitário para criar stream de linhas decodificadas de arquivo CSV.
 * Lida com encoding ISO-8859-1 nativo da CVM ou UTF-8.
 */
export async function* createLineStream(
  filePath: string,
  encoding: BufferEncoding = 'latin1'
): AsyncIterable<string> {
  const fileStream = fs.createReadStream(filePath, { encoding });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield line;
  }
}

/**
 * Calcula o hash SHA-256 de um arquivo local.
 */
export async function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Inspeciona arquivo local sem efeitos colaterais.
 */
export async function inspectLocalFile(filePath: string): Promise<LocalFileInspection> {
  const fileName = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    return {
      fileName,
      filePath,
      exists: false,
      sizeBytes: null,
      sha256: null,
      encodingDetected: null,
    };
  }

  try {
    const stats = fs.statSync(filePath);
    const sha256 = await calculateFileSha256(filePath);
    return {
      fileName,
      filePath,
      exists: true,
      sizeBytes: stats.size,
      sha256,
      encodingDetected: 'ISO-8859-1 (latin1)',
    };
  } catch (err: any) {
    return {
      fileName,
      filePath,
      exists: true,
      sizeBytes: null,
      sha256: null,
      encodingDetected: null,
      error: err.message,
    };
  }
}

/**
 * Executa o fluxo de simulação e matching CVM cadastral em modo estritamente somente leitura (Dry-Run).
 */
export async function runCvmCadastralDryRun(options: {
  cvmDataDir: string;
  canonicalAssets: CanonicalAssetMatchingInput[];
  existingBindings?: ExistingBindingMatchingInput[];
}): Promise<CvmCadastralDryRunReport> {
  const { cvmDataDir, canonicalAssets, existingBindings = [] } = options;

  const cadFilePath = path.join(cvmDataDir, 'cad_cia_aberta.csv');
  
  // Localiza fca_cia_aberta_valor_mobiliario.csv ou fca_cia_aberta_valor_mobiliario_YYYY.csv
  let fcaFilePath = path.join(cvmDataDir, 'fca_cia_aberta_valor_mobiliario.csv');
  if (!fs.existsSync(fcaFilePath) && fs.existsSync(cvmDataDir)) {
    const files = fs.readdirSync(cvmDataDir);
    const matchedFca = files.find((f) => /fca_cia_aberta_valor_mobiliario.*\.csv$/i.test(f));
    if (matchedFca) {
      fcaFilePath = path.join(cvmDataDir, matchedFca);
    }
  }

  const cadInspection = await inspectLocalFile(cadFilePath);
  const fcaInspection = await inspectLocalFile(fcaFilePath);

  const limitations: string[] = [];
  const companiesList: CvmCompanyMatchingInput[] = [];
  let cadastralMetrics = null;

  // 1. Processa cad_cia_aberta.csv se disponível
  if (cadInspection.exists) {
    const lineStream = createLineStream(cadFilePath, 'latin1');
    const { companies, metrics } = await parseCvmCadStream(lineStream);

    cadastralMetrics = {
      totalCompaniesParsed: metrics.companiesProcessed,
      activeCompanies: metrics.activeCompanies,
      canceledCompanies: metrics.canceledCompanies,
      suspendedCompanies: metrics.suspendedCompanies,
      eligibleSectors: metrics.eligibleSectorsCount,
    };

    for (const comp of companies.values()) {
      companiesList.push({
        id: `cvm-comp-${comp.cvmCode}`,
        cvmCode: comp.cvmCode,
        cnpj: comp.cnpj,
        legalName: comp.legalName,
        tradeName: comp.tradeName,
        industrySector: comp.industrySector,
        marketType: comp.marketType,
        status: comp.status,
      });
    }
  } else {
    limitations.push('Arquivo cadastral "cad_cia_aberta.csv" não encontrado no diretório local.');
  }

  // 2. Processa fca_cia_aberta_valor_mobiliario.csv se disponível
  let securityMappings: CvmSecurityMappingInput[] = [];
  let fcaMetrics = null;

  if (fcaInspection.exists) {
    const lineStream = createLineStream(fcaFilePath, 'latin1');
    const { mappings, metrics } = await parseCvmFcaStream(lineStream);
    securityMappings = mappings;
    fcaMetrics = {
      totalSecuritiesParsed: metrics.validSecuritiesCount,
      distinctTickers: metrics.distinctTickersCount,
    };
  } else {
    limitations.push(
      'Arquivo FCA "fca_cia_aberta_valor_mobiliario.csv" não encontrado. Sem ele, o motor não pode produzir APPROVED_CANDIDATE automático (retornará PENDING_REVIEW ou NO_MATCH).'
    );
  }

  // 3. Executa o Motor Puro de Matching em Memória
  const engine = new CvmMatchingEngine({
    companies: companiesList,
    securityMappings,
    existingBindings,
  });

  const batchResult = engine.evaluateBatch(canonicalAssets);

  return {
    timestamp: new Date().toISOString(),
    mode: 'DRY_RUN_READ_ONLY',
    sourceDirectory: cvmDataDir,
    filesInspection: {
      cadCiaAberta: cadInspection,
      fcaValoresMobiliarios: fcaInspection,
    },
    cadastralMetrics,
    fcaMetrics,
    canonicalAssetsEvaluatedCount: canonicalAssets.length,
    summary: {
      approvedCandidatesCount: batchResult.approvedCandidates,
      pendingReviewCount: batchResult.pendingReview,
      noMatchCount: batchResult.noMatch,
      outOfScopeCount: batchResult.outOfScope,
      protectedExistingBindingsCount: batchResult.protectedExistingBindings,
    },
    batchResult,
    limitations,
  };
}
