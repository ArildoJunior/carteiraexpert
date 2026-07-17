import "dotenv/config";
import { brokersTable } from "@/db/schema";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

type BrokerSeed = {
  slug: string;
  name: string;
  kind: "brokerage" | "exchange" | "bank" | "crypto";
  provider: "manual" | "pluggy" | "b3_direct";
  logoUrl: string | null;
  templateUrl: string | null;
};

// 9 corretoras para o piloto do Cap. 7. provider='manual' em todas (CSV/XLSX).
// O slug 'pluggy' NAO entra aqui — sera adicionado no Cap. 17 via migration propria.
const BROKERS: BrokerSeed[] = [
  {
    slug: "sofisa",
    name: "Sofisa Direto",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/sofisa.svg",
    templateUrl: "/templates/sofisa.csv",
  },
  {
    slug: "modal",
    name: "Modal Mais",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/modal.svg",
    templateUrl: "/templates/modal.csv",
  },
  {
    slug: "nuinvest",
    name: "Nu Invest",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/nuinvest.svg",
    templateUrl: "/templates/nuinvest.csv",
  },
  {
    slug: "xp",
    name: "XP Inc.",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/xp.svg",
    templateUrl: "/templates/xp.csv",
  },
  {
    slug: "rico",
    name: "Rico Investimentos",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/rico.svg",
    templateUrl: "/templates/rico.csv",
  },
  {
    slug: "btg",
    name: "BTG Pactual",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/btg.svg",
    templateUrl: "/templates/btg.csv",
  },
  {
    slug: "inter",
    name: "Inter Invest",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/inter.svg",
    templateUrl: "/templates/inter.csv",
  },
  {
    slug: "avenue",
    name: "Avenue Securities",
    kind: "brokerage",
    provider: "manual",
    logoUrl: "/logos/avenue.svg",
    templateUrl: "/templates/avenue.csv",
  },
  {
    slug: "binance",
    name: "Binance",
    kind: "crypto",
    provider: "manual",
    logoUrl: "/logos/binance.svg",
    templateUrl: "/templates/binance.csv",
  },
];

async function main() {
  console.log("[seed-brokers] Iniciando seed de corretoras...");

  // ON CONFLICT (slug) DO NOTHING — idempotente.
  for (const broker of BROKERS) {
    await db.insert(brokersTable).values(broker).onConflictDoNothing({ target: brokersTable.slug });
    console.log(`  - ${broker.slug.padEnd(10)} ${broker.name}`);
  }

  const count = await db.execute(sql`SELECT COUNT(*)::int AS total FROM brokers`);
  const total = (count[0] as { total: number } | undefined)?.total ?? 0;
  console.log(`[seed-brokers] OK — ${total} corretoras no catalogo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-brokers] FALHOU:", err);
  process.exit(1);
});
