// scripts/test-indicator.ts
// Teste da cascata de indicadores BR (indicator)
// Roda com: npx tsx scripts/test-indicator.ts 433

import "dotenv/config";
import { getProviderRegistry, registerProviders } from "../lib/providers";
import type { IndicatorInput, IndicatorOutput } from "../lib/providers/adapters/bc-sgs";

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  // Indicadores comuns (SGS): 11=Selic, 432=IPCA mensal, 433=IPCA 12m, 188=Meta Selic
  const code = Number.parseInt(process.argv[2] ?? "433", 10);
  const last = Number.parseInt(process.argv[3] ?? "6", 10);
  console.log(
    `\nðŸ“Š Buscando indicador SGS cÃ³digo ${code} (Ãºltimos ${last}) via cascata (indicator)...\n`
  );

  const start = Date.now();
  const result = await registry.fetch<IndicatorInput, IndicatorOutput>("indicator", { code, last });
  const total = Date.now() - start;

  console.log("âœ… Sucesso:");
  console.log(`   Provider: ${result.provider}`);
  console.log(`   Nome:     ${result.data.name}`);
  console.log(`   Unidade:  ${result.data.unit}`);
  console.log(`   Pontos:   ${result.data.series.length}`);
  console.log("   Ãšltimos valores:");
  for (const p of result.data.series.slice(-6)) {
    console.log(`     ${p.date}  â†’  ${p.value.toFixed(4)}`);
  }
  console.log(`   LatÃªncia: ${result.latencyMs}ms (total ${total}ms)\n`);
}

main().catch((err) => {
  console.error("âŒ Erro:", err.message);
  process.exit(1);
});
