/**
 * Seed demo completo para o dashboard.
 *
 * Popula:
 *   - 1 usuario demo (login: demo@carteiraexpert.com / senha: demo1234)
 *   - 1 conta brokerage XP
 *   - 5 ativos (PETR4, VALE3, ITUB4, KNRI11, TESOURO_SELIC_2029)
 *   - 5 transacoes de buy
 *   - 5 positions (1 por ativo, derivado das transacoes)
 *   - 1 watchlist "Acompanhamento" com 3 ativos
 *   - Preferencias default do usuario
 *   - Quote cache (best-effort, se Redis estiver configurado)
 *   - 30 dias de snapshots diarios
 *   - 30 dias de benchmarks (IBOV, IFIX, CDI)
 *
 * Idempotente: limpa dados demo antes de inserir.
 *
 * Executar: pnpm seed:demo
 */

import "dotenv/config";
import {
  assets,
  benchmarksHistory,
  brokerageAccounts,
  portfolioSnapshots,
  positions,
  transactions,
  userPreferences,
  users,
  watchlistItems,
  watchlists,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";

const DEMO_EMAIL = "demo@carteiraexpert.com";
const DEMO_PASSWORD = "demo1234";

// Precos sinteticos ~8-10% acima do custo medio para gerar variacao positiva nos movers
const SYNTHETIC_QUOTES: Record<string, number> = {
  PETR4: 39.1, // buy 35.50 -> +10.1%
  VALE3: 71.8, // buy 65.20 -> +10.1%
  ITUB4: 31.8, // buy 28.90 -> +10.0%
  KNRI11: 167.0, // buy 152.00 -> +9.9%
  TESOURO_SELIC_2029: 162.5, // buy 150.00 -> +8.3%
};

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("[seed] Limpando dados demo anteriores...");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  const demoUserIds = existing.map((u) => u.id);

  if (demoUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, demoUserIds));
  }

  const dates30: string[] = [];
  for (let i = 0; i < 30; i++) dates30.push(dateNDaysAgo(i));
  await db
    .delete(benchmarksHistory)
    .where(
      and(
        inArray(benchmarksHistory.benchmark, ["IBOV", "IFIX", "CDI"]),
        inArray(benchmarksHistory.date, dates30)
      )
    );

  console.log("[seed] Criando usuario demo...");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [demoUser] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      name: "Usuario Demo",
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (!demoUser) throw new Error("Falha ao criar usuario demo");

  console.log("[seed] Criando conta XP...");
  const [demoAccount] = await db
    .insert(brokerageAccounts)
    .values({
      userId: demoUser.id,
      name: "XP Investimentos",
      type: "brokerage",
      broker: "xp",
      currency: "BRL",
    })
    .returning();
  if (!demoAccount) throw new Error("Falha ao criar conta");

  console.log("[seed] Criando/obtendo assets...");
  const tickerList = [
    { ticker: "PETR4", name: "Petrobras PN", assetClass: "stock" as const },
    { ticker: "VALE3", name: "Vale ON", assetClass: "stock" as const },
    { ticker: "ITUB4", name: "Itau Unibanco PN", assetClass: "stock" as const },
    { ticker: "KNRI11", name: "Kinea Renda Imobiliaria FII", assetClass: "reit" as const },
    { ticker: "TESOURO_SELIC_2029", name: "Tesouro Selic 2029", assetClass: "treasury" as const },
  ];
  const assetMap = new Map<string, string>();
  for (const t of tickerList) {
    const [ex] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.ticker, t.ticker))
      .limit(1);
    if (ex) {
      assetMap.set(t.ticker, ex.id);
    } else {
      const [a] = await db.insert(assets).values(t).returning();
      if (!a) throw new Error(`Falha ao criar asset ${t.ticker}`);
      assetMap.set(t.ticker, a.id);
    }
  }

  console.log("[seed] Inserindo transacoes...");
  const txs = [
    { ticker: "PETR4", qty: 100, price: 35.5, daysAgo: 90 },
    { ticker: "VALE3", qty: 50, price: 65.2, daysAgo: 80 },
    { ticker: "ITUB4", qty: 80, price: 28.9, daysAgo: 60 },
    { ticker: "KNRI11", qty: 20, price: 152.0, daysAgo: 45 },
    { ticker: "TESOURO_SELIC_2029", qty: 1, price: 150.0, daysAgo: 30 },
  ];
  const txValues = txs.map((t) => {
    const assetId = assetMap.get(t.ticker);
    if (!assetId) throw new Error(`Asset id nao encontrado: ${t.ticker}`);
    const total = t.qty * t.price;
    return {
      userId: demoUser.id,
      accountId: demoAccount.id,
      assetId,
      type: "buy" as const,
      transactionDate: dateNDaysAgo(t.daysAgo),
      quantity: t.qty.toString(),
      unitPrice: t.price.toString(),
      totalAmount: total.toString(),
      fees: "0",
      currency: "BRL",
    };
  });
  await db.insert(transactions).values(txValues);

  console.log("[seed] Derivando positions a partir das transacoes...");
  const positionValues = txs.map((t) => {
    const assetId = assetMap.get(t.ticker);
    if (!assetId) throw new Error(`Asset id nao encontrado: ${t.ticker}`);
    return {
      userId: demoUser.id,
      accountId: demoAccount.id,
      assetId,
      quantity: t.qty.toString(),
      averageCost: t.price.toString(),
      costCurrency: "BRL",
      isOpen: "true",
      openedAt: new Date(Date.now() - t.daysAgo * 86400 * 1000),
    };
  });
  await db.insert(positions).values(positionValues);

  console.log("[seed] Criando watchlist...");
  const [watch] = await db
    .insert(watchlists)
    .values({
      userId: demoUser.id,
      name: "Acompanhamento",
      description: "Ativos que estou de olho",
    })
    .returning();
  if (watch) {
    const watchItems: Array<{ watchlistId: string; assetId: string; position: string }> = [];
    for (const [idx, ticker] of ["PETR4", "VALE3", "KNRI11"].entries()) {
      const aid = assetMap.get(ticker);
      if (aid) watchItems.push({ watchlistId: watch.id, assetId: aid, position: String(idx) });
    }
    if (watchItems.length > 0) await db.insert(watchlistItems).values(watchItems);
  }

  console.log("[seed] Criando preferencias default...");
  await db.insert(userPreferences).values({
    userId: demoUser.id,
    preferences: JSON.stringify({
      theme: "system",
      language: "pt-BR",
      baseCurrency: "BRL",
      density: "comfortable",
      notifications: { inApp: true, email: true, push: false },
    }),
  });

  // Best-effort: pre-popular cache de cotacoes no Redis para movers nao ficar vazio
  console.log("[seed] Pre-populando cache de cotacoes (best-effort)...");
  try {
    const { cacheSet, cacheSetStale } = await import("@/lib/redis/upstash");
    const fetchedAt = new Date();
    let cached = 0;
    for (const [ticker, price] of Object.entries(SYNTHETIC_QUOTES)) {
      const quote = {
        ticker,
        price: String(price),
        currency: "BRL",
        fetchedAt,
        delaySeconds: 0,
        source: "manual",
      };
      await cacheSet(`quote:${ticker}`, quote, 60);
      await cacheSetStale(`quote:${ticker}`, quote, 24 * 60 * 60);
      cached++;
    }
    console.log(`[seed] Quote cache populado para ${cached} ativos`);
  } catch (e) {
    console.log(`[seed] Quote cache skip (Redis nao configurado): ${(e as Error).message}`);
  }

  // Best-effort: revalidar cache do dashboard para a proxima carga ver os dados
  console.log("[seed] Revalidando cache do dashboard (best-effort)...");
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag("dashboard", "max");
    revalidateTag("dashboard-allocation", "max");
    revalidateTag("dashboard-movers", "max");
    revalidateTag("dashboard-evolution", "max");
    revalidateTag("dashboard-overview", "max");
    revalidateTag("dashboard-heatmap", "max");
    console.log("[seed] Cache revalidado");
  } catch (e) {
    console.log(`[seed] revalidateTag skip (sem request scope): ${(e as Error).message}`);
  }

  console.log("[seed] Inserindo benchmarks (IBOV, IFIX, CDI) - 30 dias...");
  type BenchRow = { benchmark: string; date: string; value: string; source: string };
  const benchRows: BenchRow[] = [];
  for (const b of ["IBOV", "IFIX", "CDI"] as const) {
    let base = b === "CDI" ? 0.0004583 : b === "IBOV" ? 130000 : 3200;
    for (let i = 29; i >= 0; i--) {
      const date = dateNDaysAgo(i);
      if (b === "CDI") {
        benchRows.push({ benchmark: b, date, value: "0.00045830", source: "manual" });
      } else {
        const noise = (Math.sin(i * (b === "IBOV" ? 0.7 : 1.3)) + 1) / 2;
        const change = 0.005 * noise;
        base = base * (1 + change);
        benchRows.push({ benchmark: b, date, value: base.toFixed(2), source: "manual" });
      }
    }
  }
  await db.insert(benchmarksHistory).values(benchRows);

  console.log("[seed] Inserindo 30 dias de portfolio snapshots...");
  const totalCost = txs.reduce((s, t) => s + t.qty * t.price, 0);
  type SnapRow = {
    userId: string;
    date: string;
    totalValue: string;
    totalCost: string;
    unrealizedPnl: string;
    realizedPnl: string;
    twrDaily: string;
    twrCumulative: string;
    allocationByClass: string;
    positionsCount: string;
  };
  const snapRows: SnapRow[] = [];
  let value = totalCost;
  for (let i = 29; i >= 0; i--) {
    const dailyChange = (Math.sin(i * 0.4) + 1) * 0.003;
    value = value * (1 + dailyChange);
    const pnl = value - totalCost;
    const cumTwr = pnl / totalCost;
    snapRows.push({
      userId: demoUser.id,
      date: dateNDaysAgo(i),
      totalValue: value.toFixed(2),
      totalCost: totalCost.toFixed(2),
      unrealizedPnl: pnl.toFixed(2),
      realizedPnl: "0.00",
      twrDaily: dailyChange.toFixed(8),
      twrCumulative: cumTwr.toFixed(8),
      allocationByClass: JSON.stringify({}),
      positionsCount: "5",
    });
  }
  await db.insert(portfolioSnapshots).values(snapRows);

  console.log("[seed] Concluido!");
  console.log(`  Login: ${DEMO_EMAIL}`);
  console.log(`  Senha: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("[seed] ERRO:", err);
  process.exit(1);
});
