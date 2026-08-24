import { test, expect } from '@playwright/test';

test.describe('E2E: Experiência Comercial de Planos (Pacote 05.03)', () => {
  const userEmail = `e2e-plans-view-${Date.now()}@test.com`;

  test('deve navegar até /plans, exibir quotas, planos e ausência de checkout funcional', async ({
    page,
  }) => {
    // 1. Cadastro de novo usuário
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Comercial');
    await page.fill('#register-email', userEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // 2. Navegação via link da navbar (#nav-link-plans)
    const plansNavLink = page.locator('#nav-link-plans');
    await expect(plansNavLink).toBeVisible();
    await plansNavLink.click();

    await page.waitForURL('**/plans');
    await expect(page.locator('h1')).toContainText('Planos e Quotas Comerciais');

    // 3. Verificação do badge de plano efetivo e status
    const effectiveBadge = page.locator('#effective-plan-badge');
    await expect(effectiveBadge).toBeVisible();
    await expect(effectiveBadge).toContainText('Plano Free');

    const statusTag = page.locator('#subscription-status-tag');
    await expect(statusTag).toBeVisible();
    await expect(statusTag).toContainText('Sem assinatura ativa');

    // 4. Verificação do indicador de uso de quota
    const quotaIndicator = page.locator('#quota-usage-indicator');
    await expect(quotaIndicator).toBeVisible();
    await expect(quotaIndicator).toContainText('0 de 2 ativas (2 disponíveis)');

    // 5. Verificação dos cards de planos Free e Pro
    const freeCard = page.locator('#card-plan-free');
    await expect(freeCard).toBeVisible();
    await expect(freeCard).toContainText('Plano Free');
    await expect(freeCard).toContainText('R$ 0');
    await expect(freeCard).toContainText('Até 2 carteiras ativas');

    const proCard = page.locator('#card-plan-pro');
    await expect(proCard).toBeVisible();
    await expect(proCard).toContainText('Plano Pro');
    await expect(proCard).toContainText('Preço a definir');
    await expect(proCard).toContainText('Até 10 carteiras ativas');

    // 6. Verificação do botão de upgrade desabilitado com aviso explicativo
    const upgradeBtn = page.locator('#btn-upgrade-pro');
    await expect(upgradeBtn).toBeVisible();
    await expect(upgradeBtn).toBeDisabled();
    await expect(upgradeBtn).toContainText('Upgrade Automatizado Indisponível');
    await expect(proCard).toContainText('Pagamentos e upgrade automatizado ainda não estão disponíveis.');

    // 7. Não deve existir formulário ou campos de pagamento/cartão de crédito
    await expect(page.locator('input[type="payment"]')).toHaveCount(0);
    await expect(page.locator('input[name="cardNumber"]')).toHaveCount(0);
    await expect(page.locator('input[name="cvv"]')).toHaveCount(0);

    // 8. Retorno para carteiras via botão ← Voltar para Carteiras
    const backBtn = page.locator('#link-back-to-portfolios');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForURL('**/portfolios');
    await expect(page.locator('h1')).toContainText('Minhas Carteiras');

    // 9. No card de faturamento de /portfolios, link direto para /plans deve funcionar
    const linkViewPlans = page.locator('#link-view-plans');
    await expect(linkViewPlans).toBeVisible();
    await linkViewPlans.click();
    await page.waitForURL('**/plans');
    await expect(page.locator('h1')).toContainText('Planos e Quotas Comerciais');
  });

  test('não deve permitir acesso a /plans para usuário não autenticado', async ({
    page,
  }) => {
    // Acessa /plans diretamente em contexto limpo
    await page.goto('/plans');
    await page.waitForURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Bem-vindo de volta');
    await expect(page.locator('#login-email')).toBeVisible();
  });
});
