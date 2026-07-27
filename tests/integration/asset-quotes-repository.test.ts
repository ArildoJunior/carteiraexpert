// tests/integration/asset-quotes-repository.test.ts
// Cap 6 — Cobertura do repository. Usa o banco de teste configurado em `tests/setup.ts`.

import { assetQuotes } from "@/db/schema/asset-quotes";
import { db } from "@/lib/db";
import {
  type AssetQuoteSnapshot,
  getQuoteByCategory,
  listExpired,
  upsertQuote,
} from "@/lib/quotes/repository";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeSnapshot(overrides: Partial<AssetQuoteSnapshot> = {}): AssetQuoteSnapshot {
  const now = new Date();
  return {
    category: "quote_br",
    ticker: "PETR4",
    price: 38.5,
    currency: "BRL",
    change: 0.4,
    changePct: 1.05,
    volume: 12_000_000,
    marketCap: null,
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    provider: "brapi",
    status: "fresh",
    delayMs: 0,
    ...overrides,
  };
}

async function cleanup(ticker: string, category: AssetQuoteSnapshot["category"]) {
  await db.delete(assetQuotes).where(eq(assetQuotes.ticker, ticker));
  // sem `category` no WHERE para evitar pegadinha de schema; deleta por ticker unico de teste
  void category;
}

describe("quotes/repository", () => {
  beforeEach(async () => {
    await cleanup("PETR4", "quote_br");
    await cleanup("VALE3", "quote_br");
  });

  afterEach(async () => {
    await cleanup("PETR4", "quote_br");
    await cleanup("VALE3", "quote_br");
  });

  it("upsertQuote grava e getQuoteByCategory retorna o snapshot", async () => {
    const snapshot = makeSnapshot();
    await upsertQuote(snapshot);

    const found = await getQuoteByCategory("quote_br", "PETR4");
    expect(found).not.toBeNull();
    expect(found?.price).toBe(38.5);
    expect(found?.provider).toBe("brapi");
    expect(found?.status).toBe("fresh");
  });

  it("upsertQuote atualiza o registro existente (UPSERT)", async () => {
    const original = makeSnapshot({ price: 38.5 });
    const atualizado = makeSnapshot({ price: 40.0, change: 1.9, changePct: 4.98 });

    await upsertQuote(original);
    await upsertQuote(atualizado);

    const found = await getQuoteByCategory("quote_br", "PETR4");
    expect(found?.price).toBe(40.0);
    expect(found?.change).toBe(1.9);
  });

  it("getQuoteByCategory retorna null quando o ticker nao existe", async () => {
    const found = await getQuoteByCategory("quote_br", "NAOEXISTE99");
    expect(found).toBeNull();
  });

  it("getQuoteByCategory normaliza o ticker para uppercase", async () => {
    const snapshot = makeSnapshot({ ticker: "VALE3" });
    await upsertQuote(snapshot);

    const found = await getQuoteByCategory("quote_br", "vale3");
    expect(found?.ticker).toBe("VALE3");
  });

  it("listExpired retorna apenas registros com expiresAt no passado", async () => {
    const expirado = makeSnapshot({
      ticker: "PETR4",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const fresco = makeSnapshot({
      ticker: "VALE3",
      expiresAt: new Date(Date.now() + 5 * 60_1000),
    });

    await upsertQuote(expirado);
    await upsertQuote(fresco);

    const expirados = await listExpired("quote_br");
    const tickers = expirados.map((s) => s.ticker);
    expect(tickers).toContain("PETR4");
    expect(tickers).not.toContain("VALE3");
  });
});
