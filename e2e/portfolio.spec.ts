import { test, expect } from '@playwright/test';

test.describe('E2E: Carteiras e Operações Manuais (Pacote 03.01-D)', () => {
  const userAEmail = `e2e-portfolio-userA-${Date.now()}@test.com`;
  const userBEmail = `e2e-portfolio-userB-${Date.now()}@test.com`;
  let userAPortfolioUrl = '';

  // ─── 1. Cadastro e Fluxo Completo do Usuário A ──────────────────────────────
  test('deve criar conta, criar carteira, cadastrar ativo e registrar compra e venda', async ({
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

    await page.fill('#custom-asset-ticker', customTicker);
    await page.fill('#custom-asset-name', 'Alfa Participações S.A.');
    await page.click('#custom-asset-submit');

    // Ativo selecionado aparece no modal de transação
    await expect(page.locator('#selected-asset-ticker')).toContainText(
      customTicker.toUpperCase()
    );

    // Preenche dados da compra
    await page.fill('#transaction-quantity', '100');
    await page.fill('#transaction-unit-price', '25.50');
    await page.fill('#transaction-fees', '4.20');
    await page.fill('#transaction-notes', 'Primeira compra E2E');
    await page.click('#transaction-submit');

    // Verifica que a linha da compra apareceu na tabela
    await expect(page.locator('#portfolio-events-table')).toBeVisible();
    await expect(
      page.locator('#portfolio-events-table').getByText(customTicker.toUpperCase())
    ).toBeVisible();
    await expect(page.locator('text=Compra')).toBeVisible();
    await expect(page.locator('text=100.0000000000')).toBeVisible();
    await expect(page.locator('tbody').getByText('Ativo').first()).toBeVisible();

    // 6. Registra Operação de Venda
    await page.click('#btn-new-transaction');
    await page.click('#transaction-type-sell');

    // Busca o ativo customizado recém-criado
    await page.fill('#asset-search-input', customTicker);
    const assetOption = page.locator(`#asset-option-${customTicker.toUpperCase()}`);
    await expect(assetOption).toBeVisible({ timeout: 10000 });
    await assetOption.click();

    // Confirma que o ativo foi selecionado
    await expect(page.locator('#selected-asset-ticker')).toContainText(
      customTicker.toUpperCase()
    );

    await page.fill('#transaction-quantity', '50');
    await page.fill('#transaction-unit-price', '30.00');
    await page.fill('#transaction-fees', '2.00');
    await page.click('#transaction-submit');

    // Verifica que a linha de venda apareceu na tabela
    await expect(page.locator('text=Venda')).toBeVisible();
    await expect(page.locator('text=50.0000000000')).toBeVisible();
    await expect(page.locator('text=2 registros')).toBeVisible();

    // 7. Cancela a operação mais recente (Venda) com justificativa obrigatória
    const cancelButtons = page.locator('button:has-text("Cancelar")');
    await cancelButtons.first().click();

    await expect(page.locator('#cancel-event-modal-title')).toBeVisible();
    await page.fill(
      '#cancellation-reason',
      'Ordem de venda cancelada no home broker'
    );
    await page.click('#confirm-cancel-event-submit');

    // Verifica que a operação cancelada foi removida da visão ativa (soft delete) e resta a Compra
    await expect(page.locator('text=1 registro')).toBeVisible();
    await expect(page.locator('text=Compra')).toBeVisible();
  });

  // ─── 2. Isolamento Multiusuário (Proteção contra IDOR) ──────────────────────
  test('usuário B não deve conseguir acessar ou visualizar carteira do usuário A', async ({
    browser,
  }) => {
    // Cria um novo contexto de navegação isolado para o Usuário B
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

    // Tenta acessar diretamente a URL da carteira do Usuário A
    if (userAPortfolioUrl) {
      await page.goto(userAPortfolioUrl);

      // Deve ser redirecionado para página 404 (Not Found) ou barrado sem exibir dados
      await expect(
        page.locator('text=Carteira Dividendos E2E')
      ).not.toBeVisible();
    }

    await context.close();
  });
});
