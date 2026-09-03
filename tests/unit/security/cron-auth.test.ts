import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateCronAuth } from '@/lib/security/cron-auth';

describe('Autenticação de Jobs Agendados (validateCronAuth)', () => {
  const originalEnv = process.env.CRON_SECRET;
  const TEST_SECRET = 'segredo-de-teste-cron-ultra-seguro-min-32-chars';

  beforeEach(() => {
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it('autentica com sucesso usando Authorization: Bearer <token>', () => {
    const res = validateCronAuth({
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
    });

    expect(res.authenticated).toBe(true);
    expect(res.status).toBe(200);
    expect(res.error).toBeUndefined();
  });

  it('autentica com sucesso usando cabeçalho x-cron-secret', () => {
    const res = validateCronAuth({
      headers: {
        'x-cron-secret': TEST_SECRET,
      },
    });

    expect(res.authenticated).toBe(true);
    expect(res.status).toBe(200);
  });

  it('rejeita com status 400 se o segredo for enviado via query string (URL)', () => {
    const res = validateCronAuth({
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
      url: 'https://app.carteiraexpert.com.br/api/jobs/ingest?secret=meu-segredo',
    });

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toContain('query string');
  });

  it('rejeita com status 400 se cron_secret for enviado via query string', () => {
    const res = validateCronAuth({
      headers: {
        authorization: `Bearer ${TEST_SECRET}`,
      },
      url: 'https://app.carteiraexpert.com.br/api/jobs/ingest?cron_secret=meu-segredo',
    });

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(400);
  });

  it('rejeita com status 401 se nenhum cabeçalho de autenticação for fornecido', () => {
    const res = validateCronAuth({
      headers: {},
    });

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toContain('ausente');
  });

  it('rejeita com status 401 se o token tiver tamanho diferente do esperado', () => {
    const res = validateCronAuth({
      headers: {
        authorization: 'Bearer token-curto',
      },
    });

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toContain('inválida');
  });

  it('rejeita com status 401 se o token tiver mesmo tamanho mas conteúdo divergente', () => {
    const wrongSecret = TEST_SECRET.slice(0, -1) + 'X';
    const res = validateCronAuth({
      headers: {
        authorization: `Bearer ${wrongSecret}`,
      },
    });

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toContain('inválida');
  });

  it('retorna status 500 em produção se o servidor não tiver CRON_SECRET configurado', () => {
    delete process.env.CRON_SECRET;

    const res = validateCronAuth(
      {
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      },
      undefined,
      'production'
    );

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(500);
    expect(res.error).toContain('CRON_SECRET não configurado');
  });

  it('funciona com instância de Headers nativa do Fetch API', () => {
    const headers = new Headers();
    headers.set('authorization', `Bearer ${TEST_SECRET}`);

    const res = validateCronAuth({
      headers,
    });

    expect(res.authenticated).toBe(true);
    expect(res.status).toBe(200);
  });

  it('rejeita com status 401 em desenvolvimento quando CRON_SECRET não estiver configurado no servidor', () => {
    delete process.env.CRON_SECRET;

    const res = validateCronAuth(
      {
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      },
      undefined,
      'development'
    );

    expect(res.authenticated).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toContain('CRON_SECRET não está configurado');
  });
});
