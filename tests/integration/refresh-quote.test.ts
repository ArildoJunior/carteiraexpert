// tests/integration/refresh-quote.test.ts
// Cap 6 — Cobertura do job Inngest. Mocka o provider, valida que o manager grava no banco.

import { assetQuotes } from "@/db/schema/asset-quotes";
import { db } from "@/lib/db";
import { getQuoteByCategory } from "@/lib/quotes/repository";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/quotes/select-provider", () => ({
  selectProvider: vi.fn(),
}));

vi.mock("@/lib/quotes/repository", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/quotes/repository")>("@/lib/quotes/repository");
  return {
    ...actual,
    upsertQuote: vi.fn(actual.upsertQuote),
  };
});

import { refreshQuote } from "@/lib/quotes/manager";
import { selectProvider } from "@/lib/quotes/select-provider";

const selectProviderMock = vi.mocked(selectProvider);

const fakeProvider = {
  name: "brapi",
  fetchQuote: vi.fn(),
};

async function cleanup(ticker: string) {
  await db.delete(assetQuotes).where(eq(assetQuotes.ticker, ticker));
}

describe("quotes/manager.refreshQuote (integration)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup("PETR4");
  });

  afterEach(async () => {
    await cleanup("PETR4");
  });

  it("grava cotacao real no banco via repository", async () => {
    selectProviderMock.mockReturnValueOnce(fakeProvider as never);
    fakeProvider.fetchQuote.mockResolvedValueOnce({
      ok: true,
      quote: {
        ticker: "PETR4",
        price: 38.5,
        currency: "BRL",
        change: 0.4,
        changePercent: 1.05,
        volume: 12_000_000,
        source: "brapi",
      },
    });

    const result = await refreshQuote({ ticker: "PETR4", assetClass: "stock" });

    expect(result).not.toBeNull();
    expect(result?.providerUsed).toBe("brapi");

    const found = await getQuoteByCategory("quote_br", "PETR4");
    expect(found).not.toBeNull();
    expect(found?.price).toBe(38.5);
    expect(found?.provider).toBe("brapi");
    expect(found?.status).toBe("fresh");
  });
});
