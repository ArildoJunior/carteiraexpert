import { test, expect } from '@playwright/test';

test.describe('E2E: Carteiras, Posições e Operações Manuais (Pacote 03.02)', () => {
  const userAEmail = `e2e-portfolio-userA-${Date.now()}@test.com`;
  const userBEmail = `e2e-portfolio-userB-${Date.now()}@test.com`;
  let userAPortfolioUrl = '';

  // ─── 1. Cadastro e Fluxo Completo do Usuário A ──────────────────────────────
  test('deve criar conta, criar carteira, cadastrar ativo, comprar, validar venda excessiva e apurar posições com PnL', async ({
    page,
  }) => {
    // 1. Cadastro do Usuário A
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Alfa');
    await page.fill('#register-email', userAEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Investidor');

    // 2. Navega para a página de carteiras
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await expect(page.locator('h1')).toContainText('Minhas Carteiras');

    // 3. Criação da Primeira Carteira
    await page.click('#create-first-portfolio-btn');
    await expect(page.locator('#portfolio-modal-title')).toBeVisible();

    await page.fill('#portfolio-name', 'Carteira Dividendos E2E');
    await page.fill('#portfolio-description', 'Carteira de ações focada em proventos');
    await page.click('#portfolio-submit');

    // Carteira deve aparecer na listagem
    await expect(
      page.locator('text=Carteira Dividendos E2E')
    ).toBeVisible();

    // 4. Acessa a página de detalhes da carteira
    await page.click('text=Carteira Dividendos E2E');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);
    userAPortfolioUrl = page.url();

    await expect(page.locator('#portfolio-title')).toContainText(
      'Carteira Dividendos E2E'
    );
    await expect(page.locator('#empty-positions-state')).toBeVisible();
    await expect(page.locator('#empty-events-state')).toBeVisible();

    // 5. Registra Operação de Compra com Ativo Customizado
    await page.click('#btn-new-transaction');
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    // Busca ativo que não existe para acionar criação customizada
    const customTicker = `ALFA${Math.floor(Math.random() * 1000)}`;
    await page.fill('#asset-search-input', customTicker);

    // Clica no link para criar ativo customizado
    await page.click('#btn-create-custom-asset');
    await expect(page.locator('#custom-asset-modal-title')).toBeVisible();

    // Valida que o modal preencheu automaticamente o ticker buscado
    await expect(page.locator('#custom-asset-ticker')).toHaveValue(customTicker.toUpperCase());
    await page.fill('#custom-asset-name', 'Alfa Participações S.A.');
    await page.click('#custom-asset-submit');

    // Confirma que o modal de ativo customizado fechou automaticamente e o ativo permaneceu selecionado
    await expect(page.locator('#custom-asset-modal-title')).toBeHidden();
    await expect(page.locator('#selected-asset-ticker')).toContainText(
      customTicker.toUpperCase()
    );
    await expect(page.locator('#transaction-modal-title')).toBeVisible();

    // Preenche dados da compra (100 @ 25.00)
    await page.fill('#transaction-quantity', '100');
    await page.fill('#transaction-unit-price', '25.00');
    await page.fill('#transaction-fees', '0.00');
    await page.fill('#transaction-notes', 'Primeira compra E2E');
    await page.click('#transaction-submit');

    // 6. Valida que a Posição em Custódia foi calculada e exibida
    await expect(page.locator('#portfolio-positions-table')).toBeVisible();
    await expect(
      page.locator(`#position-row-${customTicker.toUpperCase()}`)
    ).toBeVisible();
    await expect(
      page.locator(`#position-qty-${customTicker.toUpperCase()}`)
    ).toContainText('100');
    await expect(page.locator('#metric-total-invested')).toContainText('2.500,00');

    // 6.1. Valida a presença e alternância dos Gráficos de Alocação
    await expect(page.locator('#portfolio-allocation-charts-container')).toBeVisible();
    // Ativo customizado sem cotação: exibe aviso de ausência de cotações em modo mercado
    await expect(page.locator('#chart-only-unquoted-state')).toBeVisible();
    // Alterna para visualização por Custo de Aquisição
    await page.click('#chart-switch-to-cost-btn');
    await expect(page.locator('#portfolio-allocation-charts-container')).toContainText(
      customTicker.toUpperCase()
    );
    await expect(page.locator('#portfolio-allocation-charts-container')).toContainText(
      '2.500,00'
    );
    await expect(page.locator('#portfolio-allocation-charts-container')).toContainText(
      '100,00%'
    );

    // 7. Valida que o Extrato de Operações exibe a compra
    await expect(page.locator('#portfolio-events-table')).toBeVisible();
    await expect(
      page.locator('#portfolio-events-table').getByText(customTicker.toUpperCase())
    ).toBeVisible();
    await expect(page.locator('text=Compra')).toBeVisible();

    // 8. Tenta Registrar Venda EXCESSIVA (150 > 100) -> Deve Rejeitar
    await page.click('#btn-new-transaction');
    await page.click('#transaction-type-sell');

    // Sem ativo selecionado, o badge de posição não é exibido
    await expect(page.locator('#available-position-badge')).toBeHidden();

    await page.fill('#asset-search-input', customTicker);
    const assetOption = page.locator(`#asset-option-${customTicker.toUpperCase()}`);
    await expect(assetOption).toBeVisible({ timeout: 10000 });
    await assetOption.click();

    // Verifica que o badge de posição disponível exibe 100
    await expect(page.locator('#available-position-badge')).toBeVisible();
    await expect(page.locator('#available-position-value')).toContainText('100');

    // Testa troca de ativo: ao clicar em Trocar, o badge deve sumir imediatamente
    await page.click('#btn-clear-asset');
    await expect(page.locator('#available-position-badge')).toBeHidden();

    // Re-seleciona o ativo para continuar o fluxo de venda
    await page.fill('#asset-search-input', customTicker);
    await expect(page.locator(`#asset-option-${customTicker.toUpperCase()}`)).toBeVisible();
    await page.locator(`#asset-option-${customTicker.toUpperCase()}`).click();
    await expect(page.locator('#available-position-badge')).toBeVisible();
    await expect(page.locator('#available-position-value')).toContainText('100');

    // Preenche 150 ações (acima do saldo)
    await page.fill('#transaction-quantity', '150');
    await page.fill('#transaction-unit-price', '30.00');
    await page.fill('#transaction-fees', '0.00');
    await page.click('#transaction-submit');

    // Deve exibir alerta de erro de validação
    await expect(page.locator('#transaction-error-alert')).toBeVisible();
    await expect(page.locator('#transaction-error-alert')).toContainText(
      'insuficiente'
    );

    // 9. Corrige para Venda PARCIAL Válida (40 @ 30.00)
    await page.fill('#transaction-quantity', '40');
    await page.click('#transaction-submit');

    // Valida atualização da posição para 60 ações e apuração de PnL Realizado
    await expect(
      page.locator(`#position-qty-${customTicker.toUpperCase()}`)
    ).toContainText('60');
    await expect(
      page.locator(`#position-realized-pnl-${customTicker.toUpperCase()}`)
    ).toContainText('+R$ 200,00'); // (40 * 30) - (40 * 25) = +200

    // 10. Cancela a operação de Venda com justificativa obrigatória
    const cancelButtons = page.locator('button:has-text("Cancelar")');
    await cancelButtons.first().click();

    await expect(page.locator('#cancel-event-modal-title')).toBeVisible();
    await page.fill(
      '#cancellation-reason',
      'Ordem de venda cancelada no home broker'
    );
    await page.click('#confirm-cancel-event-submit');
    await expect(page.locator('#cancel-event-modal-title')).not.toBeVisible();

    // Valida que a posição foi restabelecida para 100 ações
    await expect(
      page.locator(`#position-qty-${customTicker.toUpperCase()}`)
    ).toContainText('100');

    // 11. Valida Consolidação no Dashboard Geral (/dashboard) - Pacote 03.03
    await page.click('#nav-link-dashboard');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('#dashboard-consolidated-metrics')).toBeVisible();
    await expect(page.locator('#dashboard-total-custody')).toContainText('2.500,00');
    await expect(page.locator('#dashboard-active-assets')).toContainText('1');
    await expect(
      page.locator('#dashboard-portfolios-section').getByText('Carteira Dividendos E2E')
    ).toBeVisible();
    await expect(page.locator('#recent-activities-table')).toBeVisible();
    await expect(
      page.locator('#recent-activities-table').getByText(customTicker.toUpperCase())
    ).toBeVisible();

    // 12. Valida Extrato Global de Operações (/history) e Filtros - Pacote 03.04
    await page.click('#nav-link-history');
    await page.waitForURL('**/history');
    await expect(page.locator('#history-table')).toBeVisible();
    await expect(page.locator('#history-total-count-badge')).toBeVisible();

    // Aplica filtro por Ticker
    await page.fill('#history-filter-ticker', customTicker);
    await page.click('#btn-apply-history-filters');
    await expect(page.locator('#history-table')).toContainText(customTicker.toUpperCase());

    // 13. Retorna à carteira e valida o Modal de Detalhamento e Lançamento de Split
    await page.goto(userAPortfolioUrl);
    await expect(page.locator('#portfolio-positions-table')).toBeVisible();

    const detailBtn = page.locator(`#btn-detail-asset-${customTicker.toUpperCase()}`);
    await expect(detailBtn).toBeVisible();
    await detailBtn.click();

    await expect(page.locator('#asset-detail-modal-title')).toContainText(customTicker.toUpperCase());
    await expect(page.locator('#asset-detail-qty')).toContainText('100');
    await expect(page.locator('#asset-detail-avg-price')).toContainText('25,00');

    // 14. Lança Desdobramento (Split 1:2) pelo modal
    await page.click('#btn-toggle-corporate-action-form');
    await expect(page.locator('#corporate-action-form')).toBeVisible();

    await page.selectOption('#input-corporate-action-type', 'SPLIT');
    await page.fill('#input-corporate-action-factor', '2');
    await page.click('#btn-submit-corporate-action');

    await expect(page.locator('#corporate-action-success-msg')).toBeVisible();
    await expect(page.locator('#asset-detail-qty')).toContainText('200');
    await expect(page.locator('#asset-detail-avg-price')).toContainText('12,50');

    // Fecha o modal
    await page.click('#btn-close-asset-detail-modal');
    await expect(page.locator('#asset-detail-modal-backdrop')).not.toBeVisible();

    // Valida que a tabela de posições da carteira reflete as 200 ações
    await expect(
      page.locator(`#position-qty-${customTicker.toUpperCase()}`)
    ).toContainText('200');

    // 15. Acessa /history e valida a presença do evento de Desdobramento
    await page.goto('/history');
    await expect(page.locator('#history-table')).toContainText('Desdobramento');
    await expect(page.locator('#history-table')).toContainText('Fator 1:2');
  });

  // ─── 2. Isolamento Multiusuário (Proteção contra IDOR) ──────────────────────
  test('usuário B não deve conseguir acessar ou visualizar carteira ou posições do usuário A', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Cadastra Usuário B
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Beta');
    await page.fill('#register-email', userBEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // Dashboard do Usuário B deve estar completamente limpo e zerado
    await expect(page.locator('#dashboard-total-custody')).toContainText('0,00');
    await expect(page.locator('#empty-portfolios-state')).toBeVisible();
    await expect(page.locator('#empty-recent-activities')).toBeVisible();
    await expect(
      page.locator('#dashboard-portfolios-section').getByText('Carteira Dividendos E2E')
    ).not.toBeVisible();

    // Tenta acessar diretamente a URL da carteira do Usuário A
    if (userAPortfolioUrl) {
      await page.goto(userAPortfolioUrl);

      // Deve ser redirecionado para página 404 (Not Found) ou barrado sem exibir dados
      await expect(
        page.locator('text=Carteira Dividendos E2E')
      ).not.toBeVisible();
    }

    // Acessa /history do Usuário B (deve estar vazio)
    await page.goto('/history');
    await expect(page.locator('#empty-history-state')).toBeVisible();

    await context.close();
  });
});
