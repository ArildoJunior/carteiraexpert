import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "demo@carteiraexpert.com";
const DEMO_PASSWORD = "senhademo123segura";

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(DEMO_EMAIL);
  await page.getByLabel(/senha/i).fill(DEMO_PASSWORD);
  await page
    .getByRole("button", { name: /entrar/i })
    .first()
    .click();
  await page.waitForURL(/\/app/);
}

test.describe("Cap 5 Ã¢â‚¬â€ Fluxo de Portfolio", () => {
  test.describe.configure({ mode: "serial" });

  const suffix = Date.now().toString().slice(-6);
  const accountName = `E2E Conta ${suffix}`;
  const ticker = "PETR4";

  test("dashboard /app/carteira carrega com cards de resumo", async ({ page }) => {
    await login(page);
    await page.goto("/app/carteira");
    await expect(page.getByRole("heading", { name: "Carteira" })).toBeVisible();
    const main = page.getByRole("main");
    const cardTitles = main.locator('[data-slot="card-title"]');
    await expect(main.getByText("Patrimonio", { exact: true })).toBeVisible();
    await expect(main.getByText("Posicoes", { exact: true })).toBeVisible();
    await expect(main.getByText("Contas", { exact: true })).toBeVisible();
    await expect(main.getByText("Classes", { exact: true })).toBeVisible();
  });

  test("lista de contas mostra empty state quando vazia", async ({ page }) => {
    await login(page);
    await page.goto("/app/contas");
    await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
    await expect(page.getByRole("link", { name: /nova conta/i }).first()).toBeVisible();
  });

  test("criar conta via UI: aparece em /app/contas", async ({ page }) => {
    await login(page);
    await page.goto("/app/contas/nova");
    await page.getByLabel(/nome da conta/i).fill(accountName);
    await page.getByRole("button", { name: /criar conta/i }).click();
    await page.waitForURL(/\/app\/contas/);
    await expect(page.getByText(accountName).first()).toBeVisible();
  });

  test("criar posicao via UI: aparece em /app/posicoes", async ({ page }) => {
    await login(page);
    await page.goto("/app/posicoes/nova");
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    const assetSelect = page.getByRole("combobox").nth(2);
    await assetSelect.click();
    await page
      .getByRole("option", { name: new RegExp(ticker, "i") })
      .first()
      .click();
    await page.getByLabel(/quantidade/i).fill("100");
    await page.getByLabel(/preco unitario/i).fill("38.50");
    await page.getByRole("button", { name: /registrar/i }).click();
    await page.waitForURL(/\/app\/posicoes/);
    await expect(page.getByText(ticker).first()).toBeVisible();
  });

  test("detalhe da posicao mostra cards e tabela de movimentacoes", async ({ page }) => {
    await login(page);
    await page.goto("/app/posicoes");
    // FIX: :not([href$='/nova']) exclui o botao "Nova posicao" do header
    // da pagina (que tem href="/app/posicoes/nova" e fica dentro do <main>).
    // Sobra apenas o link do ticker na tabela -> /app/posicoes/<uuid>.
    const positionLink = page
      .getByRole("main")
      .locator("a[href^='/app/posicoes/']:not([href$='/nova'])")
      .first();
    await expect(positionLink).toBeVisible({ timeout: 10000 });
    await positionLink.click();
    await page.waitForURL(/\/app\/posicoes\/[0-9a-f-]+$/);
    const main = page.getByRole("main");
    const cardTitles = main.locator('[data-slot="card-title"]');
    await expect(cardTitles.filter({ hasText: "Quantidade" })).toBeVisible();
    await expect(cardTitles.filter({ hasText: "Custo medio" })).toBeVisible();
    await expect(cardTitles.filter({ hasText: "Total investido" })).toBeVisible();
    await expect(cardTitles.filter({ hasText: "Movimentacoes" })).toBeVisible();
  });

  test("excluir conta via UI: confirmacao + conta some", async ({ page }) => {
    await login(page);
    await page.goto("/app/contas");
    const card = page.locator("[data-slot='card']").filter({ hasText: accountName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator("a[href^='/app/contas/']").first().click();
    await page.waitForURL(/\/app\/contas\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: /excluir conta/i }).click();
    await page.getByRole("button", { name: /^excluir$/i }).click();
    await page.waitForURL(/\/app\/contas/);
    await expect(page.getByText(accountName)).not.toBeVisible();
  });
});
