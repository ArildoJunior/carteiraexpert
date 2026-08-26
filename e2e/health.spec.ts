import { test, expect } from '@playwright/test';

test('should load the home page and display title and hero header', async ({ page }) => {
  await page.goto('/'); // Navega para a Landing Page pública institucional
  await expect(page).toHaveTitle(/CarteiraExpert/);
  await expect(page.locator('h1')).toContainText('Gestão Patrimonial');
  await expect(page.locator('#btn-hero-catalog')).toBeVisible();
});