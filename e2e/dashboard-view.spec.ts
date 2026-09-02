import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR
  ? path.resolve(process.env.SCREENSHOT_DIR)
  : path.resolve(__dirname, '../artifacts/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe('Dashboard Consolidado — Visual, Responsividade e Temas (E2E)', () => {
  async function registerAndLogin(page: Page, name: string): Promise<string> {
    await page.goto('/register');
    const email = `e2e-dash-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;

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

  test('Desktop (1280x800 e 1440x900): renderização de estado inicial consolidado, métricas e ausência de overflow', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, 'Carlos Silva');

    // 1. Header do Dashboard
    await expect(page.locator('#dashboard-page-container')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Olá, Carlos 👋');
    await expect(page.locator('#dashboard-new-portfolio-btn')).toBeVisible();

    // 2. Cards de métricas consolidadas
    await expect(page.locator('#dashboard-consolidated-metrics')).toBeVisible();
    await expect(page.locator('#dashboard-total-custody')).toBeVisible();
    await expect(page.locator('#dashboard-total-market-value')).toBeVisible();
    await expect(page.locator('#dashboard-unrealized-pnl')).toBeVisible();
    await expect(page.locator('#dashboard-realized-pnl')).toBeVisible();
    await expect(page.locator('#dashboard-total-income')).toBeVisible();
    await expect(page.locator('#dashboard-total-fees')).toBeVisible();
    await expect(page.locator('#dashboard-active-assets')).toBeVisible();

    // 3. Estado inicial sem carteiras
    await expect(page.locator('#empty-portfolios-state')).toBeVisible();
    await expect(page.locator('#empty-recent-activities')).toBeVisible();

    // Captura screenshot em 1280x800 (Light) se for Chromium
    if (browserName === 'chromium') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-1280x800-light.png'),
        fullPage: true,
      });

      // Alterna para tema escuro e captura
      const themeBtn = page.locator('#theme-toggle-btn');
      await themeBtn.click();
      await page.click('#theme-option-dark');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-1280x800-dark.png'),
        fullPage: true,
      });
      // Retorna para tema claro
      await themeBtn.click();
      await page.click('#theme-option-light');
      await page.waitForTimeout(100);
    }

    // 4. Verificação de ausência de overflow em 1280x800
    let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);

    // 5. Verificação em 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);

    if (browserName === 'chromium') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-1440x900-light.png'),
        fullPage: true,
      });
    }
  });

  test('Mobile (375x667 e 390x844): renderização responsiva, layout dos cards e ausência de overflow', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await registerAndLogin(page, 'Beatriz Mendes');

    // 1. Elementos essenciais visíveis e organizados
    await expect(page.locator('#dashboard-page-container')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Olá, Beatriz 👋');
    await expect(page.locator('#dashboard-new-portfolio-btn')).toBeVisible();

    // 2. Cards métricos responsivos
    await expect(page.locator('#dashboard-consolidated-metrics')).toBeVisible();
    await expect(page.locator('#dashboard-total-custody')).toBeVisible();
    await expect(page.locator('#dashboard-total-market-value')).toBeVisible();

    if (browserName === 'chromium') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-375x667-light.png'),
        fullPage: true,
      });

      // Abre drawer e troca para tema escuro
      await page.click('#btn-dashboard-mobile-menu-toggle');
      await page.click('#mobile-theme-toggle-btn');
      await page.click('#theme-option-dark');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-375x667-dark.png'),
        fullPage: true,
      });
      // Retorna para tema claro
      await page.click('#btn-dashboard-mobile-menu-toggle');
      await page.click('#mobile-theme-toggle-btn');
      await page.click('#theme-option-light');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // 3. Ausência de overflow em 375x667
    let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);

    // 4. Ausência de overflow em 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);

    if (browserName === 'chromium') {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-empty-390x844-light.png'),
        fullPage: true,
      });
    }
  });

  test('Fluxo completo de consolidação com carteira, transação, gráficos de alocação e feed de atividades', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, 'Investidor Consolidado');

    // 1. Cria primeira carteira
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');
    await page.fill('#portfolio-name', 'Carteira Alpha');
    await page.fill('#portfolio-description', 'Carteira principal');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Alpha')).toBeVisible();
    await page.click('text=Carteira Alpha');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);

    // 2. Registra uma compra via ativo customizado
    await page.click('#btn-new-transaction');
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    const customTicker = `ALPHA${Math.floor(Math.random() * 1000)}`;
    await page.fill('#asset-search-input', customTicker);
    await page.click('#btn-create-custom-asset');
    await expect(page.locator('#custom-asset-modal-title')).toBeVisible();
    await page.fill('#custom-asset-name', 'Alpha Participações');
    await page.click('#custom-asset-submit');
    await expect(page.locator('#custom-asset-modal-title')).toBeHidden();

    await page.fill('#transaction-quantity', '100');
    await page.fill('#transaction-unit-price', '35.50');
    await page.click('#transaction-submit');

    await expect(page.locator('#transaction-modal-title')).toBeHidden();
    await expect(page.locator(`#position-row-${customTicker.toUpperCase()}`)).toBeVisible();

    // 3. Retorna ao Dashboard
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard');

    // 4. Valida se o card da carteira está no grid consolidado
    await expect(page.locator('#dashboard-portfolios-grid')).toBeVisible();
    await expect(page.locator('#dashboard-portfolios-section')).toContainText('Carteira Alpha');
    await expect(page.locator('#dashboard-total-custody')).toContainText('3.550,00');

    // 5. Valida gráfico de alocação consolidada
    await expect(page.locator('#dashboard-allocation-charts-container')).toBeVisible();
    await expect(page.locator('#dashboard-chart-tab-asset_type')).toBeVisible();
    await expect(page.locator('#dashboard-chart-tab-portfolio')).toBeVisible();
    await expect(page.locator('#dashboard-chart-tab-currency')).toBeVisible();

    // 6. Valida feed de atividades recentes
    await expect(page.locator('#dashboard-recent-activity-section')).toBeVisible();
    await expect(page.locator('#recent-activities-table')).toBeVisible();
    await expect(page.locator('#recent-activities-table')).toContainText(customTicker.toUpperCase());

    // 7. Captura de evidências nos viewports e temas
    if (browserName === 'chromium') {
      // 1280x800 Light
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-1280x800-light.png'),
        fullPage: true,
      });

      // 1280x800 Dark
      const themeBtn = page.locator('#theme-toggle-btn');
      await themeBtn.click();
      await page.click('#theme-option-dark');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-1280x800-dark.png'),
        fullPage: true,
      });

      // 1440x900 Dark & Light
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-1440x900-dark.png'),
        fullPage: true,
      });
      await themeBtn.click();
      await page.click('#theme-option-light');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-1440x900-light.png'),
        fullPage: true,
      });

      // 375x667 Light & Dark
      await page.setViewportSize({ width: 375, height: 667 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-375x667-light.png'),
        fullPage: true,
      });
      await page.click('#btn-dashboard-mobile-menu-toggle');
      await page.click('#mobile-theme-toggle-btn');
      await page.click('#theme-option-dark');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-375x667-dark.png'),
        fullPage: true,
      });

      // 390x844 Dark & Light
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-390x844-dark.png'),
        fullPage: true,
      });
      await page.click('#btn-dashboard-mobile-menu-toggle');
      await page.click('#mobile-theme-toggle-btn');
      await page.click('#theme-option-light');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard-populated-390x844-light.png'),
        fullPage: true,
      });

      // Retorna para desktop
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    // 8. Alternância de tema no Dashboard
    const themeBtn = page.locator('#theme-toggle-btn');
    await themeBtn.click();
    await page.click('#theme-option-dark');
    let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    await themeBtn.click();
    await page.click('#theme-option-light');
    isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(false);

    // 9. Ausência de overflow
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  test('Mobile (375x667): rolagem interna isolada da tabela de atividades e ausência de corte monetário', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await registerAndLogin(page, 'Mariana Teste Mobile');

    // 1. Cria carteira e operação com valores expressivos
    await page.click('#btn-dashboard-mobile-menu-toggle');
    await page.click('#mobile-nav-link-portfolios');
    await page.waitForURL('**/portfolios');

    await page.click('#create-first-portfolio-btn');
    await page.fill('#portfolio-name', 'Carteira Mobile');
    await page.fill('#portfolio-description', 'Teste de tabela');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Mobile')).toBeVisible();
    await page.click('text=Carteira Mobile');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);

    // 2. Registra compra
    await page.click('#btn-new-transaction');
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    const ticker = `MOB${Math.floor(Math.random() * 1000)}`;
    await page.fill('#asset-search-input', ticker);
    await page.click('#btn-create-custom-asset');
    await expect(page.locator('#custom-asset-modal-title')).toBeVisible();
    await page.fill('#custom-asset-name', 'Mobile Enterprise Corp');
    await page.click('#custom-asset-submit');
    await expect(page.locator('#custom-asset-modal-title')).toBeHidden();

    await page.fill('#transaction-quantity', '500');
    await page.fill('#transaction-unit-price', '124.50');
    await page.click('#transaction-submit');
    await expect(page.locator('#transaction-modal-title')).toBeHidden();
    await expect(page.locator(`#position-row-${ticker.toUpperCase()}`)).toBeVisible();

    // 3. Retorna ao Dashboard
    await page.click('#btn-dashboard-mobile-menu-toggle');
    await page.click('#mobile-nav-link-dashboard');
    await page.waitForURL('**/dashboard');

    // 4. Inspeciona o container de overflow da tabela
    const tableContainer = page.locator('#recent-activities-table').locator('xpath=..');
    await expect(tableContainer).toBeVisible();

    // Verifica se a tabela tem rolagem interna isolada no mobile
    const scrollDimensions = await tableContainer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollDimensions.scrollWidth).toBeGreaterThan(scrollDimensions.clientWidth);

    // Realiza rolagem horizontal interna e valida que scrollLeft atualiza
    await tableContainer.evaluate((el) => {
      el.scrollLeft = 80;
    });
    const scrolledLeft = await tableContainer.evaluate((el) => el.scrollLeft);
    expect(scrolledLeft).toBeGreaterThan(0);

    // 5. Garante que o documento global não possui overflow horizontal
    const docOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(docOverflow).toBe(false);

    // 6. Confirma que os valores numéricos completos estão no DOM sem perda de informação
    await expect(page.locator('#recent-activities-table')).toContainText('500');
    await expect(page.locator('#recent-activities-table')).toContainText('124,50');
    await expect(page.locator('#dashboard-total-custody')).toContainText('62.250,00');
  });
});
