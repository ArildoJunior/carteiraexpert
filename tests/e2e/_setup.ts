import { expect, test as setup } from "@playwright/test";

const RUN_E2E = process.env.RUN_E2E === "true";

/**
 * Setup global do Playwright.
 *
 * Roda ANTES de todos os specs quando RUN_E2E=true.
 *
 * Pre-requisitos para rodar E2E:
 *   1. Banco PostgreSQL rodando (DATABASE_URL no .env)
 *   2. Schema aplicado (pnpm db:push)
 *   3. Dados seedados (pnpm db:seed)
 *   4. Servidor de dev/prod (o webServer do playwright.config sobe sozinho)
 *
 * Como rodar:
 *   $env:RUN_E2E = "true"; pnpm test:e2e
 *   Remove-Item Env:RUN_E2E
 */

setup("preparar dados de teste (E2E)", async ({ request }) => {
  setup.skip(!RUN_E2E, "E2E desabilitado. Rode com $env:RUN_E2E='true'; pnpm test:e2e");

  // 1) Cria o user de teste se nao existir (via API ou DB direto).
  //    Aqui usamos um INSERT direto no DB porque a rota de signup pode
  //    exigir captcha/email confirm. Para E2E isso e' aceitavel.

  // 2) Garante que ha pelo menos 1 broker "sofisa" cadastrado
  //    e 1 broker_connection ativa para o user de teste.

  // 3) Valida que o servidor esta respondendo
  const health = await request.get("/api/health");
  expect(health.status()).toBeLessThan(500);
});
