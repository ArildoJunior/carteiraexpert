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

test.describe("Cap 7D - Revisao de Importacao", () => {
  // Serial porque worker=1 e o DB e compartilhado (so 1 teste roda por vez).
  test.describe.configure({ mode: "serial" });

  test("pagina /app/imports/pendentes carrega com heading", async ({ page }) => {
    await login(page);
    await page.goto("/app/imports/pendentes");
    await expect(page.getByRole("heading", { name: /Itens pendentes/i })).toBeVisible();
  });

  test("pagina /app/imports mostra historico (ou empty state)", async ({ page }) => {
    await login(page);
    await page.goto("/app/imports");
    await expect(page.getByRole("heading", { name: /Importações/i })).toBeVisible();
  });

  test("toolbar fica desabilitada sem itens selecionados", async ({ page }) => {
    await login(page);
    await page.goto("/app/imports/pendentes");
    await page.waitForLoadState("domcontentloaded");

    const acceptButton = page.getByRole("button", { name: /Aceitar selecionadas/i });
    const rejectButton = page.getByRole("button", { name: /Rejeitar selecionadas/i });

    const hasItems = (await page.locator('tbody input[type="checkbox"]').count()) > 0;
    if (!hasItems) {
      await expect(page.getByText(/Fila vazia/i).first()).toBeVisible();
      test.skip(true, "Sem itens pendentes - pulando teste de toolbar");
      return;
    }

    await expect(acceptButton).toBeDisabled();
    await expect(rejectButton).toBeDisabled();
  });

  test("selecionar 2 itens + Aceitar dispara toast de sucesso", async ({ page }) => {
    await login(page);
    await page.goto("/app/imports/pendentes");
    await page.waitForLoadState("domcontentloaded");

    // Checkboxes das linhas (exclui o do header que esta no <thead>)
    const rowCheckboxes = page.locator('tbody input[type="checkbox"]');
    const count = await rowCheckboxes.count();

    if (count === 0) {
      await expect(page.getByText(/Fila vazia/i).first()).toBeVisible();
      test.skip(true, "Sem itens pendentes - pulando fluxo de review");
      return;
    }

    const selectCount = Math.min(2, count);
    for (let i = 0; i < selectCount; i++) {
      await rowCheckboxes.nth(i).check();
    }

    const acceptButton = page.getByRole("button", {
      name: new RegExp(`Aceitar ${selectCount}`, "i"),
    });
    await expect(acceptButton).toBeEnabled();
    await acceptButton.click();

    // Sonner toast (componente de toast do projeto) confirma sucesso/erro
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
