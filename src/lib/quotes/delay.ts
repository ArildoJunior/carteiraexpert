import type { Quote } from "./types";

export type QuoteFreshness = "realtime" | "recent" | "delayed" | "stale";

const REALTIME_MAX = 60;
const RECENT_MAX = 15 * 60;
const DELAYED_MAX = 60 * 60;

export function classifyDelay(quote: Quote): QuoteFreshness {
  const age = quote.delaySeconds;
  if (age <= REALTIME_MAX) return "realtime";
  if (age <= RECENT_MAX) return "recent";
  if (age <= DELAYED_MAX) return "delayed";
  return "stale";
}

export const FRESHNESS_LABELS: Record<QuoteFreshness, string> = {
  realtime: "Tempo real",
  recent: "Recente",
  delayed: "Cotacao com delay",
  stale: "Ultimo valor conhecido",
};

export const FRESHNESS_VARIANT: Record<
  QuoteFreshness,
  "default" | "secondary" | "outline" | "destructive"
> = {
  realtime: "default",
  recent: "secondary",
  delayed: "outline",
  stale: "destructive",
};
