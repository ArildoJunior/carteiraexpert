import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { hashPassword } from '../src/modules/identity/domain/password';

test.describe('Consentimentos (E2E)', () => {
  let queryClient: ReturnType<typeof postgres> | null = null;
  let testUserId: string | null = null;
  const legacyEmail = `legacy.terms.${Date.now()}@carteiraexpert.invalid`;
  const legacyPassword = 'Password123!';

  test.beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL_TEST;
    if (connectionString) {
      queryClient = postgres(connectionString);
      testUserId = crypto.randomUUID();
      const passwordHash = await hashPassword(legacyPassword);
      // Cria usuário SEM registros na tabela user_consents para simular aceite pendente
      await queryClient`
        INSERT INTO users (id, name, email, password_hash, status, created_at, updated_at)
        VALUES (${testUserId}, 'Legacy Terms User', ${legacyEmail}, ${passwordHash}, 'active', NOW(), NOW())
      `;
    }
  });

  test.afterAll(async () => {
    if (queryClient && testUserId) {
      await queryClient`DELETE FROM sessions WHERE user_id = ${testUserId}`;
      await queryClient`DELETE FROM audit_logs WHERE actor_id = ${testUserId}`;
      await queryClient`DELETE FROM users WHERE id = ${testUserId}`;
      await queryClient.end();
    }
  });

  test('Deve impedir o cadastro se checkboxes obrigatórios não forem marcados', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('#register-name', 'E2E Consent User');
    await page.fill('#register-email', `e2e.consent.${Date.now()}@carteiraexpert.invalid`);
    await page.fill('#register-password', 'Teste123!');
    await page.fill('#register-confirm-password', 'Teste123!');
    
    // Sem marcar os checkboxes
    await page.click('#register-submit');
    
    await expect(page.locator('#register-terms-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#register-privacy-error')).toBeVisible();
  });

  test('Deve redirecionar /terms-acceptance para /login se o usuário não estiver autenticado', async ({ page }) => {
    await page.goto('/terms-acceptance');
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test('Deve permitir que usuário na tela de termos faça logout pelo botão Sair', async ({ page }) => {
    // 1. Fazer login com o usuário legado (sem consentimento vigente)
    await page.goto('/login');
    await page.fill('#login-email', legacyEmail);
    await page.fill('#login-password', legacyPassword);
    await page.click('#login-submit');

    // 2. O DashboardLayout deve interceptar e redirecionar para /terms-acceptance
    await page.waitForURL('**/terms-acceptance');
    await expect(page).toHaveURL(/.*\/terms-acceptance.*/);
    await expect(page.locator('#terms-logout-button')).toBeVisible();

    // 3. Fazer logout a partir do botão Sair na tela de termos (#terms-logout-button)
    await page.click('#terms-logout-button');
    await expect(page).toHaveURL(/.*\/login.*/);

    // 4. Confirmar que a sessão foi destruída ao tentar acessar /dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*\/login.*/);
  });
});
