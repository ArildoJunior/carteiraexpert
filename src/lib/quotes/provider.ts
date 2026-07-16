import type { AssetClass } from "@/lib/db/enums";
import type { QuoteResult } from "./types";

export interface QuoteProvider {
  name: import("./types").QuoteSource;
  supports(ticker: string, assetClass: AssetClass): boolean;
  fetchQuote(ticker: string): Promise<QuoteResult>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}
