import { test, expect, type Page } from '@playwright/test';

test.describe('Módulo Operacional de Opções (Etapa 8) — E2E', () => {
  async function registerAndLogin(page: Page, name: string): Promise<string> {
    await page.goto('/register');
    const email = `e2e-options-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;

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

  test('deve exibir aviso regulatório CVM/ANBIMA, navegação e calculadora avulsa de Black-Scholes', async ({
    page,
  }) => {
    await registerAndLogin(page, 'Ana Opções');

    // Navega via link na sidebar
    const navLink = page.locator('#nav-link-options').first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await page.waitForURL('**/options');

    // 1. Título e cabeçalho da página
    await expect(page.getByRole('heading', { name: 'Módulo Operacional de Opções' })).toBeVisible();
    await expect(
      page.getByText('Controle descritivo de contratos, alertas de vencimento da B3 e apuração de gregas informativas')
    ).toBeVisible();

    // 2. Banner Regulatório Obrigatório CVM/ANBIMA
    const disclaimer = page.locator('#options-regulatory-disclaimer');
    await expect(disclaimer).toBeVisible();
    await expect(
      page.getByText('Finalidade exclusivamente organizacional, descritiva e educacional')
    ).toBeVisible();
    await expect(
      page.getByText('não recomenda compra, venda ou rolagem de ativos')
    ).toBeVisible();

    // 3. Simulador Avulso de Gregas
    const calcTab = page.locator('#tab-simulador-avulso');
    await expect(calcTab).toBeVisible();
    await calcTab.click();

    await expect(
      page.getByRole('heading', { name: 'Simulador Independente de Black-Scholes e Curvas de Payoff' })
    ).toBeVisible();

    // Preenche parâmetros da simulação avulsa
    await page.fill('#calc-spot', '40.00');
    await page.fill('#calc-strike', '38.00');
    await page.fill('#calc-days', '15');
    await page.fill('#calc-vol', '30.0');
    await page.fill('#calc-rate', '10.5');
    await page.fill('#calc-prem', '2.80');

    // Clica para calcular
    const btnCalc = page.locator('#btn-calcular-avulso');
    await btnCalc.click();

    // Verifica que o card de gregas e o gráfico de payoff renderizam
    await expect(page.locator('#options-greeks-card')).toBeVisible();
    await expect(page.getByText('Delta (Δ)')).toBeVisible();
    await expect(page.getByText('Gamma (Γ)')).toBeVisible();
    await expect(page.getByText('Theta (Θ)')).toBeVisible();
    await expect(page.getByText('Vega (ν)')).toBeVisible();
    await expect(page.getByText('Rho (ρ)')).toBeVisible();
    await expect(page.getByText('Composição Teórica do Preço:')).toBeVisible();

    // Verifica presença da seção de Payoff
    await expect(page.locator('#options-payoff-chart')).toBeVisible();
  });

  test('deve permitir cadastrar contrato de opção e visualizar detalhamento analítico', async ({
    page,
  }) => {
    await registerAndLogin(page, 'Carlos Derivativos');

    // 1. Cria uma carteira primeiro para poder vincular o contrato de opção
    await page.click('#nav-link-portfolios');
    await page.waitForURL('**/portfolios');
    await page.click('#create-first-portfolio-btn');
    await page.fill('#portfolio-name', 'Carteira Opções B3');
    await page.fill('#portfolio-description', 'Carteira para operações de opções');
    await page.click('#portfolio-submit');
    await expect(page.locator('text=Carteira Opções B3')).toBeVisible();

    // 2. Vai para a tela de opções via sidebar
    const navLink = page.locator('#nav-link-options').first();
    await navLink.click();
    await page.waitForURL('**/options');

    // Estado vazio inicial
    await expect(page.getByText('Nenhum contrato de opção encontrado')).toBeVisible();

    // Abre formulário de cadastro
    await page.click('#btn-nova-opcao');

    // Preenche o formulário
    await page.fill('#opt-form-ticker', 'PETRL380');
    await page.click('#opt-form-type-call');
    await page.click('#opt-form-dir-buy');
    await page.fill('#opt-form-strike', '38.00');
    await page.fill('#opt-form-premium', '1.50');
    await page.fill('#opt-form-quantity', '100');

    // Vencimento futuro (dia útil em 2026)
    await page.fill('#opt-form-expiration', '2026-12-18');

    // Submete o formulário
    await page.click('#opt-form-submit');

    // Contrato deve aparecer na lista
    await expect(page.getByText('PETRL380').first()).toBeVisible();
    await expect(page.getByText('Aberta').first()).toBeVisible();

    // Verifica que o card analítico de Gregas e o Payoff aparecem para a opção selecionada
    await expect(page.locator('#options-greeks-card')).toBeVisible();
    await expect(page.locator('#options-payoff-chart')).toBeVisible();
    await expect(page.getByText('Detalhamento Analítico Teórico')).toBeVisible();
  });
});
