import type { Decimal } from '@/lib/decimal';

// ─── Erros Especializados do Parser de FIIs da CVM ───────────────────────────

export class CvmFiiParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFiiParserError';
  }
}

export class CvmFiiInvalidIdentifierError extends CvmFiiParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFiiInvalidIdentifierError';
  }
}

export class CvmFiiInvalidHeaderError extends CvmFiiParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFiiInvalidHeaderError';
  }
}

export class CvmFiiCorruptedDataError extends CvmFiiParserError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmFiiCorruptedDataError';
  }
}

// ─── Contratos Estruturados de Saída ─────────────────────────────────────────

/**
 * Registro cadastral de FII identificado pela CVM para a tabela `cvm_fii_registry`.
 * Não contém dados mutáveis mensais; foca na resolução canônica CNPJ <-> Razão Social / ISIN.
 */
export interface ParsedCvmFiiRegistryRecord {
  cnpj: string; // 14 dígitos numéricos normalizados
  legalName: string; // Razão social oficial na CVM
  ticker: string | null; // Ticker B3 derivado ou informado (se disponível)
  isin: string | null; // Código ISIN oficial (12 caracteres alfanuméricos)
  source: 'cvm';
  sourceUpdatedAt: Date | null; // Data do informe mais recente que originou o registro
}

/**
 * Registro contábil e patrimonial mensal para a tabela `fii_monthly_fundamentals`.
 * Chave natural de versionamento: (cnpj, referenceDate, version, source).
 */
export interface ParsedFiiMonthlyRecord {
  cnpj: string; // 14 dígitos normalizados (chave para mapeamento de assetId na ingestão)
  referenceDate: string; // Data-base contábil formato 'YYYY-MM-DD'
  filingDate: Date | null; // Data/hora oficial de protocolo e entrega na CVM
  version: number; // Inteiro >= 1 (versão da declaração)
  source: 'cvm_inf_mensal';
  sourceReference: string | null; // Nome do arquivo zip/csv de origem ou lote

  // Fatos Contábeis e Patrimoniais (Decimal | null)
  netAssetValue: Decimal | null; // Patrimônio Líquido Total
  quotaEquityValue: Decimal | null; // Valor Patrimonial por Cota
  issuedQuotas: Decimal | null; // Quantidade de cotas emitidas (alta precisão)

  // Recursos e Passivos (Decimal | null)
  totalAssets: Decimal | null; // Ativo Total
  totalLiabilities: Decimal | null; // Passivo Total
  cashEquivalents: Decimal | null; // Disponibilidades financeiras e liquidez imediata

  // Proventos e Cotistas
  dividendDeclaredPerQuota: Decimal | null; // Provento declarado por cota na competência
  investorsCount: number | null; // Total de cotistas do fundo
  individualInvestorsCount: number | null; // Cotistas Pessoa Física
}

// ─── Métricas do Processamento do Pacote ──────────────────────────────────────

export interface CvmFiiParserMetrics {
  totalGeralLines: number;
  totalComplementoLines: number;
  totalAtivoPassivoLines: number;
  parsedRegistryRecords: number;
  parsedMonthlyRecords: number;
  skippedCorruptedLines: number;
  uniqueFundsCount: number;
  uniqueCompetenciesCount: number;
}

// ─── Entrada do Pacote de Informes Mensais ─────────────────────────────────────

export interface CvmFiiMonthlyPackageInput {
  geralCsv: string | AsyncIterable<string>;
  complementoCsv?: string | AsyncIterable<string> | null;
  ativoPassivoCsv?: string | AsyncIterable<string> | null;
  sourceReference?: string;
  strict?: boolean; // Se true, lança em vez de registrar skippedCorruptedLines
}

export interface CvmFiiMonthlyPackageResult {
  registryRecords: ParsedCvmFiiRegistryRecord[];
  monthlyRecords: ParsedFiiMonthlyRecord[];
  metrics: CvmFiiParserMetrics;
}
