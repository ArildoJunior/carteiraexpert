// scripts/test-quote-global.ts
// Teste da cascata de cotações globais (quote_global)
// Roda com: npx tsx scripts/test-quote-global.ts VOD.L

import "dotenv/config";
import { getProviderRegistry, registerProviders } from "../lib/providers";
import type { GlobalQuoteInput, GlobalQuoteOutput } from "../lib/providers/adapters/yahoo-finance";

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const ticker = process.argv[2] ?? "VOD.L";
  console.log(`\n🔍 Buscando ${ticker} via cascata de provedores (quote_global)...\n`);

  const start = Date.now();
  const result = await registry.fetch<GlobalQuoteInput, GlobalQuoteOutput>("quote_global", {
    ticker,
  });
  const total = Date.now() - start;

  console.log("✅ Sucesso:");
  console.log(`   Provider: ${result.provider}`);
  console.log(`   Ticker:   ${result.data.ticker}`);
  console.log(`   Mercado:  ${result.data.market}`);
  console.log(`   Preço:    ${result.data.price.toFixed(2)} ${result.data.currency}`);
  console.log(`   Latência: ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
