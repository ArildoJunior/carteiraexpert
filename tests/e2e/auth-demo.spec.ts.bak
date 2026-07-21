import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "demo@carteiraexpert.com";
const DEMO_PASSWORD = "senhademo123segura";

test.describe("Auth com usuario demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("login com usuario demo funciona e sessao persiste", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-mail/i).fill(DEMO_EMAIL);
    await page.getByLabel(/senha/i).fill(DEMO_PASSWORD);
    await page
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    await page.waitForURL(/\/app/);
    expect(page.url()).toMatch(/\/app/);

    // reload mantem sessao
    await page.reload();
    expect(page.url()).toMatch(/\/app/);
  });

  test("sessao tem cookie valido apos login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/e-mail/i).fill(DEMO_EMAIL);
    await page.getByLabel(/senha/i).fill(DEMO_PASSWORD);
    await page
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    await page.waitForURL(/\/app/);

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes("session-token"));
    expect(sessionCookie).toBeDefined();
  });

  test("navegacao para area protegida sem login redireciona", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});
