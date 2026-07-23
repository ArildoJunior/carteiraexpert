// scripts/test-fx.ts
// Teste da cascata de cÃ¢mbio (fx)
// Roda com: npx tsx scripts/test-fx.ts USD BRL

import 'dotenv/config';
import { registerProviders, getProviderRegistry } from '../lib/providers';
import type { FxQuoteInput, FxQuoteOutput } from '../lib/providers/adapters/bc-ptax';

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const from = (process.argv[2] ?? 'USD').toUpperCase();
  const to = (process.argv[3] ?? 'BRL').toUpperCase();
  console.log(`\nðŸ’± Buscando cÃ¢mbio ${from}/${to} via cascata (fx)...\n`);

  const start = Date.now();
  const result = await registry.fetch<FxQuoteInput, FxQuoteOutput>('fx', { from: from as FxQuoteInput['from'], to: to as FxQuoteInput['to'] });
  const total = Date.now() - start;

  console.log('âœ… Sucesso:');
  console.log(`   Provider:  ${result.provider}`);
  console.log(`   Par:       ${result.data.from} â†’ ${result.data.to}`);
  console.log(`   Mid:       ${result.data.mid.toFixed(4)}`);
  if ('bid' in result.data) {
    console.log(`   Compra:    ${result.data.bid.toFixed(4)}`);
    console.log(`   Venda:     ${result.data.ask.toFixed(4)}`);
  }
  if ('date' in result.data) {
    console.log(`   Data:      ${result.data.date}`);
  } else if ('timestamp' in result.data) {
    console.log(`   Timestamp: ${result.data.timestamp}`);
  }
  console.log(`   LatÃªncia:  ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error('âŒ Erro:', err.message);
  process.exit(1);
});