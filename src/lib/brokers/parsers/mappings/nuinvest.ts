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

// NuInvest usa codigos numericos: 1=Compra, 2=Venda, D=Dividendo
const nuinvestSideMap: Record<string, BrokerTransactionSide> = {
  "1": "buy",
  "2": "sell",
  D: "dividend",
  J: "jcp",
  R: "interest",
  C: "buy", // as vezes C
  V: "sell", // as vezes V
};

export const nuinvestMapping: BrokerMapping = {
  brokerSlug: "nuinvest",
  displayName: "Nu Invest",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "Data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: "Codigo", targetField: "ticker", transform: toTicker },
    { sourceHeader: "Quantidade", targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: "Valor", targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "Tipo",
  sideMap: nuinvestSideMap,
  detect(headers) {
    return headers.includes("Codigo") && headers.includes("Tipo") && headers.includes("Corretora");
  },
};

export const _nuinvestHelpers = { toTicker, toPositiveNumber, toDate, nuinvestSideMap };
