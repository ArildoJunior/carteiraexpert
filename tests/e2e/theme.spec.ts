import { expect, test } from "@playwright/test";

test.describe("Tema claro/escuro", () => {
  test("toggle para escuro aplica classe .dark no html", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /alternar tema/i }).click();
    await page.getByRole("menuitem", { name: /escuro/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("tema persiste após reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /alternar tema/i }).click();
    await page.getByRole("menuitem", { name: /escuro/i }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("/dev/components renderiza em ambos os temas", async ({ page }) => {
    await page.goto("/dev/components");
    await expect(page.getByRole("heading", { name: /design system/i })).toBeVisible();
    await page.getByRole("button", { name: /alternar tema/i }).click();
    await page.getByRole("menuitem", { name: /escuro/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: /design system/i })).toBeVisible();
  });
});
