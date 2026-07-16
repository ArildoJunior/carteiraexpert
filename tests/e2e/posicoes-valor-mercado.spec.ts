import { expect, test } from "@playwright/test";

const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL ?? "demo@carteiraexpert.com";
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "senhademo123segura";

test.describe("posicoes - valor de mercado (Cap 6)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-mail/i).fill(DEMO_EMAIL);
    await page.getByLabel(/senha/i).fill(DEMO_PASSWORD);
    await page
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    await page.waitForURL(/\/app/);
  });

  test("renderiza a pagina /app/posicoes com heading e cotacoes", async ({ page }) => {
    await page.goto("/app/posicoes");
    // Heading principal aparece apos o auth + render server-side
    await expect(page.getByRole("heading", { name: "Posicoes" })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    // A coluna Cotacao ou a frase "Sem cotacao" deve estar presente
    // (fan-out de 5+ tickers: alguns vem com preco, outros sem provider)
    await expect(
      main.getByText(/Cotacao|Valor de mercado|Sem cotacao|Nova posicao/i).first()
    ).toBeVisible();
  });
});
