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

export type CvmFiiIngestionStatus =
  | 'SUCCESS'
  | 'LOCKED'
  | 'ROLLED_BACK_DRY_RUN'
  | 'ERROR';

/**
 * Opções de execução da persistência transacional de FIIs.
 */
export interface CvmFiiIngestionOptions {
  /** Pacote bruto CVM com os CSVs */
  packageInput?: FiiIngestionPackageInput;
  /** Relatório já preparado em memória (facilita testes e desacoplamento) */
  preparedReport?: FiiIngestionPreparationReport;
  /** Se true, executa todo o fluxo com rollback forçado ao final (sem escrita real) */
  dryRun?: boolean;
  /** String de conexão alternativa para o PostgreSQL (ex: testes de integração) */
  connectionString?: string;
  /** ID do usuário operador para auditoria */
  userId?: string;
  /** Flag explícita para autorizar ambiente de produção */
  allowProduction?: boolean;
  /** Timeout do lock e da transação (padrão: 60.000 ms) */
  timeoutMs?: number;
  /** Tamanho do lote de inserção SQL (padrão: 250) */
  batchChunkSize?: number;
}

/**
 * Métricas detalhadas da persistência no banco.
 */
export interface CvmFiiIngestionMetrics {
  registry: {
    totalEvaluated: number;
    insertedCount: number;
    updatedCount: number;
    unchangedCount: number;
  };
  fundamentals: {
    totalEvaluated: number;
    insertedCount: number;
    skippedDuplicatesCount: number;
  };
  bindings: {
    totalProposals: number;
    insertedCount: number;
    existingPreservedCount: number;
    approvedCount: 0; // Garantido por invariante = 0
    pendingReviewCount: number;
    ambiguousCount: number;
  };
}

/**
 * Resultado completo retornado pelo serviço transacional de ingestão FII.
 */
export interface CvmFiiIngestionResult {
  status: CvmFiiIngestionStatus;
  dryRun: boolean;
  sourceReference: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  metrics: CvmFiiIngestionMetrics;
  lockedReason?: string;
  errorMessage?: string;
  preparationSummary?: FiiIngestionPreparationReport['summary'];
}

/**
 * Erro disparado quando qualquer proposta de vínculo tenta produzir status APPROVED de forma automática.
 */
export class CvmFiiAutoApprovalViolationError extends Error {
  constructor(message = 'Violação de governança: tentativa de promover vínculo a APPROVED automaticamente.') {
    super(message);
    this.name = 'CvmFiiAutoApprovalViolationError';
  }
}

/**
 * Erro disparado quando uma invariante de integridade de negócio é violada antes do commit.
 */
export class CvmFiiInvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFiiInvariantViolationError';
  }
}

/**
 * Erro disparado quando o Advisory Lock não pôde ser adquirido.
 */
export class CvmFiiLockAcquisitionError extends Error {
  constructor(message = 'Não foi possível adquirir o advisory lock exclusivo para ingestão de FIIs.') {
    super(message);
    this.name = 'CvmFiiLockAcquisitionError';
  }
}
