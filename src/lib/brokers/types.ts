import type { AssetClass } from "@/lib/db/enums";

// Provider identifica a fonte dos dados. 'pluggy' ja existe no enum (Terreno Pronto pro Cap. 17)
export type BrokerProvider = "manual" | "pluggy" | "b3_direct";

export type BrokerAccountType = "brokerage" | "exchange" | "bank" | "crypto";

export type BrokerTransactionSide =
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "fee"
  | "transfer_in"
  | "transfer_out"
  | "split"
  | "other";

export type BrokerAccount = {
  externalId: string;
  name: string;
  type: BrokerAccountType;
  currency: string;
  broker: string;
  balance?: number;
  raw?: Record<string, unknown>;
};

export type BrokerPosition = {
  externalId: string;
  accountExternalId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  averagePrice: number;
  currency: string;
  updatedAt: string; // ISO 8601
  raw?: Record<string, unknown>;
};

export type BrokerTransaction = {
  externalId: string;
  accountExternalId: string;
  ticker?: string;
  name?: string;
  assetClass?: AssetClass;
  side: BrokerTransactionSide;
  quantity: number;
  price: number;
  fees?: number;
  currency: string;
  occurredAt: string; // ISO 8601 YYYY-MM-DD
  raw?: Record<string, unknown>;
};

export type ImportWarning = {
  code: "encoding" | "missing_field" | "parse_error" | "skipped_row";
  message: string;
  row?: number;
};

export type ImportPreview = {
  accounts: BrokerAccount[];
  positions: BrokerPosition[];
  transactions: BrokerTransaction[];
  warnings: ImportWarning[];
  totalRows: number;
};

// Contrato unico para qualquer fonte de dados (CSV manual HOJE, Pluggy no Cap. 17).
// Implementacoes concretas: ManualCSVConnector (Cap. 7), PluggyConnector (Cap. 17).
export interface BrokerConnector {
  readonly provider: BrokerProvider;
  readonly displayName: string;
  readonly logoUrl: string;
  readonly isImplemented: boolean;

  // Texto de ajuda que a UI mostra para o usuario entender o que exportar.
  getImportInstructions(): string;

  // Cap. 7: parser de CSV/XLSX. Cap. 17: throw 'unsupported_format' (Pluggy nao usa arquivo).
  parseFile(fileBuffer: Buffer, filename: string): Promise<ImportPreview>;

  // Cap. 17: API OAuth. No Cap. 7 sao opcionais.
  fetchAccounts?(): Promise<BrokerAccount[]>;
  fetchTransactions?(since?: Date): Promise<BrokerTransaction[]>;
  revoke?(): Promise<{ ok: boolean }>;
}

export class BrokerError extends Error {
  code:
    | "invalid_file"
    | "unsupported_format"
    | "parse_error"
    | "mapping_error"
    | "provider_error"
    | "rate_limited"
    | "not_found"
    | "network";

  constructor(code: BrokerError["code"], message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}
