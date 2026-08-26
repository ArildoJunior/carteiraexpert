import type { Decimal } from '@/lib/decimal';

// ─── Formatos de Importação Suportados ─────────────────────────────────────────
export type ImportFormatId =
  | 'carteiraexpert_csv'
  | 'b3_trades_csv'
  | 'b3_movements_csv';

// ─── Tipos Operacionais Suportados na Importação ──────────────────────────────
// Estritamente alinhados aos tipos operacionais do motor de eventos e posições
export const IMPORT_ACTION_TYPES = [
  'BUY',
  'SELL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'MANUAL_ADJUSTMENT',
] as const;

export type ImportActionType = (typeof IMPORT_ACTION_TYPES)[number];

// ─── Status das Linhas e dos Lotes ───────────────────────────────────────────
export type ImportItemStatus =
  | 'valid'
  | 'warning'
  | 'error'
  | 'duplicate'
  | 'ignored';

export type ImportBatchStatus =
  | 'pending_review'
  | 'confirmed'
  | 'rejected'
  | 'failed';

// ─── Contexto de Parsing ──────────────────────────────────────────────────────
export interface ImportParseContext {
  fileName: string;
  fileSize: number;
  defaultCurrency?: string;
  userId?: string;
  portfolioId?: string;
}

// ─── Linha Extraída e Normalizada ─────────────────────────────────────────────
export interface ParsedImportRow {
  lineNumber: number;
  rawLine: string;
  actionType: ImportActionType | null;
  direction: 'IN' | 'OUT' | null;
  rawTicker: string;
  normalizedTicker: string;
  tradeDate: Date | null;
  settlementDate: Date | null;
  quantity: Decimal | null;
  unitPrice: Decimal | null;
  fees: Decimal | null;
  currency: string;
  notes: string | null;
  validationErrors: string[];
  status: ImportItemStatus;
}

// ─── Lote Parseado em Memória ─────────────────────────────────────────────────
export interface ParsedImportBatch {
  formatId: ImportFormatId;
  formatName: string;
  fileName: string;
  fileSize: number;
  rawContentHash: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  rows: ParsedImportRow[];
}

export interface ImportBatch {
  id: string;
  userId: string;
  portfolioId: string;
  portfolioName?: string;
  fileName: string;
  fileSize: number;
  fileFormat: ImportFormatId;
  status: ImportBatchStatus;
  totalRecords: number;
  validRecords: number;
  warningRecords: number;
  errorRecords: number;
  rawContentHash: string;
  errorMessage: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportBatchItem {
  id: string;
  batchId: string;
  lineNumber: number;
  rawLine: string;
  status: ImportItemStatus;
  actionType: ImportActionType;
  direction: 'IN' | 'OUT' | null;
  rawTicker: string;
  resolvedAssetId: string | null;
  resolvedAssetTicker?: string | null;
  resolvedAssetName?: string | null;
  tradeDate: Date;
  settlementDate: Date | null;
  quantity: Decimal;
  unitPrice: Decimal;
  fees: Decimal;
  currency: string;
  notes: string | null;
  validationErrors: string[];
  isDuplicate: boolean;
  duplicateReason: string | null;
  isExcluded: boolean;
  importedPortfolioEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedImportBatchItem {
  id: string;
  batchId: string;
  lineNumber: number;
  rawLine: string;
  status: ImportItemStatus;
  actionType: ImportActionType;
  direction: 'IN' | 'OUT' | null;
  rawTicker: string;
  resolvedAssetId: string | null;
  resolvedAssetTicker?: string | null;
  resolvedAssetName?: string | null;
  tradeDate: string;
  settlementDate: string | null;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  notes: string | null;
  validationErrors: string[];
  isDuplicate: boolean;
  duplicateReason: string | null;
  isExcluded: boolean;
  importedPortfolioEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedImportBatch {
  id: string;
  userId: string;
  portfolioId: string;
  portfolioName?: string;
  fileName: string;
  fileSize: number;
  fileFormat: ImportFormatId;
  status: ImportBatchStatus;
  totalRecords: number;
  validRecords: number;
  warningRecords: number;
  errorRecords: number;
  rawContentHash: string;
  errorMessage: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SerializedImportBatchItem[];
}
