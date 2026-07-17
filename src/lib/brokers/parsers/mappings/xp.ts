import type { BrokerTransactionSide } from "../../types";
import { parseFlexibleDate } from "../dates";
import { parseBrazilianNumber } from "../numbers";
import type { BrokerMapping, ColumnTransform } from "./types";

const toTicker: ColumnTransform = (value) => {
  const t = String(value).trim().toUpperCase();
  if (t === "") return null;
  return t.replace(/\.SA$/i, "");
};

const toPositiveNumber: ColumnTransform = (value) => {
  if (value == null) return null;
  const cleaned = String(value).trim();
  if (cleaned === "" || cleaned === "-") return null;
  return parseBrazilianNumber(cleaned);
};

const toDate: ColumnTransform = (value) => parseFlexibleDate(String(value), "BR");

// XP usa C/V direto, sem "Tipo" descritivo. Bonus: header tem acento
// ("Data Negociação") e o mapping do side é simples.
const xpSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
};

export const xpMapping: BrokerMapping = {
  brokerSlug: "xp",
  displayName: "XP Inc.",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    // Header real: "Data Negociação" (com acento e cedilha)
    { sourceHeader: /Data\s+Negocia[çc][ãa]o/i, targetField: "occurredAt", transform: toDate },
    { sourceHeader: /C[óo]digo/i, targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantidade/i, targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: /Pre[çc]o/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "C/V",
  sideMap: xpSideMap,
  detect(headers) {
    // C/V e o sinal classico
    return headers.includes("C/V") && headers.some((h) => /Quantidade/i.test(h));
  },
};

export const _xpHelpers = { toTicker, toPositiveNumber, toDate, xpSideMap };
