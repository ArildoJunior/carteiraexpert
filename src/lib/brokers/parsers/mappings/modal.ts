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

const modalSideMap: Record<string, BrokerTransactionSide> = {
  Compra: "buy",
  Venda: "sell",
  Dividendo: "dividend",
  JCP: "jcp",
  Rendimento: "interest",
  Transferencia: "transfer_in",
  Saque: "transfer_out",
};

export const modalMapping: BrokerMapping = {
  brokerSlug: "modal",
  displayName: "Modal Mais",
  fileFormat: "csv",
  delimiter: ";",
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  columns: [
    { sourceHeader: "data", targetField: "occurredAt", transform: toDate },
    { sourceHeader: "ativo", targetField: "ticker", transform: toTicker },
    { sourceHeader: "quantidade", targetField: "quantity", transform: toPositiveNumber },
    { sourceHeader: "preco", targetField: "price", transform: toPositiveNumber },
    { sourceHeader: "taxa", targetField: "fees", transform: toPositiveNumber, optional: true },
  ],
  sideField: "operacao",
  sideMap: modalSideMap,
  detect(headers) {
    // Modal usa lowercase nos headers
    return headers.includes("data") && headers.includes("ativo") && headers.includes("operacao");
  },
};

export const _modalHelpers = { toTicker, toPositiveNumber, toDate, modalSideMap };
