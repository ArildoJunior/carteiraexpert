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

const btgSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
  Compra: "buy",
  Venda: "sell",
  Dividendo: "dividend",
  Rendimento: "interest",
  JCP: "jcp",
  Amortizacao: "interest",
  Bonificacao: "split",
};

export const btgMapping: BrokerMapping = {
  brokerSlug: "btg",
  displayName: "BTG Pactual",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: /Data\s+(do\s+)?Lan[çc]amento/i, targetField: "occurredAt", transform: toDate },
    { sourceHeader: /Ativo|C[óo]digo/i, targetField: "ticker", transform: toTicker },
    { sourceHeader: /Quantidade/i, targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: /Pre[çc]o/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "Tipo",
  sideMap: btgSideMap,
  detect(headers) {
    return (
      headers.some((h) => /Data\s+(do\s+)?Lan[çc]amento/i.test(h)) &&
      headers.includes("Tipo") &&
      headers.some((h) => /Pre[çc]o/i.test(h))
    );
  },
};

export const _btgHelpers = { toTicker, toPositiveNumber, toDate, btgSideMap };
