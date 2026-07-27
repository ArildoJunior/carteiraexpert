// src/inngest/functions/refresh-quotes.ts
// Cap 6 — Jobs Inngest por categoria. Unico caminho que fala com provider externo.
// O manager (`src/lib/quotes/manager.ts`) e chamado aqui, nunca na rota do usuario.

import { inngest } from "@/inngest/client";
import { type RefreshInput, refreshQuote } from "@/lib/quotes/manager";

type AssetClass = RefreshInput["assetClass"];

const TICKERS_POR_CATEGORIA: Record<string, Array<{ ticker: string; assetClass: AssetClass }>> = {
  quote_br: [
    { ticker: "PETR4", assetClass: "stock" },
    { ticker: "VALE3", assetClass: "stock" },
    { ticker: "ITUB4", assetClass: "stock" },
    { ticker: "BBSE3", assetClass: "stock" },
    { ticker: "HGLG11", assetClass: "reit" },
    { ticker: "IVVB11", assetClass: "etf" },
  ],
  quote_us: [
    { ticker: "AAPL", assetClass: "bdr" },
    { ticker: "MSFT", assetClass: "bdr" },
    { ticker: "GOOGL", assetClass: "bdr" },
  ],
  crypto: [
    { ticker: "BTC", assetClass: "crypto" },
    { ticker: "ETH", assetClass: "crypto" },
    { ticker: "SOL", assetClass: "crypto" },
  ],
};

export const refreshQuotes = inngest.createFunction(
  {
    id: "refresh-quotes",
    name: "Refresh quotes (event-trigger)",
    triggers: [{ event: "quotes/refresh.requested" }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as {
      ticker?: string;
      assetClass?: AssetClass;
      category?: string;
      categorias?: string[];
    };

    const categorias =
      data.categorias ?? (data.category ? [data.category] : Object.keys(TICKERS_POR_CATEGORIA));

    const resultados: Record<string, unknown> = {};

    for (const categoria of categorias) {
      resultados[categoria] = await step.run(`refresh-${categoria}`, async () => {
        const alvos =
          data.ticker && data.assetClass
            ? [{ ticker: data.ticker, assetClass: data.assetClass }]
            : (TICKERS_POR_CATEGORIA[categoria] ?? []);

        const feitos: unknown[] = [];
        for (const alvo of alvos) {
          const r = await refreshQuote({
            ticker: alvo.ticker,
            assetClass: alvo.assetClass,
            category: categoria as RefreshInput["category"],
          });
          feitos.push(r);
        }
        return { ok: true, total: feitos.length, resultados: feitos };
      });
    }

    return { ok: true, resultados };
  }
);

export const functions = [refreshQuotes];
