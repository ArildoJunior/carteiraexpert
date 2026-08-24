import { test, expect } from '@playwright/test';

test.describe('E2E: Planos Comerciais e Quotas de Carteiras (Pacote 05.01)', () => {
  const userEmail = `e2e-plans-user-${Date.now()}@test.com`;

  test('deve respeitar a quota do Plano Free (máximo 2 carteiras ativas) na interface', async ({
    page,
  }) => {
    // 1. Cadastro de novo usuário
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Free');
    await page.fill('#register-email', userEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // 2. Navega para Minhas Carteiras
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await expect(page.locator('h1')).toContainText('Minhas Carteiras');

    // 3. Verifica badge de quota inicial (0/2 ativas)
    const quotaBadge = page.locator('#plan-quota-badge');
    await expect(quotaBadge).toBeVisible();
    await expect(quotaBadge).toContainText('Plano Free: 0/2 ativas');

    // 4. Criação da 1ª carteira
    await page.click('#create-first-portfolio-btn');
    await expect(page.locator('#portfolio-modal-title')).toBeVisible();
    await page.fill('#portfolio-name', 'Carteira Free 1');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Free 1')).toBeVisible();
    await expect(quotaBadge).toContainText('Plano Free: 1/2 ativas');

    // 5. Criação da 2ª carteira
    await page.click('#btn-create-portfolio');
    await expect(page.locator('#portfolio-modal-title')).toBeVisible();
    await page.fill('#portfolio-name', 'Carteira Free 2');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Free 2')).toBeVisible();
    await expect(quotaBadge).toContainText('Plano Free: 2/2 ativas');

    // 6. Botão + Nova Carteira deve ficar desabilitado após atingir o limite
    const createBtn = page.locator('#btn-create-portfolio');
    await expect(createBtn).toBeDisabled();

    // 7. Acessa uma carteira e confirma que detalhes carregam normalmente
    await page.click('text=Carteira Free 1');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);
    await expect(page.locator('#portfolio-title')).toContainText('Carteira Free 1');
    await expect(page.locator('#btn-new-transaction')).toBeEnabled();
  });
});
