import type { BrokerTransactionSide } from "../../types";
import { parseFlexibleDate } from "../dates";
import { parseUSNumber } from "../numbers";
import type { BrokerMapping, ColumnTransform } from "./types";

const toTicker: ColumnTransform = (value) => {
  const t = String(value).trim().toUpperCase().replace(/[/-]/g, "");
  if (t === "" || t === "USDT") return "USDT";
  return t;
};

const toPositiveNumber: ColumnTransform = (value) => {
  if (value == null) return null;
  const cleaned = String(value).trim();
  if (cleaned === "" || cleaned === "-") return null;
  return parseUSNumber(cleaned);
};

const toDate: ColumnTransform = (value) => {
  // Binance XLSX exporta com data ISO 8601 (YYYY-MM-DD HH:MM:SS) ou UTC.
  // Tenta ISO primeiro, depois US como fallback.
  const iso = parseFlexibleDate(String(value), "ISO");
  if (iso) return iso;
  return parseFlexibleDate(String(value), "US");
};

const binanceSideMap: Record<string, BrokerTransactionSide> = {
  Buy: "buy",
  Sell: "sell",
  "Buy Crypto": "buy",
  "Sell Crypto": "buy",
  Distribution: "dividend",
  Staking: "interest",
  Deposit: "transfer_in",
  Withdrawal: "transfer_out",
  Fee: "fee",
  Convert: "other",
};

export const binanceMapping: BrokerMapping = {
  brokerSlug: "binance",
  displayName: "Binance",
  fileFormat: "xlsx",
  // Binance exporta em uma sheet chamada "Trade History" ou "Transaction History"
  sheetName: "Trade History",
  dateFormat: "ISO",
  numberFormat: "US",
  defaultCurrency: "USDT",
  columns: [
    {
      sourceHeader: /Date\s*\(.+\)|UTC\s*Time|Time/i,
      targetField: "occurredAt",
      transform: toDate,
    },
    { sourceHeader: /Pair|Symbol|Market/i, targetField: "ticker", transform: toTicker },
    {
      sourceHeader: /Executed|Quantity|Amount/i,
      targetField: "quantity",
      transform: toPositiveNumber,
    },
    { sourceHeader: /Price/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "Side",
  sideMap: binanceSideMap,
  detect(headers) {
    return (
      headers.some((h) => /Pair|Symbol/i.test(h)) &&
      headers.some((h) => /Executed|Quantity/i.test(h)) &&
      (headers.includes("Side") || headers.some((h) => /Type/i.test(h)))
    );
  },
};

export const _binanceHelpers = { toTicker, toPositiveNumber, toDate, binanceSideMap };
