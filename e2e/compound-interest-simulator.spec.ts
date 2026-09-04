import { test, expect } from '@playwright/test';

test.describe('Simulador de Juros Compostos e Aportes (Etapa 7) — E2E', () => {
  test('deve carregar a página /simulador com premissas default, KPIs e aviso CVM', async ({ page }) => {
    await page.goto('/simulador');

    // Título e cabeçalho da página
    await expect(page.getByRole('heading', { name: 'Simulador de Juros Compostos e Aportes' })).toBeVisible();
    await expect(page.getByText('Motor 100% Determinístico em Decimal')).toBeVisible();

    // Valores padrão nos inputs
    const initialCapitalInput = page.locator('#sim-initial-capital');
    const monthlyContributionInput = page.locator('#sim-monthly-contribution');
    const annualRateInput = page.locator('#sim-annual-rate');

    await expect(initialCapitalInput).toHaveValue('10000');
    await expect(monthlyContributionInput).toHaveValue('1000');
    await expect(annualRateInput).toHaveValue('10.0');

    // Cards de KPIs principais
    await expect(page.getByText('Patrimônio Final (Nominal)')).toBeVisible();
    await expect(page.getByText('Patrimônio Final (Poder de Compra Real)')).toBeVisible();
    await expect(page.getByText('Total Efetivamente Aportado')).toBeVisible();
    await expect(page.getByText('Total em Juros Acumulados')).toBeVisible();

    // Aviso CVM
    await expect(page.getByText('Aviso Regulatório e Educacional (CVM)')).toBeVisible();
    await expect(page.getByText('Não constituem garantia de rentabilidade, promessa de retorno, nem recomendação de investimento')).toBeVisible();
  });

  test('deve recalcular valores dinamicamente ao alterar os parâmetros de simulação', async ({ page }) => {
    await page.goto('/simulador');

    const input = page.locator('#sim-monthly-contribution');
    await input.click();
    await input.fill('');
    await input.pressSequentially('2500');

    // Em 10 anos (120 meses), 2500 * 120 = 300.000 + 10.000 inicial = 310.000,00 aportado
    await expect(page.getByText('R$ 310.000,00').first()).toBeVisible();
  });

  test('deve permitir alternar a visualização da tabela entre Resumo Anual e Todos os Meses', async ({ page }) => {
    await page.goto('/simulador');

    const btnMonthly = page.locator('#btn-table-monthly');
    await btnMonthly.click();

    // Deve exibir o primeiro mês detalhado
    const table = page.locator('#table-projections');
    await expect(table.getByRole('cell', { name: 'Mês 1', exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'Mês 2', exact: true })).toBeVisible();

    // Alterna de volta para anual
    const btnAnnual = page.locator('#btn-table-annual');
    await btnAnnual.click();

    await expect(table.getByRole('cell', { name: 'Mês 12 (Ano 1)' })).toBeVisible();
  });

  test('deve ser acessível através do link Simulador na barra de navegação pública', async ({ page }) => {
    await page.goto('/');

    const navLink = page.locator('#nav-quick-link-simulador');
    await expect(navLink).toBeVisible();
    await navLink.click();

    await expect(page).toHaveURL('/simulador');
    await expect(page.getByRole('heading', { name: 'Simulador de Juros Compostos e Aportes' })).toBeVisible();
  });
});
