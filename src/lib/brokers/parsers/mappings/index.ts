import { avenueMapping } from "./avenue";
import { binanceMapping } from "./binance";
import { btgMapping } from "./btg";
import { genericMapping } from "./generic";
import { genialMapping } from "./genial";
import { interMapping } from "./inter";
import { modalMapping } from "./modal";
import { nuinvestMapping } from "./nuinvest";
import { ricoMapping } from "./rico";
import { sofisaMapping } from "./sofisa";
import type { BrokerMapping } from "./types";
import { xpMapping } from "./xp";

export const allMappings: BrokerMapping[] = [
  sofisaMapping,
  modalMapping,
  nuinvestMapping,
  xpMapping,
  ricoMapping,
  btgMapping,
  interMapping,
  avenueMapping,
  binanceMapping,
  genialMapping,
];

// Mapping generico fica separado - so' e' usado como fallback
export const fallbackMappings: BrokerMapping[] = [genericMapping];

export function getMappingBySlug(slug: string): BrokerMapping | undefined {
  return allMappings.find((m) => m.brokerSlug === slug);
}

// Dado os headers do arquivo, retorna o primeiro mapping que reconhece.
export function findMappingByHeaders(headers: string[]): BrokerMapping | null {
  for (const mapping of allMappings) {
    if (mapping.detect(headers)) return mapping;
  }
  return null;
}

// Tenta primeiro os especificos, depois o generico. Retorna null se nada bate.
export function detectMapping(headers: string[]): BrokerMapping | null {
  return findMappingByHeaders(headers);
}

export { genericMapping };
