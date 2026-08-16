import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { checkCsrf } from '../../../src/modules/identity/server/csrf';

describe('CSRF Protection (checkCsrf)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createRequest(
    method: string,
    headers: Record<string, string> = {},
    url = 'http://localhost:3000/api/test'
  ): NextRequest {
    return new NextRequest(url, {
      method,
      headers: new Headers(headers),
    });
  }

  // ─── Métodos Seguros / Não-Mutáveis ─────────────────────────────────────────
  describe('Métodos seguros / não-mutáveis (GET, HEAD, OPTIONS)', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('permite %s sem cabeçalhos de origem', (method) => {
      const req = createRequest(method);
      const res = checkCsrf(req);
      expect(res.allowed).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('permite %s mesmo com origin externa', (method) => {
      const req = createRequest(method, { origin: 'https://evil.com' });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(true);
    });
  });

  // ─── Métodos Mutáveis com Header Origin ──────────────────────────────────────
  describe('Métodos mutáveis (POST, PUT, PATCH, DELETE) com Origin', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('permite %s com Origin presente em ALLOWED_ORIGINS', (method) => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br,https://app.carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest(method, { origin: 'https://carteiraexpert.com.br' });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(true);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejeita %s com Origin não cadastrada em ALLOWED_ORIGINS', (method) => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest(method, { origin: 'https://attacker.com' });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Origin 'https://attacker.com' não está na lista");
    });
  });

  // ─── Fallback com Referer ───────────────────────────────────────────────────
  describe('Fallback para Referer quando Origin está ausente', () => {
    it('permite requisição mutável com Referer válido correspondente a ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest('POST', {
        referer: 'https://carteiraexpert.com.br/dashboard/transactions?tab=new',
      });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(true);
    });

    it('rejeita requisição mutável com Referer de domínio não cadastrado', () => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest('POST', {
        referer: 'https://evil-site.com/exploit',
      });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Referer 'https://evil-site.com' não está na lista");
    });

    it('rejeita requisição mutável com Referer malformado/inválido', () => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest('POST', {
        referer: 'invalid-url-without-protocol',
      });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Cabeçalhos de origem (Origin/Referer) ausentes');
    });
  });

  // ─── Ausência de Origin e Referer ───────────────────────────────────────────
  describe('Ausência de cabeçalhos de origem em métodos mutáveis', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'rejeita %s quando Origin e Referer estão ausentes',
      (method) => {
        process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        const req = createRequest(method);
        const res = checkCsrf(req);
        expect(res.allowed).toBe(false);
        expect(res.reason).toBe('Cabeçalhos de origem (Origin/Referer) ausentes em requisição mutável.');
      }
    );
  });

  // ─── Neutralização de Tentativas de Forjamento ───────────────────────────────
  describe('Neutralização de tentativas de forjamento e spoofing de cabeçalhos', () => {
    it('ignora X-Real-IP e X-Forwarded-Host para validação de origem', () => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      process.env.TRUSTED_PROXIES = '10.0.0.1';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      // Atacante envia headers forjados tentando enganar o validador de CSRF
      const req = createRequest('POST', {
        origin: 'https://evil.com',
        host: 'carteiraexpert.com.br',
        'x-real-ip': '10.0.0.1',
        'x-forwarded-host': 'carteiraexpert.com.br',
        'x-forwarded-proto': 'https',
      });

      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Origin 'https://evil.com' não está na lista");
    });

    it('não aceita Host client-controlled como substituto de ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = 'https://carteiraexpert.com.br';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest('POST', {
        origin: 'https://evil-target.com',
        host: 'evil-target.com',
      });

      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
    });
  });

  // ─── Comportamento por Ambiente (Production vs Development) ─────────────────
  describe('Comportamento por ambiente (Production vs Development)', () => {
    it('em produção sem ALLOWED_ORIGINS definida, lista é vazia e rejeita qualquer mutação', () => {
      delete process.env.ALLOWED_ORIGINS;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const req = createRequest('POST', { origin: 'http://localhost:3000' });
      const res = checkCsrf(req);
      expect(res.allowed).toBe(false);
    });

    it('em desenvolvimento sem ALLOWED_ORIGINS, permite portas locais conhecidas', () => {
      delete process.env.ALLOWED_ORIGINS;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

      const validDevOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3005',
        'http://127.0.0.1:3005',
      ];

      for (const devOrigin of validDevOrigins) {
        const req = createRequest('POST', { origin: devOrigin });
        const res = checkCsrf(req);
        expect(res.allowed).toBe(true);
      }

      // Rejeita origens externas mesmo em desenvolvimento
      const reqEvil = createRequest('POST', { origin: 'https://attacker.com' });
      const resEvil = checkCsrf(reqEvil);
      expect(resEvil.allowed).toBe(false);
    });
  });
});
