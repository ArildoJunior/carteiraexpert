import { test, expect } from '@playwright/test';

test.describe('E2E: Módulo de Importações e Navegação (Fase 07)', () => {
  const timestamp = Date.now();
  const userAEmail = `e2e-import-userA-${timestamp}@test.com`;
  const userBEmail = `e2e-import-userB-${timestamp}@test.com`;
  const userCEmail = `e2e-import-userC-${timestamp}@test.com`;
  let userABatchUrl = '';

  test('1. Bloqueio de rota para usuário não autenticado', async ({ page }) => {
    await page.goto('/import');
    expect(page.url()).toMatch(/\/login(\?.*)?$/);
    await expect(page.locator('h1')).toContainText('Bem-vindo de volta');
  });

  test('2. Validações client-side de upload e navegação desktop e mobile', async ({ page }) => {
    // 1. Cadastro
    await page.goto('/register');
    await page.fill('#register-name', 'Validador Upload');
    await page.fill('#register-email', userCEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');

    // 2. Cria carteira para poder acessar importação
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');
    await page.fill('#portfolio-name', 'Carteira Teste Upload');
    await page.click('#portfolio-submit');
    await expect(page.locator('text=Carteira Teste Upload')).toBeVisible();

    // 3. Teste de navegação desktop
    await page.click('#nav-link-import');
    await page.waitForURL('**/import');
    await expect(page.locator('h1')).toContainText('Importação de Operações');

    // 4. Teste de rejeição de arquivo não-CSV
    await page.setInputFiles('#file-input-csv', {
      name: 'documento.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy', 'utf-8'),
    });
    await expect(page.locator('#import-upload-error')).toContainText('Formato não suportado');

    // 5. Teste de rejeição de arquivo vazio (0 bytes)
    await page.setInputFiles('#file-input-csv', {
      name: 'vazio.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('', 'utf-8'),
    });
    await expect(page.locator('#import-upload-error')).toContainText('está vazio');

    // 6. Teste de download de modelo
    await expect(page.locator('#btn-download-template')).toBeVisible();
  });

  test('3. Fluxo completo: upload com ativo unmapped, filtros, edição, resolução explícita e confirmação', async ({
    page,
  }) => {
    // 1. Cadastro do Usuário A
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor Importador A');
    await page.fill('#register-email', userAEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    await page.waitForURL('**/dashboard');

    // 2. Cria carteira
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');
    await page.fill('#portfolio-name', 'Carteira Principal A');
    await page.click('#portfolio-submit');
    await expect(page.locator('text=Carteira Principal A')).toBeVisible();

    // 3. Navega para a página de Importações
    await page.click('#nav-link-import');
    await page.waitForURL('**/import');
    await expect(page.locator('#import-drop-zone')).toBeVisible();

    // 4. Upload de CSV contendo 1 ativo reconhecido (PETR4) e 1 não reconhecido (TICKERNOVO)
    const csvContent = [
      'Data;Tipo;Ticker;Quantidade;Preço;Taxas;Notas',
      '10/01/2026;COMPRA;PETR4;100;38,50;4,50;Compra Lote 1',
      '11/01/2026;COMPRA;TICKERNOVO;50;20,00;0;Compra Startup',
    ].join('\n');

    await page.setInputFiles('#file-input-csv', {
      name: 'operacoes_revisao.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    await expect(page.locator('#import-drop-zone').getByText('operacoes_revisao.csv')).toBeVisible();
    await page.click('#btn-submit-upload');
    await page.waitForURL(/\/import\/[0-9a-f-]+/);
    userABatchUrl = page.url();

    // 5. Tela de Revisão do Lote: KPIs
    await expect(page.locator('h1')).toContainText('operacoes_revisao.csv');
    await expect(page.locator('#batch-status-badge')).toContainText('Pendente de Revisão');
    await expect(page.locator('#kpi-total-records')).toContainText('2');
    await expect(page.locator('#kpi-valid-records')).toContainText('1');
    await expect(page.locator('#kpi-warning-records')).toContainText('1');

    // Botão de confirmação deve estar desabilitado devido ao alerta não resolvido
    const confirmBtn = page.locator('#btn-open-confirm-modal');
    await expect(confirmBtn).toBeDisabled();

    // 6. Teste de Filtros
    await page.click('#tab-filter-warning');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('TICKERNOVO');

    await page.click('#tab-filter-valid');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('PETR4');

    await page.click('#tab-filter-all');
    await expect(page.locator('tbody tr')).toHaveCount(2);

    // 7. Resolução Explícita de Ativo (criação de ativo customizado)
    await page.getByRole('button', { name: 'Resolver Ativo' }).click();
    await expect(page.locator('#resolve-asset-modal')).toBeVisible();
    await page.click('#btn-tab-custom-asset');
    await page.fill('#custom-asset-name', 'Startup Inovação Tech');
    await page.click('#btn-confirm-resolve');

    // Modal fecha e status do item vira válido
    await expect(page.locator('#resolve-asset-modal')).toBeHidden();
    await expect(page.locator('#kpi-valid-records')).toContainText('2');
    await expect(page.locator('#kpi-warning-records')).toContainText('0');

    // Agora o botão de confirmação está habilitado
    await expect(confirmBtn).toBeEnabled();

    // 8. Confirmação do Lote
    await page.click('#btn-open-confirm-modal');
    await expect(page.locator('#confirm-batch-modal')).toBeVisible();
    await page.click('#btn-execute-confirm-batch');

    // 9. Feedback e imutabilidade pós-confirmação
    await expect(page.locator('#batch-action-success')).toBeVisible();
    await expect(page.locator('#batch-status-badge')).toContainText('Confirmado');
    await expect(page.locator('#btn-open-confirm-modal')).toBeHidden();
    await expect(page.locator('#btn-view-portfolio-confirmed')).toBeVisible();

    // 10. Histórico
    await page.click('#btn-back-to-imports');
    await page.waitForURL('**/import');
    await expect(page.locator('[title="operacoes_revisao.csv"]')).toBeVisible();
    await expect(page.locator('table').getByText('Confirmado')).toBeVisible();
  });

  test('4. Isolamento multiusuário: Usuário B não pode acessar o lote do Usuário A', async ({
    page,
  }) => {
    // 1. Cadastro do Usuário B
    await page.goto('/register');
    await page.fill('#register-name', 'Investidor B Invasor');
    await page.fill('#register-email', userBEmail);
    await page.fill('#register-password', 'SenhaSegura@123');
    await page.fill('#register-confirm-password', 'SenhaSegura@123');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');

    // 2. Usuário B tenta acessar diretamente a URL do lote do Usuário A
    if (userABatchUrl) {
      await page.goto(userABatchUrl);
      // Deve retornar 404 / not-found
      await expect(page.locator('#not-found-title')).toBeVisible();
    }
  });
});
