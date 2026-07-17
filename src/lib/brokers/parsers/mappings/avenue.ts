import type { BrokerTransactionSide } from "../../types";
import { parseFlexibleDate } from "../dates";
import { parseUSNumber } from "../numbers";
import type { BrokerMapping, ColumnTransform } from "./types";

const toTicker: ColumnTransform = (value) => {
  const t = String(value).trim().toUpperCase();
  if (t === "") return null;
  return t;
};

const toPositiveNumber: ColumnTransform = (value) => {
  if (value == null) return null;
  const cleaned = String(value).trim();
  if (cleaned === "" || cleaned === "-") return null;
  return parseUSNumber(cleaned);
};

// Avenue exporta em formato US: MM/DD/YYYY
const toDate: ColumnTransform = (value) => parseFlexibleDate(String(value), "US");

const avenueSideMap: Record<string, BrokerTransactionSide> = {
  Buy: "buy",
  Sell: "sell",
  Dividend: "dividend",
  Interest: "interest",
  Split: "split",
  Transfer: "transfer_in",
};

export const avenueMapping: BrokerMapping = {
  brokerSlug: "avenue",
  displayName: "Avenue Securities",
  fileFormat: "csv",
  delimiter: ",",
  dateFormat: "US",
  numberFormat: "US",
  defaultCurrency: "USD",
  columns: [
    { sourceHeader: /Trade\s+Date|Date/i, targetField: "occurredAt", transform: toDate },
    { sourceHeader: /Symbol|Ticker/i, targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantity|Shares/i, targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: /Price/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "Action",
  sideMap: avenueSideMap,
  detect(headers) {
    return headers.some((h) => /Trade\s+Date/i.test(h)) && headers.includes("Action");
  },
};

export const _avenueHelpers = { toTicker, toPositiveNumber, toDate, avenueSideMap };
