import { test, expect, type Page } from '@playwright/test';

test.describe('AppShell — Layout Autenticado, Navegação e Acessibilidade (E2E)', () => {
  async function registerAndLogin(page: Page, name: string): Promise<string> {
    await page.goto('/register');
    const email = `e2e-shell-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;

    await page.fill('#register-name', name);
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaForte@1');
    await page.fill('#register-confirm-password', 'SenhaForte@1');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');
    return email;
  }

  test('Desktop (1280x800): deve renderizar sidebar persistente, rota ativa, alternância de tema e ausência de overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, 'Usuário Desktop E2E');

    // 1. Sidebar desktop visível e cabeçalho contextual sem badge fictício
    await expect(page.locator('#app-header')).toBeVisible();
    await expect(page.locator('#app-header')).toContainText('Usuário Desktop E2E');
    await expect(page.locator('#app-header')).not.toContainText('PRO');

    await expect(page.locator('#nav-link-dashboard')).toBeVisible();
    await expect(page.locator('#nav-link-portfolios')).toBeVisible();
    await expect(page.locator('#nav-link-history')).toBeVisible();
    await expect(page.locator('#nav-link-import')).toBeVisible();
    await expect(page.locator('#nav-link-plans')).toBeVisible();

    // Botão mobile deve estar oculto em desktop
    await expect(page.locator('#btn-dashboard-mobile-menu-toggle')).toBeHidden();

    // 2. Rota ativa e navegação
    await expect(page.locator('#nav-link-dashboard')).toHaveAttribute('aria-current', 'page');

    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await expect(page.locator('#nav-link-portfolios')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#app-header')).toContainText('Minhas Carteiras');

    // 3. Alternância de tema na sidebar desktop
    const themeBtn = page.locator('#theme-toggle-btn');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    // Seleciona tema Escuro
    await page.click('#theme-option-dark');
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // Retorna para tema Claro
    await themeBtn.click();
    await page.click('#theme-option-light');
    const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    expect(isLight).toBe(true);

    // 4. Ausência de overflow horizontal
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Mobile (375x667): deve testar foco inicial, trap de foco, restauração de foco, Escape, backdrop, trava de scroll e ausência de overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await registerAndLogin(page, 'Usuário Mobile E2E');

    // 1. Sidebar desktop oculta e botão mobile visível
    await expect(page.locator('#nav-link-dashboard')).toBeHidden();
    const mobileToggle = page.locator('#btn-dashboard-mobile-menu-toggle');
    await expect(mobileToggle).toBeVisible();
    await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

    // Drawer ausente e rolagem liberada inicialmente
    await expect(page.locator('#dashboard-mobile-menu')).toHaveCount(0);
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(initialOverflow).not.toBe('hidden');

    // 2. Abertura do drawer e validação de foco inicial
    await mobileToggle.click();
    await expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.locator('#dashboard-mobile-menu');
    await expect(drawer).toBeVisible();

    // Bloqueio de rolagem enquanto aberto
    const bodyOverflowWhileOpen = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflowWhileOpen).toBe('hidden');

    // Foco inicial automático no botão de fechar
    const closeBtn = page.locator('#btn-close-mobile-drawer');
    await expect(closeBtn).toBeFocused();

    // 3. Validação do Trap de Foco (Shift+Tab a partir do primeiro elemento vai para o último)
    await page.keyboard.press('Shift+Tab');
    const lastElement = page.locator('#mobile-logout-button');
    await expect(lastElement).toBeFocused();

    // Tab a partir do último elemento volta para o primeiro
    await page.keyboard.press('Tab');
    await expect(closeBtn).toBeFocused();

    // 4. Fechamento por tecla Escape e restauração de foco e scroll
    await page.keyboard.press('Escape');
    await expect(page.locator('#dashboard-mobile-menu')).toHaveCount(0);
    await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

    const bodyOverflowAfterEscape = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflowAfterEscape).not.toBe('hidden');
    await expect(mobileToggle).toBeFocused();

    // 5. Reabertura e fechamento pelo botão de fechar com restauração de foco
    await mobileToggle.click();
    await expect(page.locator('#dashboard-mobile-menu')).toBeVisible();
    await expect(closeBtn).toBeFocused();

    await closeBtn.click();
    await expect(page.locator('#dashboard-mobile-menu')).toHaveCount(0);
    await expect(mobileToggle).toBeFocused();

    // 6. Reabertura e fechamento por clique no backdrop com restauração de foco
    await mobileToggle.click();
    await expect(page.locator('#dashboard-mobile-menu')).toBeVisible();

    await page.click('#mobile-drawer-backdrop', { position: { x: 350, y: 100 } });
    await expect(page.locator('#dashboard-mobile-menu')).toHaveCount(0);
    await expect(mobileToggle).toBeFocused();

    // 7. Reabertura e navegação interna (fechamento automático do drawer)
    await mobileToggle.click();
    await expect(page.locator('#mobile-nav-link-history')).toBeVisible();
    await page.click('#mobile-nav-link-history');

    await page.waitForURL('**/history');
    await expect(page.locator('#dashboard-mobile-menu')).toHaveCount(0);
    await expect(page.locator('#app-header')).toContainText('Histórico');

    const bodyOverflowAfterNav = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflowAfterNav).not.toBe('hidden');

    // 8. Ausência de overflow horizontal no mobile
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Consistência de Tema: deve alternar tema no AppHeader do Dashboard e manter consistência ao navegar para o Catálogo (/acoes) e retornar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerAndLogin(page, 'Usuário Consistência Tema');

    // 1. No Dashboard, ThemeToggle deve estar visível no AppHeader
    const headerThemeBtn = page.locator('#app-header #theme-toggle-btn');
    await expect(headerThemeBtn).toBeVisible();

    // 2. Alterna para tema Escuro no Dashboard
    await headerThemeBtn.click();
    await page.click('#theme-option-dark');
    let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // 3. Navega para /acoes (página pública com PublicNavbar)
    await page.click('#nav-link-acoes');
    await page.waitForURL('**/acoes');
    await expect(page.locator('h1')).toContainText('Ações Brasileiras');

    // Valida que o tema Escuro permaneceu ativo em /acoes
    isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // Valida presença do ThemeToggle na navbar pública
    const publicThemeBtn = page.locator('nav #theme-toggle-btn, header #theme-toggle-btn').first();
    await expect(publicThemeBtn).toBeVisible();

    // 4. Retorna ao Dashboard pelo botão de dashboard da navbar pública
    await page.click('#btn-nav-dashboard');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('#app-header')).toContainText('Dashboard Consolidado');

    // Valida que o tema Escuro continua ativo no Dashboard
    isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // 5. Alterna de volta para Claro no Dashboard e navega para /fiis
    await headerThemeBtn.click();
    await page.click('#theme-option-light');
    let isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    expect(isLight).toBe(true);

    await page.click('#nav-link-fiis');
    await page.waitForURL('**/fiis');
    await expect(page.locator('h1')).toContainText('Fundos Imobiliários');

    // Valida que o tema Claro permaneceu ativo em /fiis
    isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    expect(isLight).toBe(true);
  });
});
