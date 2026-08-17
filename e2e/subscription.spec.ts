import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';

test.describe.serial('E2E: Subscrições e Direitos Patrimoniais (S1.6)', () => {
  let queryClient: ReturnType<typeof postgres> | null = null;

  // Usuários de Teste
  const timestamp = Date.now();
  const adminUserId = crypto.randomUUID();
  const userAEmail = `e2e-sub-userA-${timestamp}@carteiraexpert.test`;
  const userBEmail = `e2e-sub-userB-${timestamp}@carteiraexpert.test`;
  const defaultPassword = 'SenhaSegura@123';

  let userAPortfolioUrl = '';

  // Ativos de Subscrição
  const originAssetId = crypto.randomUUID();
  const rightAssetId = crypto.randomUUID();

  const originTicker = `SUB${timestamp.toString().slice(-4)}11`;
  const rightTicker = `SUB${timestamp.toString().slice(-4)}12`;

  // Ofertas de Subscrição
  const validOfferId = crypto.randomUUID();
  const expiredOfferId = crypto.randomUUID();

  test.beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL_TEST;
    if (!connectionString) {
      throw new Error('DATABASE_URL_TEST é obrigatória para os testes E2E de subscrição.');
    }

    queryClient = postgres(connectionString);
    const now = new Date();

    // 1. Cria Usuário Admin para ser o createdBy das ofertas
    await queryClient`
      INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at)
      VALUES (${adminUserId}, 'Admin Subscrição', ${`admin_sub_${timestamp}@test.com`}, 'dummy_hash', 'active', ${now}, ${now})
    `;

    // 2. Cria Ativos no Banco (Originador e Direito)
    await queryClient`
      INSERT INTO assets (id, ticker, name, asset_type, market, currency, is_custom, created_at, updated_at)
      VALUES
        (${originAssetId}, ${originTicker}, 'FII Subscrição Origem E2E', 'fii', 'B3', 'BRL', false, ${now}, ${now}),
        (${rightAssetId}, ${rightTicker}, 'Direito de Subscrição FII E2E', 'subscription_right', 'B3', 'BRL', false, ${now}, ${now})
    `;

    // 3. Cria Ofertas de Subscrição (Ativa e Expirada)
    const exerciseEndDateFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const expiredCutOffDate = new Date('2026-01-01T00:00:00.000Z');
    const expiredStartDate = new Date('2026-01-05T00:00:00.000Z');
    const expiredEndDate = new Date('2026-01-20T00:00:00.000Z');

    await queryClient`
      INSERT INTO subscription_offers (
        id, origin_asset_id, right_asset_id, target_asset_id,
        cut_off_date, exercise_start_date, exercise_end_date,
        exercise_price, currency, created_at, updated_at, created_by
      )
      VALUES
        (${validOfferId}, ${originAssetId}, ${rightAssetId}, ${originAssetId},
         '2026-08-01T00:00:00.000Z', '2026-08-05T00:00:00.000Z', ${exerciseEndDateFuture},
         '10.50000000', 'BRL', ${now}, ${now}, ${adminUserId}),
        (${expiredOfferId}, ${originAssetId}, ${rightAssetId}, ${originAssetId},
         ${expiredCutOffDate}, ${expiredStartDate}, ${expiredEndDate},
         '10.00000000', 'BRL', ${now}, ${now}, ${adminUserId})
    `;
  });

  test.afterAll(async () => {
    if (queryClient) {
      await queryClient`DELETE FROM subscription_exercises WHERE subscription_right_id IN (
        SELECT id FROM subscription_rights WHERE offer_id IN (${validOfferId}, ${expiredOfferId})
      )`;
      await queryClient`DELETE FROM portfolio_events WHERE asset_id IN (${originAssetId}, ${rightAssetId})`;
      await queryClient`DELETE FROM subscription_rights WHERE offer_id IN (${validOfferId}, ${expiredOfferId})`;
      await queryClient`DELETE FROM subscription_offers WHERE id IN (${validOfferId}, ${expiredOfferId})`;
      await queryClient`DELETE FROM assets WHERE id IN (${originAssetId}, ${rightAssetId})`;
      await queryClient`DELETE FROM users WHERE id = ${adminUserId}`;
      await queryClient.end();
    }
  });

  // ─── 1. Cadastro do Usuário A e Criação de Carteira ────────────────────────
  test('1. Deve registrar Usuário A, criar carteira e exibir o painel segregado de subscrições', async ({
    page,
  }) => {
    // Cadastro
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Subscrição A');
    await page.fill('#register-email', userAEmail);
    await page.fill('#register-password', defaultPassword);
    await page.fill('#register-confirm-password', defaultPassword);
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Investidor');

    // Navega para carteiras e cria carteira
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');

    await page.fill('#portfolio-name', 'Carteira Subscrição Alfa');
    await page.fill('#portfolio-description', 'Carteira para testes E2E de subscrição');
    await page.click('#portfolio-submit');

    await expect(page.locator('text=Carteira Subscrição Alfa')).toBeVisible();

    // Acessa detalhe da carteira
    await page.click('text=Carteira Subscrição Alfa');
    await page.waitForURL(/\/portfolios\/[0-9a-f-]+/);
    userAPortfolioUrl = page.url();

    // Valida painel de subscrição e mensagem regulatória
    const subPanel = page.locator('[data-testid="subscription-panel"]');
    await expect(subPanel).toBeVisible();
    await expect(subPanel).toContainText('Direitos de Subscrição');
    await expect(subPanel).toContainText('Finalidade: A plataforma organiza e alerta');
    await expect(page.locator('[data-testid="subscriptions-empty-state"]')).toBeVisible();
  });

  // ─── 2. Exibição de Ofertas e Atribuição de Direitos ───────────────────────
  test('2. Deve visualizar ofertas de mercado e atribuir um lote de direitos com custo contábil zero', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#login-email', userAEmail);
    await page.fill('#login-password', defaultPassword);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    await page.goto(userAPortfolioUrl);

    // Abre seção de ofertas disponíveis
    const toggleOffersBtn = page.locator('[data-testid="toggle-available-offers-btn"]');
    if (await toggleOffersBtn.isVisible()) {
      await toggleOffersBtn.click();
      await expect(page.getByText(rightTicker).first()).toBeVisible();
      await expect(page.getByText('R$ 10.50').first()).toBeVisible();
    }

    // Abre modal de atribuição
    await page.click('[data-testid="open-allocate-modal-btn"]');
    await expect(page.locator('#allocate-modal-title')).toBeVisible();
    await expect(page.getByText('Atribuição com Custo Zero')).toBeVisible();

    // Seleciona oferta válida e informa quantidade
    await page.selectOption('#offer-select', validOfferId);
    await expect(page.getByText(originTicker).first()).toBeVisible();
    await expect(page.getByText('R$ 10.50').first()).toBeVisible();

    await page.fill('#allocated-quantity-input', '100');
    await page.click('[data-testid="allocate-submit-btn"]');

    // Modal deve fechar e a tabela deve exibir o direito com status Ativo
    await expect(page.locator('#allocate-modal-title')).toBeHidden();
    await expect(page.getByText(rightTicker).first()).toBeVisible();
    await expect(page.locator('[data-testid="subscription-status-active"]')).toBeVisible();
    await expect(page.getByText('100').first()).toBeVisible();
  });

  // ─── 3. Exercício Parcial e Validação de Anti-Tampering ────────────────────
  test('3. Deve exercer parcialmente o direito, validar ausência de campos editáveis de preço/custo e exibir custo liquidado', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#login-email', userAEmail);
    await page.fill('#login-password', defaultPassword);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    await page.goto(userAPortfolioUrl);

    // Clica no botão "Exercer" do lote
    const exerciseBtn = page.locator('button:has-text("Exercer")').first();
    await expect(exerciseBtn).toBeVisible();
    await exerciseBtn.click();

    // Valida abertura do modal
    await expect(page.locator('#exercise-modal-title')).toBeVisible();

    // ANTI-TAMPERING: Confirma ausência de inputs editáveis para exercisePrice e totalCost
    await expect(page.locator('input[name="exercisePrice"]')).toHaveCount(0);
    await expect(page.locator('input[name="totalCost"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="readonly-exercise-price"]')).toContainText('10.50');

    // Preenche quantidade parcial (40) e taxas (2.50)
    await page.fill('#exercise-quantity-input', '40');
    await page.fill('#exercise-fees-input', '2.50');

    // Submete exercício
    await page.click('[data-testid="exercise-submit-btn"]');

    // Valida tela de sucesso com custo liquidado pelo servidor (40 * 10.50 + 2.50 = 422.50)
    await expect(page.locator('[data-testid="exercise-success-view"]')).toBeVisible();
    await expect(page.locator('[data-testid="exercised-total-cost"]')).toContainText('422,50');

    // Fecha modal de sucesso
    await page.click('[data-testid="exercise-close-success-btn"]');
    await expect(page.locator('#exercise-modal-title')).toBeHidden();

    // Valida atualização do saldo remanescente e status para "Parcialmente Exercido"
    await expect(page.locator('[data-testid="subscription-status-partially_exercised"]')).toBeVisible();
    await expect(page.getByText('60').first()).toBeVisible(); // Saldo remanescente 100 - 40 = 60

    // Valida que o extrato de operações exibe o evento de compra (BUY) gerado
    await expect(page.locator('#portfolio-events-table')).toBeVisible();
    await expect(page.locator('#portfolio-events-table').getByText('Compra').first()).toBeVisible();
  });

  // ─── 4. Cancelamento do Saldo e Bloqueio de Ações ──────────────────────────
  test('4. Deve cancelar o saldo remanescente com justificativa e bloquear ações no lote cancelado mantendo compras anteriores', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#login-email', userAEmail);
    await page.fill('#login-password', defaultPassword);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    await page.goto(userAPortfolioUrl);

    // Clica no botão "Cancelar"
    const cancelBtn = page.locator('button:has-text("Cancelar")').first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Modal de cancelamento
    await expect(page.locator('#cancel-subscription-modal-title')).toBeVisible();
    await expect(page.getByText('Atenção sobre o Cancelamento')).toBeVisible();

    // Preenche motivo de cancelamento
    await page.fill('#cancel-reason-input', 'Cancelamento de teste E2E do saldo remanescente');
    await page.click('[data-testid="cancel-submit-btn"]');

    // Modal deve fechar e status deve mudar para Cancelado
    await expect(page.locator('#cancel-subscription-modal-title')).toBeHidden();

    await expect(page.locator('[data-testid="subscription-status-cancelled"]')).toBeVisible();

    // Bloqueio de Ações: Não deve mais exibir botões "Exercer" ou "Cancelar" no painel de subscrição para o lote cancelado
    const panelLocator = page.locator('[data-testid="subscription-panel"]');
    await expect(panelLocator.locator('button:has-text("Exercer")')).toHaveCount(0);
    await expect(panelLocator.locator('button:has-text("Cancelar")')).toHaveCount(0);

    // Valida que a compra anterior de 40 unidades continua no extrato de operações
    await expect(page.locator('#portfolio-events-table').getByText('Compra').first()).toBeVisible();
  });

  // ─── 5. Proteção Multitenant e Isolamento entre Usuários ───────────────────
  test('5. Deve garantir isolamento multitenant impedindo que Usuário B visualize ou manipule a carteira de Usuário A', async ({
    page,
  }) => {
    // Cadastro do Usuário B
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Subscrição B');
    await page.fill('#register-email', userBEmail);
    await page.fill('#register-password', defaultPassword);
    await page.fill('#register-confirm-password', defaultPassword);
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // Tentativa de acesso direto à URL da carteira do Usuário A
    await page.goto(userAPortfolioUrl);

    // Deve retornar 404 (Not Found) ou redirecionar sem exibir dados confidenciais
    await expect(page.locator(`text=${rightTicker}`)).toHaveCount(0);
    await expect(page.locator('text=Carteira Subscrição Alfa')).toHaveCount(0);
  });
});
