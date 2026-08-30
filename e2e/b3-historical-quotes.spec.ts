import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';

test.describe('Séries Históricas Oficiais B3 (COTAHIST) — E2E', () => {
  let queryClient: ReturnType<typeof postgres> | null = null;

  test.beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL_TEST;
    if (!connectionString) {
      throw new Error('DATABASE_URL_TEST é obrigatória para os testes E2E.');
    }
    queryClient = postgres(connectionString);
    const now = new Date();

    // 1. Garante ativo global PETR4, VALE3 e BBDC4 no catálogo para as rotas públicas de /acoes
    const globalAssets = [
      { ticker: 'PETR4', name: 'Petróleo Brasileiro S.A. - Petrobras PN', assetType: 'stock' },
      { ticker: 'VALE3', name: 'Vale S.A. ON', assetType: 'stock' },
      { ticker: 'BBDC4', name: 'Banco Bradesco S.A. PN', assetType: 'stock' },
    ];

    for (const item of globalAssets) {
      const assetId = crypto.randomUUID();
      await queryClient`
        INSERT INTO assets (id, ticker, name, asset_type, market, currency, is_custom, user_id, created_at, updated_at)
        VALUES (${assetId}, ${item.ticker}, ${item.name}, ${item.assetType}, 'B3', 'BRL', false, NULL, ${now}, ${now})
        ON CONFLICT (ticker, market) WHERE is_custom = false AND user_id IS NULL DO NOTHING
      `;
    }

    // 2. Insere lote e cotações reais de homologação em b3_historical_quotes caso não existam
    const batchId = crypto.randomUUID();
    const batchSha256 = crypto.randomBytes(32).toString('hex');

    await queryClient`
      INSERT INTO b3_cotahist_batches (
        id, file_name, file_type, reference_date, reference_year, file_size, sha256,
        storage_path, status, total_lines, header_count, quote_count, trailer_count,
        accepted_records, rejected_records, created_at, updated_at
      )
      VALUES (
        ${batchId}, 'COTAHIST_E2E_HOMOLOG.ZIP', 'daily', '2026-08-26', 2026, 1024, ${batchSha256},
        '/test/storage/cotahist.zip', 'COMPLETED', 17042, 1, 17040, 1, 17040, 0, ${now}, ${now}
      )
      ON CONFLICT (sha256) DO NOTHING
    `;

    const quoteHashPetr4 = crypto.randomBytes(32).toString('hex');
    await queryClient`
      INSERT INTO b3_historical_quotes (
        id, batch_id, trade_date, bdi_code, ticker, market_type, short_name,
        specification, forward_term_days, currency, open_price, high_price,
        low_price, average_price, close_price, best_bid_price, best_ask_price,
        trade_count, quantity, financial_volume, strike_price, correction_indicator,
        expiration_date, quotation_factor, strike_points, isin, distribution_number,
        asset_id, record_hash, created_at
      )
      VALUES (
        ${crypto.randomUUID()}, ${batchId}, '2026-08-26', '02', 'PETR4', 10, 'PETROBRAS',
        'PN', NULL, 'BRL', '38.50000000', '39.20000000', '38.10000000', '38.65000000',
        '38.90000000', '38.89000000', '38.90000000', 14500, '25000000.0000000000',
        '966250000.0000000000', NULL, NULL, NULL, 1, NULL, 'BRPETRACNPR6', 120,
        NULL, ${quoteHashPetr4}, ${now}
      )
      ON CONFLICT (record_hash) DO NOTHING
    `;

    const quoteHashBbdc4 = crypto.randomBytes(32).toString('hex');
    await queryClient`
      INSERT INTO b3_historical_quotes (
        id, batch_id, trade_date, bdi_code, ticker, market_type, short_name,
        specification, forward_term_days, currency, open_price, high_price,
        low_price, average_price, close_price, best_bid_price, best_ask_price,
        trade_count, quantity, financial_volume, strike_price, correction_indicator,
        expiration_date, quotation_factor, strike_points, isin, distribution_number,
        asset_id, record_hash, created_at
      )
      VALUES (
        ${crypto.randomUUID()}, ${batchId}, '2026-08-26', '02', 'BBDC4', 10, 'BRADESCO',
        'PN', NULL, 'BRL', '16.78000000', '17.29000000', '16.76000000', '16.90000000',
        '16.99000000', '16.98000000', '16.99000000', 35601, '34729800.0000000000',
        '591886507.0000000000', NULL, NULL, NULL, 1, NULL, 'BRBBDCACNPR8', 130,
        NULL, ${quoteHashBbdc4}, ${now}
      )
      ON CONFLICT (record_hash) DO NOTHING
    `;

    // 3. Insere 15 ações, 15 FIIs e 15 ETFs adicionais para garantir listagens com >= 10 itens
    for (let i = 1; i <= 15; i++) {
      const stockTicker = `E2ESTK${i}`;
      const fiiTicker = `E2EFII${i}11`;
      const etfTicker = `E2EETF${i}11`;

      await queryClient`
        INSERT INTO b3_historical_quotes (
          id, batch_id, trade_date, bdi_code, ticker, market_type, short_name,
          specification, currency, open_price, high_price, low_price, average_price,
          close_price, trade_count, quantity, financial_volume, quotation_factor,
          isin, distribution_number, record_hash, created_at
        ) VALUES
        (
          ${crypto.randomUUID()}, ${batchId}, '2026-08-26', '02', ${stockTicker}, 10, ${'STK ' + i},
          'ON NM', 'BRL', '20.00000000', '21.00000000', '19.00000000', '20.50000000',
          '20.00000000', ${2000 - i * 10}, '100000.0000000000', '2000000.0000000000', 1,
          'BRE2ESTK0001', 100, ${crypto.randomBytes(32).toString('hex')}, ${now}
        ),
        (
          ${crypto.randomUUID()}, ${batchId}, '2026-08-26', '12', ${fiiTicker}, 10, ${'FII ' + i},
          'CI', 'BRL', '100.00000000', '101.00000000', '99.00000000', '100.50000000',
          '100.00000000', ${1500 - i * 10}, '50000.0000000000', '5000000.0000000000', 1,
          'BRE2EFII0001', 100, ${crypto.randomBytes(32).toString('hex')}, ${now}
        ),
        (
          ${crypto.randomUUID()}, ${batchId}, '2026-08-26', '14', ${etfTicker}, 10, ${'ISHARES ETF ' + i},
          'CI', 'BRL', '50.00000000', '51.00000000', '49.00000000', '50.50000000',
          '50.00000000', ${1000 - i * 10}, '30000.0000000000', '1500000.0000000000', 1,
          'BRE2EETF0001', 100, ${crypto.randomBytes(32).toString('hex')}, ${now}
        )
        ON CONFLICT (record_hash) DO NOTHING
      `;
    }
  });

  test.afterAll(async () => {
    if (queryClient) {
      await queryClient.end();
    }
  });

  test('deve navegar até /history?tab=cotahist e visualizar cotações oficiais B3 com filtros e paginação', async ({
    page,
  }) => {
    const userEmail = `e2e_cotahist_${crypto.randomUUID()}@carteiraexpert.test`;
    const userPassword = 'Password123!@#';

    // 1. Cadastrar usuário para autenticação
    await page.goto('/register');
    await page.fill('#register-name', 'Operador E2E Cotahist');
    await page.fill('#register-email', userEmail);
    await page.fill('#register-password', userPassword);
    await page.fill('#register-confirm-password', userPassword);
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // 2. Acessa a página de histórico na aba COTAHIST
    await page.goto('/history?tab=cotahist&ticker=PETR4');
    await expect(page.locator('#history-page-container')).toBeVisible();

    // 3. Confirma cabeçalho e abas
    await expect(page.locator('h1')).toContainText('Séries Históricas Oficiais B3 (COTAHIST)');
    await expect(page.locator('#tab-b3-cotahist')).toBeVisible();
    await expect(page.locator('#tab-user-operations')).toBeVisible();

    // 4. Confirma formulário de busca e atalhos
    await expect(page.locator('#b3-ticker-input')).toHaveValue('PETR4');
    await expect(page.locator('#btn-b3-filter')).toBeVisible();

    // 5. Confirma exibição da tabela de cotações com registros reais
    await expect(page.locator('#b3-quotes-table-container')).toBeVisible();
    await expect(page.locator('#b3-historical-table')).toBeVisible();
    await expect(page.locator('#b3-historical-table')).toContainText('PETR4');

    // 6. Testar busca por ticker BBDC4 e validar segregação
    await page.fill('#b3-ticker-input', 'BBDC4');
    await page.click('#btn-b3-filter');
    await page.waitForURL(/ticker=BBDC4/i);
    await expect(page.locator('#b3-historical-table')).toBeVisible();
    await expect(page.locator('#b3-historical-table')).toContainText('BBDC4');
    await expect(page.locator('#b3-historical-table')).not.toContainText('PETR4');

    // 7. Testar busca por ticker inexistente e validar empty state
    await page.fill('#b3-ticker-input', 'NONEXIST99');
    await page.click('#btn-b3-filter');

    await page.waitForURL(/ticker=NONEXIST99/i);
    await expect(page.locator('#b3-empty-state')).toBeVisible();
    await expect(page.locator('#b3-empty-state')).toContainText('NONEXIST99');
    await expect(page.locator('#b3-historical-table')).not.toBeVisible();
  });

  test('deve exibir a seção de cotações oficiais B3 na página de detalhes do ativo /acoes/PETR4', async ({
    page,
  }) => {
    await page.goto('/acoes/PETR4');
    await expect(page.locator('#asset-detail-ticker')).toContainText('PETR4');

    // Confirma tabela de cotações oficiais B3 renderizada na página do ativo
    await expect(page.locator('text=Cotações Oficiais de Fechamento B3')).toBeVisible();
    await expect(page.locator('#b3-historical-table')).toBeVisible();
    await expect(page.locator('#b3-historical-table')).toContainText('PETR4');
  });

  test('deve alternar os períodos do gráfico (1M, 3M, 6M, 1Y, ALL) em /acoes/PETR4', async ({
    page,
  }) => {
    await page.goto('/acoes/PETR4');
    await expect(page.locator('#asset-detail-ticker')).toContainText('PETR4');

    // Confirma que 1M inicia selecionado
    await expect(page.locator('#period-btn-1M')).toBeVisible();
    await expect(page.locator('#period-btn-3M')).toBeVisible();
    await expect(page.locator('#period-btn-6M')).toBeVisible();
    await expect(page.locator('#period-btn-1Y')).toBeVisible();
    await expect(page.locator('#period-btn-ALL')).toBeVisible();

    // Clica em 3M e valida atualização
    await page.click('#period-btn-3M');
    await expect(page.locator('#period-btn-3M')).toHaveClass(/bg-action-primary/);

    // Clica em 6M e valida atualização
    await page.click('#period-btn-6M');
    await expect(page.locator('#period-btn-6M')).toHaveClass(/bg-action-primary/);

    // Clica em 1Y e valida atualização
    await page.click('#period-btn-1Y');
    await expect(page.locator('#period-btn-1Y')).toHaveClass(/bg-action-primary/);

    // Clica em ALL e valida atualização
    await page.click('#period-btn-ALL');
    await expect(page.locator('#period-btn-ALL')).toHaveClass(/bg-action-primary/);
  });

  test('deve exibir listas iniciais com pelo menos 10 ativos reais em /acoes, /fiis e /etfs', async ({
    page,
  }) => {
    // 1. /acoes
    await page.goto('/acoes');
    await expect(page.locator('h1')).toContainText('Ações Brasileiras');
    const stockRows = page.locator('tbody tr');
    await expect(stockRows.first()).toBeVisible();
    const stockCount = await stockRows.count();
    expect(stockCount).toBeGreaterThanOrEqual(10);

    // 2. /fiis
    await page.goto('/fiis');
    await expect(page.locator('h1')).toContainText('Fundos Imobiliários');
    const fiiRows = page.locator('tbody tr');
    await expect(fiiRows.first()).toBeVisible();
    const fiiCount = await fiiRows.count();
    expect(fiiCount).toBeGreaterThanOrEqual(10);

    // 3. /etfs
    await page.goto('/etfs');
    await expect(page.locator('h1')).toContainText('Fundos de Índice');
    const etfRows = page.locator('tbody tr');
    await expect(etfRows.first()).toBeVisible();
    const etfCount = await etfRows.count();
    expect(etfCount).toBeGreaterThanOrEqual(10);
  });
});

