export const assetClassEnum = [
  "stock",
  "reit",
  "etf",
  "bdr",
  "fixedIncomePublic",
  "fixedIncomePrivate",
  "fund",
  "crypto",
  "pension",
  "treasury",
  "other",
] as const;
export type AssetClass = (typeof assetClassEnum)[number];

export const accountTypeEnum = [
  "brokerage",
  "bank",
  "exchange",
  "custodian",
  "wallet",
  "other",
] as const;
export type AccountType = (typeof accountTypeEnum)[number];

export const transactionTypeEnum = [
  "buy",
  "sell",
  "dividend",
  "jcp",
  "reitIncome",
  "fixedIncomeCoupon",
  "bonus",
  "split",
] as const;
export type TransactionType = (typeof transactionTypeEnum)[number];

export const alertTypeEnum = [
  "priceChange",
  "stopGain",
  "stopLoss",
  "dividendReceived",
  "exDateUpcoming",
] as const;
export type AlertType = (typeof alertTypeEnum)[number];

export const brokerEnum = [
  "xp",
  "rico",
  "btg",
  "nuinvest",
  "inter",
  "sofisa",
  "modal",
  "b3",
  "binance",
  "mercado",
  "coinbase",
  "kraken",
  "manual",
  "other",
] as const;
export type Broker = (typeof brokerEnum)[number];

export const watchlistUpdateModeEnum = ["static", "dynamic"] as const;
export type WatchlistUpdateMode = (typeof watchlistUpdateModeEnum)[number];

// Cap. 7 — Integracao com corretoras
export const brokerProviderEnum = ["manual", "pluggy", "b3_direct"] as const;
export type BrokerProvider = (typeof brokerProviderEnum)[number];

export const brokerKindEnum = ["brokerage", "exchange", "bank", "crypto"] as const;
export type BrokerKind = (typeof brokerKindEnum)[number];

export const reviewStatusEnum = ["pending", "imported", "skipped", "duplicate"] as const;
export type ReviewStatus = (typeof reviewStatusEnum)[number];

export const importJobStatusEnum = ["running", "success", "error", "partial"] as const;
export type ImportJobStatus = (typeof importJobStatusEnum)[number];

// Cap. 9A — Papeis de usuario (equipe interna x usuario final)
export const userRoleEnum = ["user", "editor", "admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

// Cap. 9A — Tipos documentais
export const documentTypeEnum = [
  "informe_rendimento",
  "relatorio_fii",
  "fato_relevante",
  "dre",
  "balanco",
  "prospecto",
  "release_resultados",
  "outros",
] as const;
export type DocumentType = (typeof documentTypeEnum)[number];

// Cap. 9A — Status tecnico de processamento do documento bruto
export const documentStatusEnum = [
  "uploaded",
  "extracting",
  "ocr_processing",
  "extracted",
  "analyzing",
  "analyzed",
  "error",
] as const;
export type DocumentStatus = (typeof documentStatusEnum)[number];

// Cap. 9A — Status editorial (por versao de analise)
export const editorialStatusEnum = [
  "draft",
  "review",
  "approved",
  "published",
  "rejected",
] as const;
export type EditorialStatus = (typeof editorialStatusEnum)[number];

// Cap. 9A — Sentimento detectado pela IA
export const sentimentEnum = ["positivo", "neutro", "negativo"] as const;
export type Sentiment = (typeof sentimentEnum)[number];

// Cap. 9A — Provider de IA
export const aiProviderEnum = ["openai", "anthropic"] as const;
export type AiProvider = (typeof aiProviderEnum)[number];
