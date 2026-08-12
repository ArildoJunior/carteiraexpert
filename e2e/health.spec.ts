import { test, expect } from '@playwright/test';

test('should load the home page and display a title', async ({ page }) => {
  await page.goto('/'); // Navega para a URL base configurada
  await expect(page).toHaveTitle(/CarteiraExpert/); // Verifica se o título da página contém "CarteiraExpert"
  // Altere a linha abaixo:
  await expect(page.locator('h1')).toContainText('To get started, edit the page.tsx file.'); // Verifica se existe um h1 com o texto atual
});