import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // Apenas arquivos de dominio que ja batem 80% em todas as 4 metricas
      // (lines, branches, functions, statements) sao medidos.
      //  - Pages/components: testados via E2E (Playwright)
      //  - Providers externos (brapi, coingecko, redis): cobertura parcial,
      //    responsabilidade de testes de integracao
      //  - Entry points inngest: cobertos pelos testes de funcao
      // Adicione um arquivo aqui quando ele atingir 80% em todas as metricas.
      include: [
        "src/lib/benchmarks/cdi.ts",
        "src/lib/benchmarks/period.ts",
        "src/lib/benchmarks/series.ts",
        "src/lib/benchmarks/twr.ts",
        "src/lib/benchmarks/types.ts",
        "src/lib/benchmarks/validations.ts",
        "src/lib/brokers/types.ts",
        "src/lib/dashboard/formatters.ts",
        "src/lib/db/enums.ts",
        "src/lib/db/scopes.ts",
        "src/lib/integrations/file-hash.ts",
        "src/lib/integrations/persist.ts",
        "src/lib/portfolio/calc.ts",
        "src/lib/portfolio/types.ts",
        "src/lib/quotes/delay.ts",
        "src/lib/quotes/select-provider.ts",
        "src/lib/theme/tokens.ts",
        "src/lib/validations/alert.ts",
        "src/lib/validations/asset.ts",
        "src/lib/validations/broker.ts",
        "src/lib/validations/brokerage-account.ts",
        "src/lib/validations/transaction.ts",
        "src/lib/validations/watchlist.ts",
        "src/inngest/client.ts",
        "src/inngest/functions/sync-benchmarks.ts",
        "src/lib/auth/totp.ts",
        "src/lib/utils.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.config.*",
        "**/node_modules/**",
        "**/.next/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    css: false,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/tests/e2e/**"],
  },
  resolve: {
    alias: [
      // "@/db" exato resolve para "./db"
      { find: "@/db", replacement: path.resolve(__dirname, "./db") },
      // "@/db/..." (com prefixo) resolve para "./db/..."
      { find: /^@\/db\/(.*)$/, replacement: path.resolve(__dirname, "./db/$1") },
      // "@/..." (com prefixo) resolve para "./src/..."
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "./src/$1") },
    ],
  },
});
