import { benchmarksHistory } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";

interface YahooQuote {
  chart: { result: Array<{ meta: { regularMarketPrice: number } }> };
}
interface BcbCdiEntry {
  data: string;
  valor: string;
}

async function fetchYahooClose(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as YahooQuote;
  const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" ? price : null;
}

async function fetchBcbCdi(): Promise<{ date: string; rate: number } | null> {
  const url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const arr = (await res.json()) as BcbCdiEntry[];
  const last = arr?.[0];
  if (!last) return null;
  const [dd, mm, yyyy] = last.data.split("/");
  if (!dd || !mm || !yyyy) return null;
  const iso = `${yyyy}-${mm}-${dd}`;
  const rate = Number(last.valor.replace(",", ".")) / 100;
  if (!Number.isFinite(rate)) return null;
  return { date: iso, rate };
}

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

export const syncBenchmarks = inngest.createFunction(
  {
    id: "sync-benchmarks",
    name: "Sync benchmarks (IBOV, IFIX, CDI)",
    triggers: [{ cron: "0 22 * * *", tz: "America/Sao_Paulo" }],
  },
  async ({ step }: { step: Step }) => {
    const ibov = await step.run("fetch-ibov", async () => fetchYahooClose("^BVSP"));
    const ifix = await step.run("fetch-ifix", async () => fetchYahooClose("^IFIX"));
    const cdi = await step.run("fetch-cdi", async () => fetchBcbCdi());

    const today = new Date().toISOString().slice(0, 10);
    const rows: Array<typeof benchmarksHistory.$inferInsert> = [];
    if (typeof ibov === "number")
      rows.push({ benchmark: "IBOV", date: today, value: String(ibov), source: "yahoo" });
    if (typeof ifix === "number")
      rows.push({ benchmark: "IFIX", date: today, value: String(ifix), source: "yahoo" });
    if (cdi)
      rows.push({ benchmark: "CDI", date: cdi.date, value: String(cdi.rate), source: "bcb" });

    if (rows.length > 0) {
      await step.run("persist", async () => {
        await db.insert(benchmarksHistory).values(rows).onConflictDoNothing();
      });
    }
    await step.run("revalidate", async () => {
      revalidateTag("dashboard", "default");
    });
    return { saved: rows.length, ibov, ifix, cdi };
  }
);
