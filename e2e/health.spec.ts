import { test, expect } from '@playwright/test';

test.describe('Health Check e Cabeçalhos de Segurança HTTP (E2E)', () => {
  test('deve carregar a landing page com cabeçalhos de segurança e sem erros de CSP', async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
        cspErrors.push(msg.text());
      }
    });

    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response?.status()).toBe(200);

    // Validação de cabeçalhos de segurança HTTP na resposta
    const headers = response?.headers() || {};
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).not.toContain('unsafe-eval');

    // Validação visual da página e do script anti-FOUC
    await expect(page).toHaveTitle(/CarteiraExpert/);
    await expect(page.locator('h1')).toContainText('Gestão Patrimonial');
    await expect(page.locator('#btn-hero-catalog')).toBeVisible();

    // Confirma que não houve violação de CSP no console
    expect(cspErrors).toEqual([]);
  });

  test('GET /api/health deve responder como liveness probe com status 200 e no-cache', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);

    // Cabeçalhos de controle de cache
    const headers = res.headers();
    expect(headers['cache-control']).toBe('no-store, no-cache, must-revalidate, max-age=0');
    expect(headers['pragma']).toBe('no-cache');

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    // Garante que não há vazamento de credenciais ou detalhes do banco
    expect(body.database).toBeUndefined();
    expect(body.stack).toBeUndefined();
  });

  test('GET /api/health?check=ready deve responder como readiness probe com status 200 e database connected', async ({ request }) => {
    const res = await request.get('/api/health?check=ready');
    expect(res.status()).toBe(200);

    const headers = res.headers();
    expect(headers['cache-control']).toBe('no-store, no-cache, must-revalidate, max-age=0');

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(typeof body.timestamp).toBe('string');
  });

  test('POST /api/health deve ser rejeitado com status 405 Method Not Allowed', async ({ request }) => {
    const res = await request.post('/api/health', {
      data: { ping: true },
    });
    expect(res.status()).toBe(405);

    const headers = res.headers();
    expect(headers['allow']).toBe('GET, HEAD');

    const body = await res.json();
    expect(body.error).toBe('Método não permitido.');
  });
});