import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { db } from "../src/lib/db";
import {
  assets,
  brokerageAccounts,
  userPreferences,
  users,
  watchlistItems,
  watchlists,
} from "./schema";

const SEED_USER = {
  email: "demo@carteiraexpert.com",
  name: "Usuario Demo",
  password: "senhademo123segura",
};

const SEED_ASSETS = [
  { ticker: "PETR4", name: "Petrobras PN", assetClass: "stock" as const, sector: "Energia" },
  { ticker: "VALE3", name: "Vale ON", assetClass: "stock" as const, sector: "Mineracao" },
  { ticker: "ITSA4", name: "Itausa PN", assetClass: "stock" as const, sector: "Financeiro" },
  {
    ticker: "HGLG11",
    name: "CSHG Logistica FII",
    assetClass: "reit" as const,
    sector: "Logistica",
  },
  { ticker: "XPML11", name: "XP Malls FII", assetClass: "reit" as const, sector: "Shopping" },
  { ticker: "MXRF11", name: "Maxi Renda FII", assetClass: "reit" as const, sector: "Recebiveis" },
  { ticker: "BOVA11", name: "iShares Ibovespa", assetClass: "etf" as const, sector: "Indice" },
  {
    ticker: "IVVB11",
    name: "iShares S&P 500",
    assetClass: "etf" as const,
    sector: "Internacional",
  },
  { ticker: "BTC", name: "Bitcoin", assetClass: "crypto" as const, sector: "Cripto" },
  { ticker: "ETH", name: "Ethereum", assetClass: "crypto" as const, sector: "Cripto" },
  {
    ticker: "TESOURO_SELIC_2029",
    name: "Tesouro Selic 2029",
    assetClass: "treasury" as const,
    sector: "Renda Fixa",
  },
];

async function main() {
  console.log("Iniciando seed...");

  const [existing] = await db.select().from(users).where(eq(users.email, SEED_USER.email)).limit(1);
  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`Usuario demo ja existe: ${SEED_USER.email}`);
  } else {
    const passwordHash = await hashPassword(SEED_USER.password);
    const [u] = await db
      .insert(users)
      .values({ email: SEED_USER.email, name: SEED_USER.name, passwordHash })
      .returning();
    if (!u) throw new Error("Falha ao criar usuario demo");
    userId = u.id;
    console.log(`Usuario demo criado: ${SEED_USER.email} / ${SEED_USER.password}`);
  }

  for (const a of SEED_ASSETS) {
    const [ex] = await db.select().from(assets).where(eq(assets.ticker, a.ticker)).limit(1);
    if (!ex) {
      await db.insert(assets).values(a);
      console.log(`Ativo criado: ${a.ticker}`);
    }
  }

  const [existingAccount] = await db
    .select()
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.userId, userId))
    .limit(1);
  if (!existingAccount) {
    await db.insert(brokerageAccounts).values({
      userId,
      name: "XP Investimentos",
      type: "brokerage",
      broker: "xp",
    });
    console.log("Conta XP criada");
  }

  const [petr4] = await db.select().from(assets).where(eq(assets.ticker, "PETR4")).limit(1);
  const [vale3] = await db.select().from(assets).where(eq(assets.ticker, "VALE3")).limit(1);
  const [hglg11] = await db.select().from(assets).where(eq(assets.ticker, "HGLG11")).limit(1);

  const [existingWatch] = await db
    .select()
    .from(watchlists)
    .where(eq(watchlists.userId, userId))
    .limit(1);
  if (!existingWatch && petr4 && vale3 && hglg11) {
    const [w] = await db
      .insert(watchlists)
      .values({
        userId,
        name: "Acompanhamento",
        description: "Ativos que estou de olho",
      })
      .returning();
    if (w) {
      await db.insert(watchlistItems).values([
        { watchlistId: w.id, assetId: petr4.id, position: "0" },
        { watchlistId: w.id, assetId: vale3.id, position: "1" },
        { watchlistId: w.id, assetId: hglg11.id, position: "2" },
      ]);
      console.log("Watchlist 'Acompanhamento' criada com 3 ativos");
    }
  }

  const [existingPref] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (!existingPref) {
    await db.insert(userPreferences).values({
      userId,
      preferences: JSON.stringify({
        theme: "system",
        language: "pt-BR",
        baseCurrency: "BRL",
        density: "comfortable",
        notifications: { inApp: true, email: true, push: false },
      }),
    });
    console.log("Preferencias default criadas");
  }

  console.log("");
  console.log("Seed concluido!");
  console.log(`Login: ${SEED_USER.email} / ${SEED_USER.password}`);
}

main()
  .catch((err) => {
    console.error("Erro no seed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
