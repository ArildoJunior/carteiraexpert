import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis/upstash", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheGetStale: vi.fn(),
  cacheSetStale: vi.fn(),
}));

vi.mock("@/lib/quotes/providers/brapi", () => ({
  brapiProvider: {
    name: "brapi",
    supports: vi.fn(() => true),
    fetchQuote: vi.fn(),
    healthCheck: vi.fn(),
  },
}));

vi.mock("@/lib/quotes/providers/coingecko", () => ({
  coingeckoProvider: {
    name: "coingecko",
    supports: vi.fn(() => true),
    fetchQuote: vi.fn(),
    healthCheck: vi.fn(),
  },
}));

import { getQuote, getQuotesBatch } from "@/lib/quotes/manager";
import { brapiProvider } from "@/lib/quotes/providers/brapi";
import type { Quote } from "@/lib/quotes/types";
import { cacheGet, cacheGetStale, cacheSet, cacheSetStale } from "@/lib/redis/upstash";

const makeQuote = (
  overrides: { ticker?: string; price?: number; source?: Quote["source"] } = {}
): Quote => ({
  ticker: overrides.ticker ?? "PETR4",
  price: overrides.price ?? 30,
  change: 0.5,
  changePercent: 1.5,
  currency: "BRL",
  source: overrides.source ?? "brapi",
  fetchedAt: new Date().toISOString(),
  delaySeconds: 0,
});

describe("getQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: chama provider, retorna quote, cacheia fresh e stale", async () => {
    const quote = makeQuote();
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(brapiProvider.fetchQuote).mockResolvedValue({ ok: true, quote });

    const result = await getQuote("PETR4", "stock");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quote.price).toBe(30);
    expect(brapiProvider.fetchQuote).toHaveBeenCalledWith("PETR4");
    expect(cacheSet).toHaveBeenCalledWith("quote:PETR4", quote, 60);
    expect(cacheSetStale).toHaveBeenCalledWith("quote:PETR4", quote, 86400);
  });

  it("cache fresh hit: nao chama provider", async () => {
    const cached = makeQuote();
    vi.mocked(cacheGet).mockResolvedValue(cached);

    const result = await getQuote("PETR4", "stock");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quote.price).toBe(30);
    expect(brapiProvider.fetchQuote).not.toHaveBeenCalled();
  });

  it("provider falha + tem cache stale: retorna {ok:false, staleQuote}", async () => {
    const stale = makeQuote({ source: "stale" });
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(brapiProvider.fetchQuote).mockResolvedValue({ ok: false, error: "provider-down" });
    vi.mocked(cacheGetStale).mockResolvedValue(stale);

    const result = await getQuote("PETR4", "stock");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provider-down");
      expect(result.staleQuote).toBeDefined();
      expect(result.staleQuote?.source).toBe("stale");
    }
  });

  it("provider falha + sem cache stale: retorna {ok:false, error:provider-down}", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(brapiProvider.fetchQuote).mockResolvedValue({ ok: false, error: "provider-down" });
    vi.mocked(cacheGetStale).mockResolvedValue(null);

    const result = await getQuote("PETR4", "stock");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provider-down");
      expect(result.staleQuote).toBeUndefined();
    }
  });

  it("getQuotesBatch: uma falha nao afeta os outros", async () => {
    const q1 = makeQuote({ ticker: "PETR4", price: 30 });
    const q2 = makeQuote({ ticker: "VALE3", price: 70 });
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(brapiProvider.fetchQuote)
      .mockResolvedValueOnce({ ok: true, quote: q1 })
      .mockResolvedValueOnce({ ok: false, error: "provider-down" })
      .mockResolvedValueOnce({ ok: true, quote: q2 });

    const result = await getQuotesBatch([
      { ticker: "PETR4", assetClass: "stock" },
      { ticker: "FAIL", assetClass: "stock" },
      { ticker: "VALE3", assetClass: "stock" },
    ]);

    expect(result.PETR4?.ok).toBe(true);
    expect(result.FAIL?.ok).toBe(false);
    expect(result.VALE3?.ok).toBe(true);
  });
});
