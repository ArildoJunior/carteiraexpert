import { test, expect } from '@playwright/test';

test('should load the home page and display title and login header', async ({ page }) => {
  await page.goto('/'); // Navega para a URL base (redireciona para /login quando não autenticado)
  await expect(page).toHaveTitle(/CarteiraExpert/); // Verifica se o título da página contém "CarteiraExpert"
  await expect(page.locator('h1')).toContainText('Bem-vindo de volta'); // Verifica se exibe o cabeçalho de login
});