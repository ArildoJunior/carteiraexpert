import type { Decimal } from '@/lib/decimal';

export type CotahistFileType = 'daily' | 'annual';

export type CotahistBatchStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DUPLICATE';

export interface CotahistHeader {
  recordType: '00';
  fileName: string;
  originCode: string;
  generationDate: Date;
  generationDateFormatted: string; // YYYY-MM-DD
}

export interface CotahistQuoteRecord {
  recordType: '01';
  tradeDate: string; // Formato estrito YYYY-MM-DD (sem timezone / sem hora)
  bdiCode: string;
  ticker: string;
  marketType: number;
  shortName: string;
  specification: string;
  forwardTermDays?: string;
  currency: string;
  openPrice: Decimal;
  highPrice: Decimal;
  lowPrice: Decimal;
  averagePrice: Decimal;
  closePrice: Decimal;
  bestBidPrice?: Decimal;
  bestAskPrice?: Decimal;
  tradeCount: number;
  quantity: Decimal;
  financialVolume: Decimal;
  strikePrice?: Decimal;
  correctionIndicator?: number;
  expirationDate?: string; // Formato estrito YYYY-MM-DD se aplicável
  quotationFactor: number;
  strikePoints?: Decimal;
  isin?: string;
  distributionNumber?: number;
  rawLine: string;
  recordHash: string;
}

export interface CotahistTrailer {
  recordType: '99';
  fileName: string;
  originCode: string;
  generationDate: Date;
  generationDateFormatted: string; // YYYY-MM-DD
  totalRecords: number;
}

export interface CotahistParseResult {
  header?: CotahistHeader;
  quotes: CotahistQuoteRecord[];
  trailer?: CotahistTrailer;
  totalLines: number;
  headerCount: number;
  quoteCount: number;
  trailerCount: number;
  unknownCount: number;
  rejectedCount: number;
  trailerDiscrepancy: boolean;
  errors: string[];
}

export interface IngestCotahistOptions {
  dryRun?: boolean;
  force?: boolean;
  userId?: string;
  targetDirectory?: string;
  batchSize?: number;
  skipOptions?: boolean;
  bdiFilter?: string[];
}

export interface CotahistBatchSummary {
  batchId: string;
  fileName: string;
  fileType: CotahistFileType;
  fileSize: number;
  sha256: string;
  status: CotahistBatchStatus;
  totalLines: number;
  headerCount: number;
  quoteCount: number;
  trailerCount: number;
  acceptedRecords: number;
  rejectedRecords: number;
  unknownRecords: number;
  associatedInstruments: number;
  unassociatedInstruments: number;
  duplicateRecords: number;
  trailerDiscrepancy: boolean;
  // Métricas explícitas e reconciliadas da execução
  recordsRead: number;
  recordsAccepted: number;
  recordsInserted: number;
  recordsConflicted: number;
  recordsRejected: number;
  errorCount: number;
  skippedAsDuplicate: boolean;
  skipReason?: string;
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs: number;
  peakMemoryBytes?: number;
  errorMessage?: string;
}
