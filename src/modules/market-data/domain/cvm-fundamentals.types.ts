import type { Decimal } from '@/lib/decimal';
import type { CvmParserContext } from './cvm-parser.types';

export type CvmStatementType = 'CONSOLIDATED' | 'INDIVIDUAL';
export type CvmPeriodType = 'annual' | 'quarterly' | 'ttm';

/**
 * Representação de um balanço contábil bruto CVM pronto para conversão.
 */
export interface CvmRawStatementData {
  cnpj: string;
  cvmCode: string;
  companyLegalName: string;
  referenceDate: string; // 'YYYY-MM-DD'
  periodType: 'annual';
  statementType: CvmStatementType;
  exerciseOrder: 'ÚLTIMO';
  version: number;
  filingDate?: Date | string | null;

  // Mapa de contas contábeis indexadas por CD_CONTA
  accounts: Map<string, Decimal>;

  // Metadados de proveniência
  sourceReference: string;
}

/**
 * Fatos contábeis convertidos e estruturados com Decimal.
 */
export interface ConvertedFundamentals {
  referencePeriod: string; // ex: '2024-FY'
  periodType: 'annual';
  statementType: CvmStatementType;
  referenceDate: Date;
  filingDate: Date | null;
  source: 'cvm';
  sourceReference: string;
  version: number;
  isRestated: boolean;
  currency: 'BRL';

  // Fatos contábeis principais
  netRevenue: Decimal;
  netIncome: Decimal;
  totalEquity: Decimal;
  totalAssets: Decimal;
  ebitda: Decimal | null;

  // Dívida e Disponibilidades
  grossDebt: Decimal | null;
  cashEquivalents: Decimal | null;
  netDebt: Decimal | null;

  // Outros proventos/ações
  sharesCount: Decimal | null;
  dividendsDeclared: Decimal | null;
  notes: string | null;
}

/**
 * Registro de publicação persistido em asset_fundamentals.
 */
export interface PublishedFundamentalRecord {
  id: string;
  assetId: string;
  ticker: string;
  referencePeriod: string;
  periodType: string;
  statementType: string;
  version: number;
  isRestated: boolean;
  action: 'INSERTED' | 'UPDATED' | 'NO_OP';
  sourceReference: string;
}

/**
 * Resultado da execução do serviço de publicação para um conjunto de balanços.
 */
export interface PublishFundamentalsResult {
  totalStatementsReceived: number;
  companiesProcessed: number;
  totalRecordsPublished: number;
  recordsInserted: number;
  recordsUpdated: number;
  skippedUnboundCompanies: number;
  skippedUnsupportedSectors: number;
  sanityCheckFailures: number;
  records: PublishedFundamentalRecord[];
}

/**
 * Payload de entrada para o publicador transacional.
 */
export interface PublishFundamentalsInput {
  statements: CvmRawStatementData[];
  context?: CvmParserContext;
  actorId?: string;
  actorType?: 'system' | 'user';
}

/**
 * Ações de auditoria para fundamentos CVM.
 */
export type CvmFundamentalsAuditAction =
  | 'CVM_FUNDAMENTALS_PUBLISHED'
  | 'CVM_FUNDAMENTALS_RESTATED';

// ─── Hierarquia de Erros de Domínio da Etapa 4 ───────────────────────────────

export class CvmFundamentalsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFundamentalsError';
  }
}

export class CvmFinancialSanityError extends CvmFundamentalsError {
  public readonly reason: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, reason: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CvmFinancialSanityError';
    this.reason = reason;
    this.details = details;
  }
}

export class CvmIncompleteStatementError extends CvmFundamentalsError {
  public readonly missingAccount: string;

  constructor(missingAccount: string, message?: string) {
    super(
      message ||
        `Demonstrativo financeiro incompleto: conta contábil obrigatória "${missingAccount}" ausente.`
    );
    this.name = 'CvmIncompleteStatementError';
    this.missingAccount = missingAccount;
  }
}

export class CvmIncompatibleStatementTypeError extends CvmFundamentalsError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmIncompatibleStatementTypeError';
  }
}
