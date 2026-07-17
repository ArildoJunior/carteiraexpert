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

const ricoSideMap: Record<string, BrokerTransactionSide> = {
  Compra: "buy",
  Venda: "sell",
  Rendimento: "dividend",
  Dividendo: "dividend",
  JCP: "jcp",
  Bonificacao: "split",
  Split: "split",
  Transferencia: "transfer_in",
};

export const ricoMapping: BrokerMapping = {
  brokerSlug: "rico",
  displayName: "Rico Investimentos",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "Data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: "Ativo", targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantidade/i, targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: /Pre[çc]o\s+Unit[áa]rio/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "Tipo",
  sideMap: ricoSideMap,
  detect(headers) {
    return headers.includes("Ativo") && headers.some((h) => /Pre[çc]o\s+Unit[áa]rio/i.test(h));
  },
};

export const _ricoHelpers = { toTicker, toPositiveNumber, toDate, ricoSideMap };
