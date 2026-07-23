// scripts/test-brapi.ts
// Teste rÃƒÂ¡pido do BrapiAdapter + ProviderRegistry + log
// Roda com: npx tsx scripts/test-brapi.ts

import 'dotenv/config';
import { registerProviders, getProviderRegistry } from '../lib/providers';
import type { BrapiQuoteInput, BrapiQuoteOutput } from '../lib/providers/adapters/brapi';

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const ticker = process.argv[2] ?? 'PETR4';
  console.log(`\nÃ°Å¸â€Â Buscando ${ticker} via cascata de provedores (quote_br)...\n`);

  const start = Date.now();
  const result = await registry.fetch<BrapiQuoteInput, BrapiQuoteOutput>('quote_br', { ticker });
  const total = Date.now() - start;

  console.log('Ã¢Å“â€¦ Sucesso:');
  console.log(`   Provider: ${result.provider}`);
  console.log(`   Ticker:   ${result.data.ticker}`);
  console.log(`   PreÃƒÂ§o:    R$ ${result.data.price.toFixed(2)}`);
  console.log(`   VariaÃƒÂ§ÃƒÂ£o: ${result.data.changePercent.toFixed(2)}%`);
  console.log(`   LatÃƒÂªncia: ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error('Ã¢ÂÅ’ Erro:', err.message);
  process.exit(1);
});