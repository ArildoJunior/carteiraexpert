import type { Decimal } from '@/lib/decimal';
import type {
  FiiCadastralResolutionReport,
} from '../domain/cvm-fii-cadastral-resolver.types';
import type {
  CvmFiiParserMetrics,
  ParsedFiiMonthlyRecord,
} from '../domain/cvm-fii-parser.types';

export type FiiIngestionExecutionMode = 'DRY_RUN' | 'PREPARE_ONLY';

export type FiiCsvEncoding = 'latin1' | 'utf-8';

/**
 * Pacote de entrada bruto com conteúdo dos arquivos da CVM (em string ou Buffer).
 */
export interface FiiIngestionPackageInput {
  geralContent: string | Buffer;
  complementoContent?: string | Buffer | null;
  ativoPassivoContent?: string | Buffer | null;
  sourceReference: string; // Ex: 'inf_mensal_fii_2026.zip'
  encoding?: FiiCsvEncoding; // Default: 'latin1'
}

/**
 * Registro cadastral preparado e validado para persistência futura em `cvm_fii_registry`.
 * Possui vínculo unívoco com `assetId` verificado.
 */
export interface PreparedFiiRegistryRecord {
  assetId: string;
  cnpj: string; // 14 dígitos numéricos normalizados
  legalName: string;
  ticker: string;
  isin: string | null;
  source: 'cvm';
  sourceUpdatedAt: Date | null;
}

/**
 * Registro contábil mensal preparado e validado para persistência futura em `fii_monthly_fundamentals`.
 * Possui `assetId` associado pelo motor de resolução cadastral.
 */
export interface PreparedFiiMonthlyRecord {
  assetId: string;
  referenceDate: string; // 'YYYY-MM-DD'
  filingDate: Date | null;
  version: number;
  source: 'cvm_inf_mensal';
  sourceReference: string | null;

  // Fatos Contábeis em Decimal
  netAssetValue: Decimal | null;
  quotaEquityValue: Decimal | null;
  issuedQuotas: Decimal | null;
  totalAssets: Decimal | null;
  totalLiabilities: Decimal | null;
  cashEquivalents: Decimal | null;
  dividendDeclaredPerQuota: Decimal | null;
  investorsCount: number | null;
  individualInvestorsCount: number | null;
}

/**
 * Relatório estruturado de preparação de lote de ingestão de FIIs.
 */
export interface FiiIngestionPreparationReport {
  sourceReference: string;
  executionMode: FiiIngestionExecutionMode;
  parserMetrics: CvmFiiParserMetrics;
  cadastralReport: FiiCadastralResolutionReport;
  eligibleRegistryRecords: PreparedFiiRegistryRecord[];
  eligibleMonthlyRecords: PreparedFiiMonthlyRecord[];
  unmatchedMonthlyRecords: ParsedFiiMonthlyRecord[];
  summary: {
    totalMonthlyRecordsParsed: number;
    eligibleMonthlyRecordsCount: number;
    unmatchedMonthlyRecordsCount: number;
    uniqueAssetsMatched: number;
  };
}
