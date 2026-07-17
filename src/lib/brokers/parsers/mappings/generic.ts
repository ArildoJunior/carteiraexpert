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

const toDate: ColumnTransform = (value) => {
  // Tenta BR primeiro (maioria dos casos), depois ISO, depois US
  const br = parseFlexibleDate(String(value), "BR");
  if (br) return br;
  const iso = parseFlexibleDate(String(value), "ISO");
  if (iso) return iso;
  return parseFlexibleDate(String(value), "US");
};

const genericSideMap: Record<string, BrokerTransactionSide> = {
  C: "buy",
  V: "sell",
  Compra: "buy",
  Venda: "sell",
  Buy: "buy",
  Sell: "sell",
  Dividendo: "dividend",
  Dividend: "dividend",
  JCP: "jcp",
  Rendimento: "interest",
  Interest: "interest",
  Bonificacao: "split",
  Split: "split",
  Fee: "fee",
  Taxa: "fee",
  Transferencia: "transfer_in",
  Transfer: "transfer_in",
};

// Detecta por padroes de header (qualquer coluna com "data" + "ativo/ticker" + "quantidade")
function detectGeneric(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase());
  const hasDate = lower.some((h) => /data|date|time/.test(h));
  const hasAsset = lower.some((h) => /ativo|asset|ticker|symbol|code|c[óo]digo|pair/.test(h));
  const hasQty = lower.some((h) => /quantidade|quantity|shares|amount|executed/.test(h));
  return hasDate && hasAsset && hasQty;
}

export const genericMapping: BrokerMapping = {
  brokerSlug: "generic",
  displayName: "Generico (auto-detectado)",
  fileFormat: "csv",
  delimiter: ";", // BR padrao
  dateFormat: "BR",
  numberFormat: "BR",
  defaultCurrency: "BRL",
  // Source headers sao RegExps que tentam cobrir varios formatos
  columns: [
    { sourceHeader: /^(data|date|time)/i, targetField: "occurredAt", transform: toDate },
    {
      sourceHeader: /^(ativo|asset|ticker|symbol|code|c[óo]digo|pair)$/i,
      targetField: "ticker",
      transform: toTicker,
    },
    {
      sourceHeader: /^(quantidade|quantity|shares|amount|executed)$/i,
      targetField: "quantity",
      transform: toPositiveNumber,
    },
    { sourceHeader: /^(pre[çc]o|price|unit)/i, targetField: "price", transform: toPositiveNumber },
  ],
  sideField: "tipo",
  sideMap: genericSideMap,
  detect: detectGeneric,
};

export const _genericHelpers = {
  toTicker,
  toPositiveNumber,
  toDate,
  genericSideMap,
  detectGeneric,
};
