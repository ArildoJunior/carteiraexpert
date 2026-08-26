import { test, expect } from '@playwright/test';
import postgres from 'postgres';

// ─── Helper: obter token de reset diretamente do banco de dados ───────────────
// Em testes E2E, o token é obtido via acesso direto ao DATABASE_URL_TEST.
// Nenhum endpoint público de teste é criado na aplicação.
async function getLatestResetToken(email: string): Promise<string | null> {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) return null;

  const sql = postgres(connectionString);
  try {
    const rows = await sql<{ id: string; token_hash: string; expires_at: Date }[]>`
      SELECT prt.id, prt.expires_at
      FROM password_reset_tokens prt
      INNER JOIN users u ON u.id = prt.user_id
      WHERE u.email = ${email}
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
      ORDER BY prt.created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    return rows[0].id ?? null;
  } finally {
    await sql.end();
  }
}

// ─── Fluxo de Cadastro ────────────────────────────────────────────────────────
test.describe('Cadastro', () => {
  test('deve exibir o formulário de cadastro em /register', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('h1')).toContainText('Criar conta');
    await expect(page.locator('#register-name')).toBeVisible();
    await expect(page.locator('#register-email')).toBeVisible();
    await expect(page.locator('#register-password')).toBeVisible();
    await expect(page.locator('#register-confirm-password')).toBeVisible();
    await expect(page.locator('#register-submit')).toBeVisible();
  });

  test('deve exibir erros de validação ao submeter formulário vazio', async ({ page }) => {
    await page.goto('/register');
    await page.click('#register-submit');

    // Erros de validação devem aparecer individualmente (evita estritamento do Playwright em seletores múltiplos)
    await expect(page.locator('#register-name-error')).toBeVisible();
    await expect(page.locator('#register-email-error')).toBeVisible();
    await expect(page.locator('#register-password-error')).toBeVisible();
  });

  test('deve completar cadastro com dados válidos e redirecionar para dashboard', async ({
    page,
  }) => {
    await page.goto('/register');

    const email = `e2e-register-${Date.now()}@test.com`;

    await page.fill('#register-name', 'Usuário E2E');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaForte@1');
    await page.fill('#register-confirm-password', 'SenhaForte@1');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');

    // Após cadastro bem-sucedido, redireciona para dashboard
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Olá');
  });
});

// ─── Fluxo de Login ───────────────────────────────────────────────────────────
test.describe('Login', () => {
  test('deve exibir o formulário de login em /login', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Bem-vindo de volta');
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-submit')).toBeVisible();
  });

  test('deve exibir erro para credenciais inválidas', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#login-email', 'invalido@test.com');
    await page.fill('#login-password', 'SenhaErrada@1');
    await page.click('#login-submit');

    // Usa ID específico para evitar colisão com o #next-route-announcer__
    await expect(page.locator('#login-error-alert')).toContainText('Credenciais inválidas');
  });

  test('deve redirecionar usuário autenticado para dashboard', async ({ page }) => {
    // Primeiro cria uma conta
    await page.goto('/register');
    const email = `e2e-login-${Date.now()}@test.com`;
    await page.fill('#register-name', 'Login E2E');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaForte@1');
    await page.fill('#register-confirm-password', 'SenhaForte@1');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Olá');

    // Visita login enquanto autenticado → redireciona para dashboard
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
test.describe('Logout', () => {
  test('deve encerrar sessão e redirecionar para login', async ({ page }) => {
    // Cria conta e autentica
    await page.goto('/register');
    const email = `e2e-logout-${Date.now()}@test.com`;
    await page.fill('#register-name', 'Logout E2E');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'SenhaForte@1');
    await page.fill('#register-confirm-password', 'SenhaForte@1');
    await page.check('#register-terms');
    await page.check('#register-privacy');
    await page.click('#register-submit');
    await page.waitForURL('**/dashboard');
    await expect(page.locator('h1')).toContainText('Olá');

    // Clica no botão Sair
    await page.click('#logout-button');
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    // Tentar voltar ao dashboard redireciona para login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });
});

// ─── Recuperação de Senha ─────────────────────────────────────────────────────
test.describe('Recuperação de Senha', () => {
  test('deve exibir formulário de recuperação em /forgot-password', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.locator('h1')).toContainText('Recuperar senha');
    await expect(page.locator('#forgot-email')).toBeVisible();
    await expect(page.locator('#forgot-submit')).toBeVisible();
  });

  test('deve exibir confirmação padronizada independente do e-mail', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('#forgot-email', 'qualquer@email.com');
    await page.click('#forgot-submit');

    // Usa ID específico para evitar colisão com o #next-route-announcer__
    await expect(page.locator('#forgot-success-alert')).toContainText('E-mail enviado');
  });
});

// ─── Proteção de Rotas ────────────────────────────────────────────────────────
test.describe('Proteção de Rotas', () => {
  test('deve redirecionar /dashboard para /login sem autenticação', async ({ page }) => {
    await page.goto('/dashboard');
    expect(page.url()).toMatch(/\/login(\?.*)?$/);
  });

  test('deve redirecionar /portfolios para /login sem autenticação', async ({ page }) => {
    await page.goto('/portfolios');
    expect(page.url()).toMatch(/\/login(\?.*)?$/);
  });
});
