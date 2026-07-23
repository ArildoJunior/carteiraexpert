// scripts/test-fundamental.ts
// Teste da cascata de fundamentos US (fundamental_us)
// Roda com: npx tsx scripts/test-fundamental.ts AAPL

import "dotenv/config";
import { getProviderRegistry, registerProviders } from "../lib/providers";
import type { FundamentalInput, FundamentalOutput } from "../lib/providers/adapters/sec-edgar";

async function main() {
  registerProviders();
  const registry = getProviderRegistry();

  const symbol = (process.argv[2] ?? "AAPL").toUpperCase();
  console.log(`\nÃ°Å¸ÂÂ¢ Buscando fundamentos de ${symbol} via cascata (fundamental_us)...\n`);

  const start = Date.now();
  const result = await registry.fetch<FundamentalInput, FundamentalOutput>("fundamental_us", {
    symbol,
  });
  const total = Date.now() - start;

  console.log("Ã¢Å“â€¦ Sucesso:");
  console.log(`   Provider: ${result.provider}`);
  console.log(`   LatÃƒÂªncia: ${result.latencyMs}ms (total ${total}ms)`);

  if ("metrics" in result.data) {
    // Finnhub: pega 8 mÃƒÂ©tricas principais
    const m = result.data.metrics as Record<string, number | null | undefined>;
    console.log(`   SÃƒÂ­mbolo:  ${result.data.symbol}`);
    const keys = [
      "peBasicExtraTTM",
      "peNormalizedAnnual",
      "pbAnnual",
      "epsBasicExtraTTM",
      "dividendYieldIndicatedAnnual",
      "roeTTM",
      "marketCapitalization",
      "beta",
    ];
    for (const k of keys) {
      if (m[k] !== null && m[k] !== undefined) {
        console.log(`     ${k.padEnd(36)}: ${m[k]}`);
      }
    }
  } else if ("filings" in result.data) {
    // SEC Edgar
    console.log(`   CIK:        ${result.data.cik}`);
    console.log(`   Empresa:    ${result.data.companyName}`);
    console.log(`   Filings:    ${result.data.filings.length} encontrados`);
    for (const f of result.data.filings) {
      console.log(`     ${f.form}  filed=${f.filedAt}  period=${f.periodOfReport ?? "-"}`);
    }
  } else if ("profile" in result.data) {
    // FMP
    const p = (
      result.data as {
        profile: {
          companyName: string;
          sector: string;
          industry: string;
          exchange: string;
          country: string;
          marketCap: number;
          currency: string;
          ceo: string;
          beta: number;
        };
      }
    ).profile;
    console.log(`   Empresa:    ${p.companyName}`);
    console.log(`   Setor:      ${p.sector} / ${p.industry}`);
    console.log(`   Exchange:   ${p.exchange}  (${p.country})`);
    console.log(`   Market Cap: ${p.marketCap.toLocaleString("en-US")} ${p.currency}`);
    console.log(`   CEO:        ${p.ceo}`);
    console.log(`   Beta:       ${p.beta}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Ã¢ÂÅ’ Erro:", err.message);
  process.exit(1);
});
