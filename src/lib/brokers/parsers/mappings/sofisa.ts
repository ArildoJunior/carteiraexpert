import type { BrokerTransaction, BrokerTransactionSide } from "../../types";
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

const toDate: ColumnTransform = (value) => {
  const d = parseFlexibleDate(String(value), "BR");
  return d;
};

const sofisaSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
  D: "dividend",
  J: "jcp",
  R: "interest",
  I: "interest",
  T: "transfer_in",
  O: "transfer_out",
};

export const sofisaMapping: BrokerMapping = {
  brokerSlug: "sofisa",
  displayName: "Sofisa Direto",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "Data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: "Ativo", targetField: "ticker", transform: toTicker },
    { sourceHeader: "Nome", targetField: "name", optional: true },
    { sourceHeader: "Quantidade", targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: "Preco", targetField: "price", transform: toPositiveNumber },
    { sourceHeader: "Taxa", targetField: "fees", transform: toPositiveNumber, optional: true },
  ],
  sideField: "Tipo",
  sideMap: sofisaSideMap,
  detect(headers) {
    return headers.includes("Data") && headers.includes("Ativo") && headers.includes("Quantidade");
  },
};

// Helper publico para testes
export const _sofisaHelpers = { toTicker, toPositiveNumber, toDate, sofisaSideMap };

// Type para forcar import do BrokerTransaction (evita erro de unused)
export type _SofisaTransaction = BrokerTransaction;
