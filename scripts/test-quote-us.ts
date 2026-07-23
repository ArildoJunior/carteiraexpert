// scripts/test-quote-us.ts
// Teste da cascata de cotações EUA (quote_us)
// Roda com: npx tsx scripts/test-quote-us.ts AAPL

import 'dotenv/config';
import { registerProviders, getProviderRegistry } from '../lib/providers';
import type { FinnhubQuoteInput, FinnhubQuoteOutput } from '../lib/providers/adapters/finnhub';

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const ticker = process.argv[2] ?? 'AAPL';
  console.log(`\n🔍 Buscando ${ticker} via cascata de provedores (quote_us)...\n`);

  const start = Date.now();
  const result = await registry.fetch<FinnhubQuoteInput, FinnhubQuoteOutput>('quote_us', { symbol: ticker });
  const data = result.data as { symbol: string; price: number; changePercent: number };
  const total = Date.now() - start;

  console.log('✅ Sucesso:');
  console.log(`   Provider: ${result.provider}`);
  console.log(`   Ticker:   ${data.symbol}`);
  console.log(`   Preço:    US$ ${data.price.toFixed(2)}`);
  console.log(`   Variação: ${data.changePercent.toFixed(2)}%`);
  console.log(`   Latência: ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});