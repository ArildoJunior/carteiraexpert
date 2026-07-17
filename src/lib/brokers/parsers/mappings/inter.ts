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

const interSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
  Compra: "buy",
  Venda: "sell",
  "Compra RF": "buy",
  "Venda RF": "sell",
  Dividendo: "dividend",
  Rendimento: "interest",
  JCP: "jcp",
  Bonificacao: "split",
  Split: "split",
};

export const interMapping: BrokerMapping = {
  brokerSlug: "inter",
  displayName: "Inter Invest",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "Data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: /C[óo]digo\s+do\s+Ativo|Ativo/i, targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantidade/i, targetField: "quantity", transform: toPositiveNumber },
    {
      sourceHeader: /Pre[çc]o\s+Unit[áa]rio|Pre[çc]o/i,
      targetField: "price",
      transform: toPositiveNumber,
    },
  ],
  sideField: "Tipo",
  sideMap: interSideMap,
  detect(headers) {
    return (
      headers.includes("Data") &&
      headers.includes("Tipo") &&
      (headers.includes("Ativo") || headers.some((h) => /C[óo]digo\s+do\s+Ativo/i.test(h)))
    );
  },
};

export const _interHelpers = { toTicker, toPositiveNumber, toDate, interSideMap };
