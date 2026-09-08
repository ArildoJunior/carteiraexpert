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
export type CvmStatementPhysicalType =
  | 'BPA_con'
  | 'BPP_con'
  | 'DRE_con'
  | 'DFC_MI_con'
  | 'DFC_MD_con'
  | 'DMPL_con'
  | 'DMPL_ind'
  | 'BPA_ind'
  | 'BPP_ind'
  | 'DRE_ind'
  | 'DFC_MI_ind'
  | 'DFC_MD_ind';

// ─── Evidência Estruturada de Origem da DMPL (Etapa 4) ───────────────────────
export interface CvmDmplOriginEvidence {
  statementOrigin: 'DMPL_con' | 'DMPL_ind';
  statementType: 'CONSOLIDATED' | 'INDIVIDUAL';
  selectedColumn: string;
  cnpj: string;
  cvmCode: string;
  referenceDate: string; // 'YYYY-MM-DD'
  version: number;
  accountCode: string; // '5.04.06' ou subcontas
  validatedDescription: string;
  declaredAmount: Decimal;
  exerciseOrder: 'ÚLTIMO';
}

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
  statementType: 'CONSOLIDATED' | 'INDIVIDUAL';
  exerciseOrder: 'ÚLTIMO';
  version: number;               // Maior versão válida consolidada

  // Fatos Contábeis em Decimal (nunca number)
  netRevenue: Decimal;           // Conta 3.01
  netIncome: Decimal;            // Conta 3.11 ou 3.09
  totalEquity: Decimal;          // Conta 2.03
  totalAssets: Decimal;          // Conta 1

  // Dívida Bruta e Caixa (Etapa 1)
  grossDebt: Decimal | null;
  cashEquivalents: Decimal | null;
  shortTermDebt?: Decimal | null;
  longTermDebt?: Decimal | null;

  // Composição do Capital Social (Etapa 2)
  capitalComposition?: CvmCapitalCompositionData | null;
  sharesCount: Decimal | null;

  // EBITDA e componentes da Etapa 3
  ebit?: Decimal | null;
  depreciationAmortization?: Decimal | null;
  ebitda: Decimal | null;
  dividendsDeclared: Decimal | null;

  // Evidência de Origem da DMPL (Etapa 4)
  dmplOrigin?: CvmDmplOriginEvidence | null;

  // Lucro Básico por Ação oficial da DRE (conta 3.99.01.01 / 3.99 em Reais por ação)
  officialLpa?: Decimal | null;

  // Proveniência Completa Serializada e Validada
  sourceReference: string;       // JSON conforme cvmSourceReferenceSchema
}

// ─── Dados de Composição do Capital Social (DFP) ─────────────────────────────
export interface CvmCapitalCompositionData {
  cnpj: string;                  // 14 dígitos numéricos normalizados
  referenceDate: string;         // 'YYYY-MM-DD'
  version: number;
  companyLegalName?: string;
  ordinaryShares: Decimal | null;
  preferredShares: Decimal | null;
  totalShares: Decimal | null;
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

// ─── Funções Utilitárias Puras de Validação Temporal e Versionamento ────────

/**
 * Valida se uma string no formato 'YYYY-MM-DD' representa uma data calendariamente válida.
 * Rejeita regex matches inválidos como 2024-02-31, 2023-02-29, 2024-13-45 ou dias/meses zerados.
 */
export function isValidCalendarDate(dateStr?: string | null): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parts = dateStr.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validação estrita de inteiro decimal positivo para VERSAO da CVM.
 * Aceita apenas strings contendo estritamente dígitos decimais com valor >= 1.
 * Rejeita explicitamente valores parciais ou inválidos como '1abc', '1.0', '1e5', '0', '-1'.
 */
export function parseStrictPositiveInteger(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 1) return null;
  return num;
}
