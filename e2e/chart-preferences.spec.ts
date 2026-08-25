import { test, expect } from '@playwright/test';

test.describe('E2E: Persistência de Preferências de Gráficos por Usuário e Área (Fase 06)', () => {
  const userAEmail = `e2e-chartpref-userA-${Date.now()}@test.com`;
  const userBEmail = `e2e-chartpref-userB-${Date.now()}@test.com`;
  let userAPortfolioUrl = '';

  test('deve persistir e restaurar escolhas visuais de gráficos no Dashboard e na Carteira, mantendo isolamento', async ({
    page,
    browser,
  }) => {
    // ─── 1. Cadastro do Usuário A ───────────────────────────────────────────
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Gráfico A');
    await page.fill('#register-email', userAEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // ─── 2. Criação de Carteira e Registro de Operação ──────────────────────
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');

    await page.click('#create-first-portfolio-btn');
    await expect(page.locator('#portfolio-modal-title')).toBeVisible();

    await page.fill('#portfolio-name', 'Carteira Preferências E2E');
    await page.fill('#portfolio-description', 'Carteira para testes de preferências de gráficos');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Preferências E2E')).toBeVisible();
    await page.click('text=Carteira Preferências E2E');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);
    userAPortfolioUrl = page.url();

    // Registra operação de compra de ativo customizado
    await page.click('#btn-new-transaction');
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    const customTicker = `PREF${Math.floor(Math.random() * 1000)}`;
    await page.fill('#asset-search-input', customTicker);
    await page.click('#btn-create-custom-asset');
    await expect(page.locator('#custom-asset-modal-title')).toBeVisible();

    await page.fill('#custom-asset-name', 'Preferencia Corp.');
    await page.click('#custom-asset-submit');
    await expect(page.locator('#custom-asset-modal-title')).toBeHidden();

    await page.fill('#transaction-quantity', '100');
    await page.fill('#transaction-unit-price', '42.50');
    await page.click('#transaction-submit');

    await expect(page.locator('#transaction-modal-title')).toBeHidden();
    await expect(page.locator(`#position-row-${customTicker.toUpperCase()}`)).toBeVisible();
    await expect(page.locator('#metric-total-invested')).toContainText('4.250,00');
    await expect(page.locator(`#position-qty-${customTicker.toUpperCase()}`)).toContainText('100');
    await expect(page.locator('#portfolio-allocation-charts-container')).toBeVisible();
    await expect(page.locator('#portfolio-evolution-card')).toBeVisible();

    // ─── 3. Teste de Preferências na Carteira (/portfolios/[id]) ────────────
    // Verifica defaults iniciais
    await expect(page.locator('#period-btn-YTD')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#view-mode-btn-comparison')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-grouping-tab-asset')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-basis-market_value')).toHaveAttribute('aria-pressed', 'true');

    // Altera período para 1M e modo para cost_basis no gráfico de evolução
    // (Sequência rápida de dois controles diferentes da mesma área)
    await page.click('#period-btn-1M');
    await page.click('#view-mode-btn-cost_basis');

    // Aguarda conclusão determinística da sincronização no DOM sem sleeps artificiais
    await expect(page.locator('#portfolio-evolution-card')).toHaveAttribute('data-sync-status', 'idle');

    // Confirma que os controles permanecem ativos após a conclusão da sincronização (sem reversão indevida)
    await expect(page.locator('#period-btn-1M')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#view-mode-btn-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // Altera agrupamento para Por Classe e base para Custo de Aquisição no gráfico de alocação
    // (Sequência rápida de dois controles diferentes da mesma área)
    await page.click('#chart-grouping-tab-asset_type');
    await page.click('#chart-basis-cost_basis');

    // Aguarda conclusão determinística da sincronização no DOM
    await expect(page.locator('#portfolio-allocation-charts-container')).toHaveAttribute('data-sync-status', 'idle');

    // Confirma que os controles permanecem ativos após a sincronização
    await expect(page.locator('#chart-grouping-tab-asset_type')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-basis-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // ─── 3.1 Registro de nova operação para disparar router.refresh() ────────
    // Registra uma segunda compra para validar que router.refresh() atualiza os dados derivados
    // e o resumo financeiro sem reverter as preferências visuais locais ativas
    await page.click('#btn-new-transaction');
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    await page.fill('#asset-search-input', customTicker);
    const assetOption = page.locator(`#asset-option-${customTicker.toUpperCase()}`);
    await expect(assetOption).toBeVisible({ timeout: 10000 });
    await assetOption.click();

    await page.fill('#transaction-quantity', '50');
    await page.fill('#transaction-unit-price', '20.00');
    await page.click('#transaction-submit');

    await expect(page.locator('#transaction-modal-title')).toBeHidden();

    // Confirma que métricas, posições e resumo financeiro foram atualizados após o router.refresh()
    await expect(page.locator(`#position-qty-${customTicker.toUpperCase()}`)).toContainText('150');
    await expect(page.locator('#metric-total-invested')).toContainText('5.250,00');
    await expect(page.locator('#evolution-metric-cost')).toContainText('5.250,00');

    // Confirma que as preferências visuais permaneceram intactas sem reversão após o refresh
    await expect(page.locator('#period-btn-1M')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#view-mode-btn-cost_basis')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-grouping-tab-asset_type')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-basis-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // Recarrega a página da carteira
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Valida que as preferências foram restauradas com precisão após o reload
    await expect(page.locator('#period-btn-1M')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#view-mode-btn-cost_basis')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-grouping-tab-asset_type')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart-basis-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // ─── 4. Teste de Preferências no Dashboard (/dashboard) ─────────────────
    await page.click('#nav-link-dashboard');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('#dashboard-allocation-charts-container')).toBeVisible();

    // Verifica defaults no dashboard
    await expect(page.locator('#dashboard-chart-tab-asset_type')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dashboard-chart-basis-market_value')).toHaveAttribute('aria-pressed', 'true');

    // Altera agrupamento para Por Moeda e base para Custo de Aquisição (sequência rápida)
    await page.click('#dashboard-chart-tab-currency');
    await page.click('#dashboard-chart-basis-cost_basis');

    // Aguarda conclusão determinística da sincronização no DOM
    await expect(page.locator('#dashboard-allocation-charts-container')).toHaveAttribute('data-sync-status', 'idle');

    // Confirma que os controles permanecem ativos antes do reload
    await expect(page.locator('#dashboard-chart-tab-currency')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dashboard-chart-basis-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // Recarrega o dashboard
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Valida que as preferências do dashboard foram restauradas
    await expect(page.locator('#dashboard-chart-tab-currency')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dashboard-chart-basis-cost_basis')).toHaveAttribute('aria-pressed', 'true');

    // ─── 5. Teste de Isolamento com Usuário B ────────────────────────────────
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.goto('/register');
    await pageB.fill('#register-name', 'Investidor Gráfico B');
    await pageB.fill('#register-email', userBEmail);
    await pageB.fill('#register-password', 'SenhaSegura@123');
    await pageB.fill('#register-confirm-password', 'SenhaSegura@123');
    await pageB.check('#register-terms');
    await pageB.check('#register-privacy');
    await pageB.click('#register-submit');

    await pageB.waitForURL('**/dashboard');

    // Cria carteira e operação para o Usuário B para poder ver os gráficos
    await pageB.click('#nav-link-portfolios');
    await pageB.waitForURL('**/portfolios');

    await pageB.click('#create-first-portfolio-btn');
    await expect(pageB.locator('#portfolio-modal-title')).toBeVisible();
    await pageB.fill('#portfolio-name', 'Carteira User B');
    await pageB.click('#portfolio-submit');
    await expect(pageB.locator('text=Carteira User B')).toBeVisible();
    await pageB.click('text=Carteira User B');
    await pageB.waitForURL(/\/portfolios\/[0-9a-f-]+/);

    await pageB.click('#btn-new-transaction');
    await expect(pageB.locator('#transaction-modal-title')).toBeVisible();

    const customTickerB = `BETA${Math.floor(Math.random() * 1000)}`;
    await pageB.fill('#asset-search-input', customTickerB);
    await pageB.click('#btn-create-custom-asset');
    await expect(pageB.locator('#custom-asset-modal-title')).toBeVisible();

    await pageB.fill('#custom-asset-name', 'Beta Corp.');
    await pageB.click('#custom-asset-submit');
    await expect(pageB.locator('#custom-asset-modal-title')).toBeHidden();

    await pageB.fill('#transaction-quantity', '50');
    await pageB.fill('#transaction-unit-price', '10.00');
    await pageB.click('#transaction-submit');

    await expect(pageB.locator('#transaction-modal-title')).toBeHidden();
    await expect(pageB.locator(`#position-row-${customTickerB.toUpperCase()}`)).toBeVisible();
    await expect(pageB.locator('#metric-total-invested')).toContainText('500,00');
    await expect(pageB.locator(`#position-qty-${customTickerB.toUpperCase()}`)).toContainText('50');
    await expect(pageB.locator('#portfolio-allocation-charts-container')).toBeVisible();
    await expect(pageB.locator('#portfolio-evolution-card')).toBeVisible();

    // Confirma que o Usuário B tem os defaults do sistema, sem herdar preferências do Usuário A
    await expect(pageB.locator('#period-btn-YTD')).toHaveAttribute('aria-pressed', 'true');
    await expect(pageB.locator('#view-mode-btn-comparison')).toHaveAttribute('aria-pressed', 'true');
    await expect(pageB.locator('#chart-grouping-tab-asset')).toHaveAttribute('aria-pressed', 'true');
    await expect(pageB.locator('#chart-basis-market_value')).toHaveAttribute('aria-pressed', 'true');

    await contextB.close();
  });
});
