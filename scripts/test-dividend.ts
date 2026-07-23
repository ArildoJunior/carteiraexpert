// scripts/test-dividend.ts
// Teste da cascata de dividendos
// Roda com: npx tsx scripts/test-dividend.ts PETR4      (BR via Brapi)
// Roda com: npx tsx scripts/test-dividend.ts AAPL       (US via SEC)

import "dotenv/config";
import { getProviderRegistry, registerProviders } from "../lib/providers";
import type {
  DividendInput as BrDividendInput,
  DividendOutput as BrDividendOutput,
} from "../lib/providers/adapters/dividend-br";
import type {
  DividendInput as UsDividendInput,
  DividendOutput as UsDividendOutput,
} from "../lib/providers/adapters/dividend-us";

type Registry = ReturnType<typeof getProviderRegistry>;

async function fetchBR(registry: Registry, symbol: string): Promise<void> {
  const start = Date.now();
  const result = await registry.fetch<BrDividendInput, BrDividendOutput>("dividend_br", {
    ticker: symbol,
  });
  const total = Date.now() - start;

  console.log("Provider:", result.provider);
  console.log(`Latencia: ${result.latencyMs}ms (total ${total}ms)`);
  console.log(`Dividendos: ${result.data.dividends.length} encontrados`);
  for (const d of result.data.dividends.slice(0, 10)) {
    const val = d.value.toFixed(2);
    console.log(`     ${d.date}  ->  R$ ${val} (${d.type})`);
  }
}

async function fetchUS(registry: Registry, symbol: string): Promise<void> {
  const start = Date.now();
  const result = await registry.fetch<UsDividendInput, UsDividendOutput>("dividend_us", {
    ticker: symbol,
  });
  const total = Date.now() - start;

  console.log("Provider:", result.provider);
  console.log(`CIK:        ${result.data.cik}`);
  console.log(`Empresa:    ${result.data.companyName}`);
  console.log(`Latencia: ${result.latencyMs}ms (total ${total}ms)`);
  console.log(`Dividendos: ${result.data.dividends.length} encontrados`);
  for (const d of result.data.dividends.slice(0, 10)) {
    const val = d.value.toFixed(2);
    console.log(`     ${d.date}  ->  US$ ${val} (${d.form})`);
  }
}

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const symbol = (process.argv[2] ?? "PETR4").toUpperCase();
  const isUS =
    /^[A-Z]+$/.test(symbol) &&
    !symbol.endsWith("34") &&
    !symbol.endsWith("11") &&
    symbol.length <= 5;
  const category = isUS ? "dividend_us" : "dividend_br";

  console.log("");
  console.log(`Buscando dividendos de ${symbol} via cascata (${category})...`);
  console.log("");

  if (isUS) {
    await fetchUS(registry, symbol);
  } else {
    await fetchBR(registry, symbol);
  }
  console.log("");
}

main().catch((err) => {
  console.error("Erro:", (err as Error).message);
  process.exit(1);
});
