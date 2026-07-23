// scripts/debug-brapi-dividends.ts
// Diagnóstico do que o Brapi retorna com ?dividends=true
// Roda com: npx tsx scripts/debug-brapi-dividends.ts PETR4

import "dotenv/config";

const TICKER = (process.argv[2] ?? "PETR4").toUpperCase();
const TOKEN = process.env.BRAPI_TOKEN;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

async function probe(label: string, url: string) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(`URL: ${url.replace(TOKEN ?? "", "<TOKEN>")}`);
  try {
    const r = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    console.log(`Status: ${r.status}`);
    console.log("Body (primeiros 1500 chars):");
    console.log(text.slice(0, 1500));
  } catch (err) {
    console.log(`Erro: ${(err as Error).message}`);
  }
}

async function main() {
  // Formato 1: ?dividends=true (atual)
  await probe(
    "FORMATO 1: ?dividends=true",
    `https://brapi.dev/api/quote/${TICKER}?dividends=true&token=${TOKEN}`
  );

  // Formato 2: ?dividends=true&range=1y
  await probe(
    "FORMATO 2: ?dividends=true&range=1y",
    `https://brapi.dev/api/quote/${TICKER}?dividends=true&range=1y&token=${TOKEN}`
  );

  // Formato 3: /quote/list?dividends=true
  await probe(
    "FORMATO 3: /quote/list?dividends=true",
    `https://brapi.dev/api/quote/list?dividends=true&token=${TOKEN}&search=${TICKER}`
  );
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
