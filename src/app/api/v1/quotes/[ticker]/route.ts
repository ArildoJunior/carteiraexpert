// src/app/api/v1/quotes/[ticker]/route.ts
import { auth } from "@/lib/auth";
import { type QuoteCategory, getQuoteByCategory } from "@/lib/quotes/repository";
import { cacheGet, cacheSet } from "@/lib/redis/upstash";
import { NextResponse } from "next/server";

const CATEGORY_MAP: Record<string, QuoteCategory> = {
  stock: "quote_br",
  reit: "quote_br",
  etf: "quote_br",
  bdr: "quote_us",
  crypto: "crypto",
};

type Params = { ticker: string };

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const { ticker: rawTicker } = await context.params;
  if (!/^[A-Z0-9-]{3,20}$/i.test(rawTicker)) {
    return NextResponse.json({ message: "Ticker invalido" }, { status: 400 });
  }

  const url = new URL(req.url);
  const assetClassParam = url.searchParams.get("class") ?? "stock";
  const category = CATEGORY_MAP[assetClassParam];
  if (!category) {
    return NextResponse.json({ message: "Classe de ativo sem cotacao online" }, { status: 400 });
  }

  const upper = rawTicker.toUpperCase();
  const cacheKey = `cache:read:asset_quote:${category}:${upper}`;

  // 1) Acelerador opcional: Redis. Se cair, a rota continua via Postgres.
  const cached = await cacheGet<{ data: unknown }>(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached.data });
  }

  // 2) Fonte primaria: banco.
  const snap = await getQuoteByCategory(category, upper);
  if (!snap) {
    return NextResponse.json({ message: "Ativo nao encontrado" }, { status: 404 });
  }

  const now = Date.now();
  const data = {
    ticker: snap.ticker,
    price: snap.price,
    change: snap.change,
    changePercent: snap.changePct,
    volume: snap.volume ?? undefined,
    currency: snap.currency,
    source: snap.provider,
    fetchedAt: snap.fetchedAt.toISOString(),
    expiresAt: snap.expiresAt.toISOString(),
    status: snap.status,
    delaySeconds: Math.max(0, Math.round((now - snap.fetchedAt.getTime()) / 1000)),
  };

  // Acelera proxima leitura (TTL curto, 10s, opcional e removivel).
  await cacheSet(cacheKey, { data }, 10);

  const expired = snap.expiresAt.getTime() < now;
  if (expired || snap.status !== "fresh") {
    return NextResponse.json({ message: "Cotacao stale ou expirada", data }, { status: 503 });
  }

  return NextResponse.json({ data });
}
