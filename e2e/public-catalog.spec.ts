import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';

test.describe('Catálogo Público de Ativos — E2E', () => {
  let queryClient: ReturnType<typeof postgres> | null = null;

  test.beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL_TEST;
    if (!connectionString) {
      throw new Error('DATABASE_URL_TEST é obrigatória para os testes E2E de catálogo.');
    }
    queryClient = postgres(connectionString);
    const now = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Garante usuário do sistema para FK created_by em market_quotes
    const seedUserId = crypto.randomUUID();
    await queryClient`
      INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at)
      VALUES (${seedUserId}, 'System Seed', 'system_catalog_seed@carteiraexpert.test', 'dummy_hash', 'active', ${now}, ${now})
      ON CONFLICT (email) DO NOTHING
    `;

    const [systemUser] = await queryClient`
      SELECT id FROM users WHERE email = 'system_catalog_seed@carteiraexpert.test' LIMIT 1
    `;
    const systemUserId = systemUser?.id || seedUserId;

    const globalAssets = [
      {
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A. - Petrobras PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
      },
      {
        ticker: 'VALE3',
        name: 'Vale S.A. ON',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
      },
      {
        ticker: 'ITUB4',
        name: 'Itaú Unibanco Holding S.A. PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
      },
      {
        ticker: 'BBDC4',
        name: 'Banco Bradesco S.A. PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
      },
      {
        ticker: 'KNIP11',
        name: 'Kinea Rendimentos Imobiliários FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
      },
      {
        ticker: 'IVVB11',
        name: 'iShares S&P 500 Fundo de Índice (ETF)',
        assetType: 'etf',
        market: 'B3',
        currency: 'BRL',
      },
    ];

    for (const item of globalAssets) {
      const assetId = crypto.randomUUID();
      await queryClient`
        INSERT INTO assets (id, ticker, name, asset_type, market, currency, is_custom, user_id, created_at, updated_at)
        VALUES (${assetId}, ${item.ticker}, ${item.name}, ${item.assetType}, ${item.market}, ${item.currency}, false, NULL, ${now}, ${now})
        ON CONFLICT (ticker, market) WHERE is_custom = false AND user_id IS NULL DO NOTHING
      `;

      const [persistedAsset] = await queryClient`
        SELECT id FROM assets
        WHERE ticker = ${item.ticker} AND is_custom = false AND user_id IS NULL
        LIMIT 1
      `;
      const persistedAssetId = persistedAsset?.id || assetId;

      if (item.ticker === 'PETR4') {
        await queryClient`
          INSERT INTO market_quotes (id, asset_id, price, currency, quote_date, source, delay_status, created_by, created_at, updated_at)
          VALUES
            (${crypto.randomUUID()}, ${persistedAssetId}, '38.50', 'BRL', ${now}, 'brapi', 'delayed_15m', ${systemUserId}, ${now}, ${now}),
            (${crypto.randomUUID()}, ${persistedAssetId}, '37.00', 'BRL', ${yesterday}, 'brapi', 'eod', ${systemUserId}, ${yesterday}, ${yesterday})
          ON CONFLICT (asset_id, quote_date) DO NOTHING
        `;
      }
    }
  });

  test.afterAll(async () => {
    if (queryClient) {
      await queryClient.end();
    }
  });
  test('deve navegar na Landing Page e acessar as categorias do catálogo', async ({ page }) => {
    await page.goto('/');

    // 1. Verifica elementos institucionais da Home
    await expect(page).toHaveTitle(/CarteiraExpert/);
    await expect(page.locator('h1')).toContainText('Gestão Patrimonial');
    await expect(page.locator('#btn-hero-catalog')).toBeVisible();

    // 2. Clica no card de Ações
    await page.click('#card-category-b3');
    await page.waitForURL('**/acoes');
    await expect(page.locator('h1')).toContainText('Ações Brasileiras');

    // 3. Navega pelas abas de categoria
    await page.click('#tab-category-fii');
    await page.waitForURL('**/fiis');
    await expect(page.locator('h1')).toContainText('Fundos Imobiliários');

    await page.click('#tab-category-etf');
    await page.waitForURL('**/etfs');
    await expect(page.locator('h1')).toContainText('Fundos de Índice');

    await page.click('#tab-category-bdr');
    await page.waitForURL('**/bdrs');
    await expect(page.locator('h1')).toContainText('BDRs');
  });

  test('deve exibir o estado vazio informativo na listagem de BDRs', async ({ page }) => {
    await page.goto('/bdrs');
    await expect(page.locator('#catalog-empty-state')).toBeVisible();
    await expect(page.locator('#catalog-empty-state')).toContainText('Nenhum BDR cadastrado no catálogo interno');
  });

  test('deve buscar ativo por ticker e abrir a página de detalhes', async ({ page }) => {
    await page.goto('/acoes');

    // Busca por PETR4
    await page.fill('#input-catalog-search', 'PETR4');
    await page.click('#btn-catalog-search-submit');

    // Aguarda atualização da URL com o parâmetro de busca
    await page.waitForURL(/(\?|&)query=PETR4/);
    await expect(page.locator('#row-asset-PETR4')).toBeVisible();

    // Clica para ver detalhes
    await page.click('#link-view-PETR4');
    await page.waitForURL('**/acoes/PETR4');

    // Valida elementos da página de detalhe
    await expect(page.locator('#asset-detail-ticker')).toHaveText('PETR4');
    await expect(page.locator('#metric-latest-price')).toBeVisible();
    await expect(page.locator('#metric-daily-variation')).toBeVisible();
  });

  test('deve redirecionar usuário anônimo para login ao clicar em Lançar em Carteira', async ({
    page,
  }) => {
    await page.goto('/acoes/PETR4');

    const launchBtn = page.locator('#btn-launch-operation-unauth');
    await expect(launchBtn).toBeVisible();
    await launchBtn.click();

    await page.waitForURL(/\/login\?callbackUrl=%2Facoes%2FPETR4/);
  });

  test('deve exibir página 404 para ativo inexistente', async ({ page }) => {
    await page.goto('/acoes/TICKERINVALIDO99');
    await expect(page.locator('#not-found-title')).toBeVisible();
  });

  test('deve permitir lançamento em carteira própria para usuário autenticado com ativo pré-selecionado', async ({
    page,
  }) => {
    // 1. Cadastra novo usuário
    const uniqueEmail = `catalog-e2e-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Catálogo');
    await page.fill('#register-email', uniqueEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // 2. Cria uma carteira
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');
    await expect(page.locator('#portfolio-modal-title')).toBeVisible();

    await page.fill('#portfolio-name', 'Carteira E2E Catálogo');
    await page.click('#portfolio-submit');
    await expect(page.locator('text=Carteira E2E Catálogo')).toBeVisible();

    // 3. Navega para a página pública da ação PETR4
    await page.goto('/acoes/PETR4');
    await expect(page.locator('#btn-open-launch-dialog')).toBeVisible();

    // 4. Clica em Lançar em Carteira
    await page.click('#btn-open-launch-dialog');
    await expect(page.locator('#select-portfolio-for-launch')).toBeVisible();

    // 5. Confirma seleção de carteira e abre modal de operação
    await page.click('#btn-confirm-portfolio-and-open-form');
    await expect(page.locator('#transaction-modal')).toBeVisible();

    // 6. Preenche dados da compra
    await page.fill('#transaction-quantity', '100');
    await page.fill('#transaction-unit-price', '38.50');
    await page.click('#transaction-submit');

    // 7. Confirma que a operação foi registrada e exibiu o banner de sucesso
    await expect(page.locator('#launch-success-banner')).toBeVisible();
    await expect(page.locator('#launch-success-banner')).toContainText('PETR4 registrada com sucesso');
  });
});
