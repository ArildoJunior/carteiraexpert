import type { AssetClass } from "@/lib/db/enums";
import type { QuoteProvider } from "./provider";
import { brapiProvider } from "./providers/brapi";
import { coingeckoProvider } from "./providers/coingecko";

const STOCK_LIKE: AssetClass[] = ["stock", "reit", "etf", "bdr"];
const CRYPTO: AssetClass[] = ["crypto"];

export function selectProvider(_ticker: string, assetClass: AssetClass): QuoteProvider | null {
  if (STOCK_LIKE.includes(assetClass)) return brapiProvider;
  if (CRYPTO.includes(assetClass)) return coingeckoProvider;
  return null;
}
