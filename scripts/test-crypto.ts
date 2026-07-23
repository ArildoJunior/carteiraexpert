// scripts/test-crypto.ts
// Teste da cascata de cotações cripto (crypto)
// Roda com: npx tsx scripts/test-crypto.ts BTC

import "dotenv/config";
import { getProviderRegistry, registerProviders } from "../lib/providers";
import type { CryptoQuoteInput, CryptoQuoteOutput } from "../lib/providers/adapters/coingecko";

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const symbol = process.argv[2] ?? "BTC";
  console.log(`\n🔍 Buscando ${symbol} via cascata de provedores (crypto)...\n`);

  const start = Date.now();
  const result = await registry.fetch<CryptoQuoteInput, CryptoQuoteOutput>("crypto", { symbol });
  const total = Date.now() - start;

  console.log("✅ Sucesso:");
  console.log(`   Provider: ${result.provider}`);
  console.log(`   Symbol:   ${result.data.symbol}`);
  console.log(`   Preço:    US$ ${result.data.price.toFixed(2)}`);
  console.log(`   24h:      ${result.data.changePercent24h.toFixed(2)}%`);
  console.log(`   Latência: ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
