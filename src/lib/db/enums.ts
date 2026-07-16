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
