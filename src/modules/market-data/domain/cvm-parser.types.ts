import type { Decimal } from '@/lib/decimal';
import type { CvmCompanyStatus, CvmSectorClassification, CvmSectorDecision } from './cvm.types';

// ─── Contexto Obrigatório de Proveniência do ZIP Pai DFP ──────────────────────
export interface CvmParserContext {
  fileId: string;             // UUID obrigatório do cvm_source_files correspondente ao ZIP anual pai
  sourceFileType: 'DFP_ZIP';  // Discriminador estrito que impede o uso de CSV individual
  referenceYear: number;      // Ano de referência oficial do pacote DFP (ex: 2024)
  runId: string;              // UUID obrigatório do cvm_ingestion_runs em estado RUNNING
  parserVersion: string;      // Versão canônica explícita do código (ex: '1.0.0')
}

// ─── Tipos Físicos de Demonstrativos DFP ──────────────────────────────────────
export type CvmStatementPhysicalType = 'BPA_con' | 'BPP_con' | 'DRE_con';

// ─── Tipos de Dados do Cadastro CVM (cad_cia_aberta.csv) ─────────────────────
export interface CvmCadCompany {
  cvmCode: string;               // 6 dígitos com padding (ex: '009512')
  cnpj: string;                  // 14 dígitos numéricos normalizados
  legalName: string;             // Razão Social (DENOM_SOCIAL)
  tradeName: string | null;      // Nome Comercial (DENOM_COMERC)
  industrySector: string | null; // Setor de atividade CVM (SETOR_ATIV)
  marketType: string | null;     // Tipo de mercado (TP_MERC)
  status: CvmCompanyStatus;      // 'ATIVO' | 'CANCELADA' | 'SUSPENSO(A) - DECISÃO ADM'
  sectorClassification: CvmSectorClassification;
  sectorDecision: CvmSectorDecision;
  registrationDate: Date | null;
  cancellationDate: Date | null;
}

export interface CvmCadMetrics {
  totalLinesRead: number;
  companiesProcessed: number;
  activeCompanies: number;
  canceledCompanies: number;
  suspendedCompanies: number;
  eligibleSectorsCount: number;
  skippedUnsupportedSectors: number;
  corruptedLinesCount: number;
}

// ─── Registros Contábeis Agregados (DFP) ─────────────────────────────────────
export interface CvmAggregatedStatement {
  cnpj: string;                  // 14 dígitos numéricos normalizados
  cvmCode: string;               // 6 dígitos com padding
  companyLegalName: string;
  referenceDate: string;         // 'YYYY-MM-DD'
  periodType: 'annual';
  statementType: 'CONSOLIDATED';
  exerciseOrder: 'ÚLTIMO';
  version: number;               // Maior versão válida consolidada

  // Fatos Contábeis em Decimal (nunca number)
  netRevenue: Decimal;           // Conta 3.01
  netIncome: Decimal;            // Conta 3.11 ou 3.09
  totalEquity: Decimal;          // Conta 2.03
  totalAssets: Decimal;          // Conta 1

  // Grandezas mantidas obrigatoriamente como null no MVP
  grossDebt: null;
  cashEquivalents: null;
  ebitda: null;
  sharesCount: null;
  dividendsDeclared: null;

  // Proveniência Completa Serializada e Validada
  sourceReference: string;       // JSON conforme cvmSourceReferenceSchema
}

// ─── Métricas do Parser DFP ──────────────────────────────────────────────────
export interface CvmDfpMetrics {
  totalLinesRead: number;
  relevantLinesProcessed: number;
  skippedPenultimoLines: number;
  invalidScaleLines: number;
  corruptedLinesCount: number;
  conflictingDuplicateLines: number;
  conflictingStatementsDiscarded: number;
  unregisteredCompaniesSkipped: number;
  unsupportedSectorCompaniesSkipped: number;
  highestVersionIncompleteDiscarded: number;
  missingNetIncomeDiscarded: number;
  completeStatementsEmitted: number;
}

// ─── Hierarquia de Erros do Parser CVM ───────────────────────────────────────
export class CvmParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmParserError';
  }
}

export class CvmInvalidContextError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInvalidContextError';
  }
}

export class CvmIncompatibleStreamContextError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmIncompatibleStreamContextError';
  }
}

export class CvmInvalidIdentifierError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInvalidIdentifierError';
  }
}

export class CvmInvalidScaleError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInvalidScaleError';
  }
}

export class CvmInvalidHeaderError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInvalidHeaderError';
  }
}

export class CvmCorruptedDataError extends CvmParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmCorruptedDataError';
  }
}
