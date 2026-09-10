import type { Decimal } from '@/lib/decimal';
import type {
  FiiBindingConfidence,
  FiiBindingMethod,
  FiiBindingStatus,
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
 * Registro de entidade CVM preparado para persistência futura em `cvm_fii_registry`.
 * 100% dos fundos da CVM são preservados, identificados unicamente por CNPJ,
 * sem obrigatoriedade de existência de assetId.
 */
export interface PreparedFiiRegistryRecord {
  fiiRegistryId?: string;
  cnpj: string; // 14 dígitos numéricos normalizados
  legalName: string;
  tradeName?: string | null;
  ticker?: string | null;
  isin?: string | null;
  source: 'cvm';
  sourceUpdatedAt: Date | null;
}

/**
 * Registro contábil mensal preparado para persistência futura em `fii_monthly_fundamentals`.
 * Identificado unicamente pela entidade CVM (fiiRegistryCnpj / fiiRegistryId), competência e versão.
 * Impede sobreposição ou mistura de dados entre fundos distintos.
 */
export interface PreparedFiiMonthlyRecord {
  fiiRegistryId?: string;
  fiiRegistryCnpj: string; // Chave de identidade da entidade CVM
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
 * Proposta de vínculo cadastral preparada para persistência em `cvm_fii_bindings`.
 * Permite no máximo um vínculo APPROVED por ativo B3, preservando registros PENDING_REVIEW e AMBIGUOUS.
 */
export interface PreparedFiiBindingRecord {
  id?: string;
  fiiRegistryId?: string;
  fiiRegistryCnpj: string;
  assetId: string;
  ticker: string;
  bindingStatus: FiiBindingStatus;
  bindingMethod: FiiBindingMethod;
  confidenceLevel: FiiBindingConfidence;
  justification: string;
  source: 'cvm';
  sourceUpdatedAt?: Date | null;
}

/**
 * Relatório estruturado de preparação de lote de ingestão de FIIs.
 */
export interface FiiIngestionPreparationReport {
  sourceReference: string;
  executionMode: FiiIngestionExecutionMode;
  parserMetrics: CvmFiiParserMetrics;
  cadastralReport: FiiCadastralResolutionReport;
  preparedRegistryRecords: PreparedFiiRegistryRecord[];
  preparedMonthlyRecords: PreparedFiiMonthlyRecord[];
  preparedBindingRecords: PreparedFiiBindingRecord[];
  unmatchedMonthlyRecords: ParsedFiiMonthlyRecord[];
  summary: {
    totalMonthlyRecordsParsed: number;
    totalRegistryRecordsPrepared: number;
    totalMonthlyRecordsPrepared: number;
    totalBindingProposals: number;
    approvedBindingsCount: number;
    pendingReviewBindingsCount: number;
    ambiguousBindingsCount: number;
    unmatchedFundsCount: number;
    uniqueAssetsMatched: number;
    eligibleMonthlyRecordsCount?: number;
    unmatchedMonthlyRecordsCount?: number;
  };

  // Aliases de conveniência para retrocompatibilidade
  eligibleRegistryRecords: PreparedFiiRegistryRecord[];
  eligibleMonthlyRecords: PreparedFiiMonthlyRecord[];
}
