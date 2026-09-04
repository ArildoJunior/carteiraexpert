import { test, expect, type Page } from '@playwright/test';

test.describe('Módulo Fiscal e Relatórios Auxiliares de IRPF (Etapa 9) — E2E', () => {
  async function registerAndLogin(page: Page, name: string): Promise<string> {
    await page.goto('/register');
    const email = `e2e-tax-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;

    await page.fill('#register-name', name);
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');
    return email;
  }

  test('deve exibir aviso regulatório RFB/CVM, navegação, modal de parâmetros e abas de relatórios IRPF', async ({
    page,
  }) => {
    await registerAndLogin(page, 'Carlos Fiscal');

    // 1. Navegação via link na sidebar
    const navLink = page.locator('#nav-link-fiscal').first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await page.waitForURL('**/fiscal');

    // 2. Título e subtítulo da página
    await expect(page.getByRole('heading', { name: 'Módulo Fiscal e Apoio ao IRPF' })).toBeVisible();
    await expect(
      page.getByText('Apuração contínua de ganho de capital, controle de prejuízos e relatórios auxiliares')
    ).toBeVisible();

    // 3. Banner Regulatório Obrigatório com ID tax-regulatory-disclaimer
    const disclaimer = page.locator('#tax-regulatory-disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('Aviso Regulatório e Diretrizes Fiscais');
    await expect(disclaimer).toContainText('NÃO emite DARF');
    await expect(disclaimer).toContainText('NÃO integra com o e-CAC/Receita Federal');
    await expect(disclaimer).toContainText('O usuário é o único responsável');

    // 4. Modal de Configuração de Parâmetros Fiscais
    const prefButton = page.locator('#open-tax-preferences-button');
    await expect(prefButton).toBeVisible();
    await prefButton.click();

    await expect(page.getByRole('heading', { name: 'Configuração de Parâmetros Fiscais' })).toBeVisible();
    await page.fill('#tax-pref-cap-rate', '16.0');
    await page.fill('#tax-pref-exempt-threshold', '25000.00');
    await page.click('#save-tax-preferences-button');

    // Modal deve fechar e atualizar cabeçalho
    await expect(page.getByRole('heading', { name: 'Configuração de Parâmetros Fiscais' })).not.toBeVisible();
    await expect(page.getByText('R$ 25.000,00/mês')).toBeVisible();
    await expect(page.getByText('16.0%')).toBeVisible();

    // 5. Alternância de abas de relatórios IRPF
    const tabBens = page.locator('#tab-btn-bens');
    await expect(tabBens).toBeVisible();
    await tabBens.click();
    await expect(page.getByRole('heading', { name: /Ficha de Bens e Direitos/i })).toBeVisible();

    const tabIsentos = page.locator('#tab-btn-isentos');
    await expect(tabIsentos).toBeVisible();
    await tabIsentos.click();
    await expect(page.getByRole('heading', { name: /Ficha de Rendimentos Isentos/i })).toBeVisible();

    const tabExclusiva = page.locator('#tab-btn-exclusiva');
    await expect(tabExclusiva).toBeVisible();
    await tabExclusiva.click();
    await expect(page.getByRole('heading', { name: /Ficha de Tributação Exclusiva/i })).toBeVisible();

    const tabPrejuizos = page.locator('#tab-btn-prejuizos');
    await expect(tabPrejuizos).toBeVisible();
    await tabPrejuizos.click();
    await expect(page.getByRole('heading', { name: /Controle de Prejuízos Acumulados/i })).toBeVisible();

    const tabMonthly = page.locator('#tab-btn-monthly');
    await expect(tabMonthly).toBeVisible();
    await tabMonthly.click();
    await expect(page.locator('[data-testid="monthly-card-1"]')).toBeVisible();

    // 6. Botões de exportação
    await expect(page.locator('#export-csv-button')).toBeVisible();
    await expect(page.locator('#print-pdf-button')).toBeVisible();
  });
});
