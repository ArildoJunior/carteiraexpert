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

const genialSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
  Compra: "buy",
  Venda: "sell",
  Dividendo: "dividend",
  Rendimento: "interest",
  JCP: "jcp",
  Bonificacao: "split",
  Split: "split",
  Transferencia: "transfer_in",
};

export const genialMapping: BrokerMapping = {
  brokerSlug: "genial",
  displayName: "Genial Investimentos",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "Data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: /C[óo]digo|Ativo/i, targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantidade/i, targetField: "quantity", transform: toPositiveNumber },
    {
      sourceHeader: /Pre[çc]o\s+M[ée]dio|Pre[çc]o/i,
      targetField: "price",
      transform: toPositiveNumber,
    },
  ],
  sideField: "Tipo",
  sideMap: genialSideMap,
  detect(headers) {
    return (
      headers.includes("Data") &&
      (headers.includes("Ativo") || headers.includes("Código")) &&
      headers.includes("Tipo") &&
      headers.some((h) => /Pre[çc]o/i.test(h))
    );
  },
};

export const _genialHelpers = { toTicker, toPositiveNumber, toDate, genialSideMap };
