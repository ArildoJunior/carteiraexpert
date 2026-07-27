// tests/unit/quotes-manager.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/quotes/repository", () => ({
  upsertQuote: vi.fn(),
  getQuoteByCategory: vi.fn(),
  listExpired: vi.fn(),
}));

vi.mock("@/lib/quotes/select-provider", () => ({
  selectProvider: vi.fn(),
}));

import { refreshQuote } from "@/lib/quotes/manager";
import { upsertQuote } from "@/lib/quotes/repository";
import { selectProvider } from "@/lib/quotes/select-provider";

const upsertQuoteMock = vi.mocked(upsertQuote);
const selectProviderMock = vi.mocked(selectProvider);

const fakeProvider = {
  name: "brapi",
  fetchQuote: vi.fn(),
};

describe("quotes/manager.refreshQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeProvider.fetchQuote.mockReset();
  });

  it("retorna null quando nao ha provider para o ticker", async () => {
    selectProviderMock.mockReturnValueOnce(null);

    const result = await refreshQuote({ ticker: "PETR4", assetClass: "stock" });

    expect(result).toBeNull();
    expect(upsertQuoteMock).not.toHaveBeenCalled();
  });

  it("grava no banco via repository quando o provider responde ok", async () => {
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

    const result = await refreshQuote({ ticker: "petr4", assetClass: "stock" });

    expect(result).not.toBeNull();
    expect(result?.providerUsed).toBe("brapi");
    expect(result?.snapshot.ticker).toBe("PETR4");
    expect(result?.snapshot.category).toBe("quote_br");
    expect(result?.snapshot.price).toBe(38.5);
    expect(result?.snapshot.provider).toBe("brapi");
    expect(result?.snapshot.status).toBe("fresh");
    expect(upsertQuoteMock).toHaveBeenCalledTimes(1);
  });

  it("retorna null quando o provider responde com erro", async () => {
    selectProviderMock.mockReturnValueOnce(fakeProvider as never);
    fakeProvider.fetchQuote.mockResolvedValueOnce({ ok: false, error: "timeout" });

    const result = await refreshQuote({ ticker: "PETR4", assetClass: "stock" });

    expect(result).toBeNull();
    expect(upsertQuoteMock).not.toHaveBeenCalled();
  });

  it("mapeia crypto para categoria crypto", async () => {
    selectProviderMock.mockReturnValueOnce(fakeProvider as never);
    fakeProvider.fetchQuote.mockResolvedValueOnce({
      ok: true,
      quote: {
        ticker: "BTC",
        price: 350_000,
        currency: "BRL",
        change: 1_200,
        changePercent: 0.34,
        volume: null,
        source: "coingecko",
      },
    });

    const result = await refreshQuote({ ticker: "BTC", assetClass: "crypto" });

    expect(result?.snapshot.category).toBe("crypto");
    expect(result?.snapshot.provider).toBe("coingecko");
  });
});
