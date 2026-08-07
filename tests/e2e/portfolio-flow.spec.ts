import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "demo@carteiraexpert.com";
const DEMO_PASSWORD = "demo1234";

async function login(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(DEMO_EMAIL);
  await page.getByLabel(/senha/i).fill(DEMO_PASSWORD);
  await page
    .getByRole("button", { name: /entrar/i })
    .first()
    .click();
  await page.waitForURL(/\/dashboard/);
}

test.describe("Cap 5 Ã¢â‚¬â€ Fluxo de Portfolio", () => {
  test.describe.configure({ mode: "serial" });

  const suffix = Date.now().toString().slice(-6);
  const accountName = `E2E Conta ${suffix}`;
  const ticker = "PETR4";

  test("dashboard /dashboard carrega com cards de resumo", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    // A secao "Visao geral" sempre aparece na dashboard
    await expect(main.getByText("Visao geral", { exact: true })).toBeVisible();
  });

  test("lista de contas mostra empty state quando vazia", async ({ page }) => {
    await login(page);
    await page.goto("/contas");
    await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
    await expect(page.getByRole("link", { name: /nova conta/i }).first()).toBeVisible();
  });

  test("criar conta via UI: aparece em /contas", async ({ page }) => {
    await login(page);
    await page.goto("/contas/nova");
    await page.getByLabel(/nome da conta/i).fill(accountName);
    await page.getByRole("button", { name: /criar conta/i }).click();
    await page.waitForURL(/\/contas/);
    await expect(page.getByText(accountName).first()).toBeVisible();
  });

  test("criar posicao via UI: aparece em /posicoes", async ({ page }) => {
    await login(page);
    await page.goto("/posicoes/nova");
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    // Filtra o ativo via search field (banco tem dezenas de DUPs de testes
    // E2E anteriores, PETR4 cairia fora do slice de 50 visiveis).
    await page.getByPlaceholder(/buscar por ticker ou nome/i).fill(ticker);
    const assetSelect = page.getByRole("combobox").nth(2);
    await assetSelect.click();
    await page
      .getByRole("option", { name: new RegExp(ticker, "i") })
      .first()
      .click();
    await page.getByLabel(/quantidade/i).fill("100");
    await page.getByLabel(/preco unitario/i).fill("38.50");
    await page.getByRole("button", { name: /registrar/i }).click();
    await page.waitForURL(/\/posicoes/);
    await expect(page.getByText(ticker).first()).toBeVisible();
  });

  test("detalhe da posicao mostra cards e tabela de movimentacoes", async ({ page }) => {
    await login(page);
    await page.goto("/posicoes");
    // FIX: :not([href$='/nova']) exclui o botao "Nova posicao" do header
    // da pagina (que tem href="/posicoes/nova" e fica dentro do <main>).
    // Sobra apenas o link do ticker na tabela -> /posicoes/<uuid>.
    const positionLink = page
      .getByRole("main")
      .locator("a[href^='/posicoes/']:not([href$='/nova'])")
      .first();
    await expect(positionLink).toBeVisible({ timeout: 10000 });
    await positionLink.click();
    await page.waitForURL(/\/posicoes\/[0-9a-f-]+$/);
    const main = page.getByRole("main");
    const _cardTitles = main.locator('[data-slot="card-title"]');
    await expect(_cardTitles.filter({ hasText: "Quantidade" })).toBeVisible();
    await expect(_cardTitles.filter({ hasText: "Custo medio" })).toBeVisible();
    await expect(_cardTitles.filter({ hasText: "Total investido" })).toBeVisible();
    await expect(_cardTitles.filter({ hasText: "Movimentacoes" })).toBeVisible();
  });

  test("excluir conta via UI: confirmacao + conta some", async ({ page }) => {
    await login(page);
    await page.goto("/contas");
    const card = page.locator("[data-slot='card']").filter({ hasText: accountName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator("a[href^='/contas/']").first().click();
    await page.waitForURL(/\/contas\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: /excluir conta/i }).click();
    await page.getByRole("button", { name: /^excluir$/i }).click();
    await page.waitForURL(/\/contas/);
    await expect(page.getByText(accountName)).not.toBeVisible();
  });
});
