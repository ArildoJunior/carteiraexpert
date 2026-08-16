import { describe, it, expect, afterEach } from 'vitest';
import {
  generateSessionToken,
  hashToken,
  anonymizeIp,
  sanitizeUserAgent,
  resolveIsSecureCookie,
  extractRequestContext,
  isLocalLoopbackHost,
  getSessionCookieOptions,
  getClearCookieOptions,
} from '../../../src/modules/identity/server/session';

// ─── generateSessionToken ─────────────────────────────────────────────────────
describe('generateSessionToken', () => {
  it('gera um token não-vazio', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it('gera tokens únicos em chamadas consecutivas', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });

  it('usa apenas caracteres base64url seguros', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── hashToken ────────────────────────────────────────────────────────────────
describe('hashToken', () => {
  it('gera um hash hex de 64 caracteres (SHA-256)', () => {
    const hash = hashToken('token-de-teste');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('é determinístico: mesma entrada → mesmo hash', () => {
    const token = 'token-fixo-para-teste';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('gera hashes diferentes para tokens diferentes', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});

// ─── anonymizeIp ─────────────────────────────────────────────────────────────
describe('anonymizeIp', () => {
  it('zera o último octeto de um IPv4', () => {
    expect(anonymizeIp('192.168.1.123')).toBe('192.168.1.0');
  });

  it('preserva os primeiros 4 grupos de um IPv6', () => {
    const result = anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    expect(result).toBe('2001:0db8:85a3:0000:0:0:0:0');
  });

  it('retorna null para IP null', () => {
    expect(anonymizeIp(null)).toBeNull();
  });

  it('retorna null para IP undefined', () => {
    expect(anonymizeIp(undefined)).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(anonymizeIp('')).toBeNull();
  });
});

// ─── sanitizeUserAgent ────────────────────────────────────────────────────────
describe('sanitizeUserAgent', () => {
  it('trunca User-Agent para 255 caracteres', () => {
    const longo = 'A'.repeat(500);
    expect(sanitizeUserAgent(longo)?.length).toBe(255);
  });

  it('retorna string intacta se menor ou igual a 255 chars', () => {
    const curto = 'Mozilla/5.0 (Windows NT 10.0; Win64)';
    expect(sanitizeUserAgent(curto)).toBe(curto);
  });

  it('retorna null para undefined', () => {
    expect(sanitizeUserAgent(undefined)).toBeNull();
  });

  it('retorna null para null', () => {
    expect(sanitizeUserAgent(null)).toBeNull();
  });
});

// ─── Cookie Options ───────────────────────────────────────────────────────────
describe('Cookie Options (resolveIsSecureCookie, extractRequestContext, isLocalLoopbackHost, getSessionCookieOptions & getClearCookieOptions)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const sampleDate = new Date('2026-12-31T23:59:59.000Z');

  describe('isLocalLoopbackHost', () => {
    it('reconhece hosts de loopback válidos (com ou sem porta)', () => {
      expect(isLocalLoopbackHost('localhost')).toBe(true);
      expect(isLocalLoopbackHost('localhost:3000')).toBe(true);
      expect(isLocalLoopbackHost('localhost:3005')).toBe(true);
      expect(isLocalLoopbackHost('127.0.0.1')).toBe(true);
      expect(isLocalLoopbackHost('127.0.0.1:3005')).toBe(true);
      expect(isLocalLoopbackHost('::1')).toBe(true);
      expect(isLocalLoopbackHost('[::1]')).toBe(true);
      expect(isLocalLoopbackHost('[::1]:3005')).toBe(true);
    });

    it('rejeita hosts externos, subdomínios maliciosos e IPs não loopback', () => {
      expect(isLocalLoopbackHost('carteiraexpert.com.br')).toBe(false);
      expect(isLocalLoopbackHost('app.carteiraexpert.com.br')).toBe(false);
      expect(isLocalLoopbackHost('localhost.evil.com')).toBe(false);
      expect(isLocalLoopbackHost('evil-localhost.com')).toBe(false);
      expect(isLocalLoopbackHost('192.168.1.10')).toBe(false);
      expect(isLocalLoopbackHost('10.0.0.1')).toBe(false);
      expect(isLocalLoopbackHost(null)).toBe(false);
      expect(isLocalLoopbackHost(undefined)).toBe(false);
      expect(isLocalLoopbackHost('')).toBe(false);
    });
  });

  describe('extractRequestContext e proteção contra cabeçalhos forjados', () => {
    it('ignora sumariamente x-forwarded-host e x-forwarded-proto mesmo com X-Forwarded-For em TRUSTED_PROXIES', () => {
      (process.env as Record<string, string | undefined>).TRUSTED_PROXIES = '10.0.0.1,192.168.1.1';

      const hdrs = new Headers({
        'x-forwarded-for': '10.0.0.1', // IP supostamente de proxy confiável
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'localhost:3000',
        host: 'carteiraexpert.com.br',
        origin: 'https://carteiraexpert.com.br',
      });

      const ctx = extractRequestContext(hdrs);
      // X-Forwarded-Host e X-Forwarded-Proto são ignorados em Server Actions
      expect(ctx.host).toBe('carteiraexpert.com.br');
      expect(ctx.protocol).toBe('https');
      expect(resolveIsSecureCookie(ctx)).toBe(true);
    });

    it('cliente externo enviando x-forwarded-host=localhost é neutralizado e retorna secure === true', () => {
      const hdrs = new Headers({
        'x-forwarded-host': 'localhost:3000',
        'x-forwarded-proto': 'http',
        host: 'carteiraexpert.com.br',
      });

      const ctx = extractRequestContext(hdrs);
      expect(ctx.host).toBe('carteiraexpert.com.br');
      expect(resolveIsSecureCookie(ctx)).toBe(true);
    });

    it('cliente externo enviando x-forwarded-proto=http com host externo resulta em secure === true', () => {
      const hdrs = new Headers({
        'x-forwarded-proto': 'http',
        host: 'carteiraexpert.com.br',
      });

      const ctx = extractRequestContext(hdrs);
      expect(resolveIsSecureCookie(ctx)).toBe(true);
    });

    it('cliente externo enviando Origin de localhost contra host de produção tem o protocolo descartado', () => {
      const hdrs = new Headers({
        host: 'carteiraexpert.com.br',
        origin: 'http://localhost:3000',
      });

      const ctx = extractRequestContext(hdrs);
      expect(ctx.host).toBe('carteiraexpert.com.br');
      expect(ctx.protocol).toBeNull(); // Não herda 'http' de origin não-correspondente
      expect(resolveIsSecureCookie(ctx)).toBe(true);
    });

    it('extrai protocolo de origin legítima em desenvolvimento local quando origin coincide com host direto', () => {
      const hdrs = new Headers({
        host: 'localhost:3005',
        origin: 'http://localhost:3005',
      });

      const ctx = extractRequestContext(hdrs);
      expect(ctx.protocol).toBe('http');
      expect(ctx.host).toBe('localhost:3005');
      expect(resolveIsSecureCookie(ctx)).toBe(false);
    });

    it('trata headers ausentes ou nulos sem falhar', () => {
      expect(extractRequestContext(null)).toEqual({});
      expect(extractRequestContext(undefined)).toEqual({});
    });
  });

  describe('resolveIsSecureCookie e blindagem de produção', () => {
    it('em produção sem contexto, secure deve ser SEMPRE true independentemente de variáveis de ambiente', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.SECURE_COOKIES = 'false';
      process.env.PLAYWRIGHT_TEST = 'true';
      process.env.APP_ENV = 'e2e';
      process.env.CI = 'true';

      // Nenhuma combinação de variáveis desabilita secure em produção sem contexto de requisição
      expect(resolveIsSecureCookie()).toBe(true);

      const sessionOpts = getSessionCookieOptions(sampleDate);
      expect(sessionOpts.secure).toBe(true);
      expect(sessionOpts.httpOnly).toBe(true);
      expect(sessionOpts.sameSite).toBe('lax');
      expect(sessionOpts.path).toBe('/');
      expect(sessionOpts.expires).toEqual(sampleDate);

      const clearOpts = getClearCookieOptions();
      expect(clearOpts.secure).toBe(true);
      expect(clearOpts.httpOnly).toBe(true);
      expect(clearOpts.sameSite).toBe('lax');
      expect(clearOpts.path).toBe('/');
      expect(clearOpts.maxAge).toBe(0);
    });

    it('em produção com host externo (ex.: carteiraexpert.com.br), secure é SEMPRE true mesmo com HTTP', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.SECURE_COOKIES = 'false';
      process.env.PLAYWRIGHT_TEST = 'true';

      const ctxHttp = { host: 'carteiraexpert.com.br', protocol: 'http' };
      expect(resolveIsSecureCookie(ctxHttp)).toBe(true);

      const ctxHttps = { host: 'carteiraexpert.com.br', protocol: 'https' };
      expect(resolveIsSecureCookie(ctxHttps)).toBe(true);

      const ctxSubdomain = { host: 'app.carteiraexpert.com.br', protocol: 'https' };
      expect(resolveIsSecureCookie(ctxSubdomain)).toBe(true);
    });

    it('qualquer requisição HTTPS resulta em secure === true (inclusive em localhost)', () => {
      expect(resolveIsSecureCookie({ host: 'localhost:3005', protocol: 'https' })).toBe(true);
      expect(resolveIsSecureCookie({ host: '127.0.0.1:3005', protocol: 'https' })).toBe(true);
      expect(resolveIsSecureCookie({ protocol: 'https' })).toBe(true);
    });

    it('requisição HTTP em host loopback local (localhost ou 127.0.0.1) resulta em secure === false', () => {
      expect(resolveIsSecureCookie({ host: 'localhost:3005', protocol: 'http' })).toBe(false);
      expect(resolveIsSecureCookie({ host: '127.0.0.1:3005', protocol: 'http' })).toBe(false);
      expect(resolveIsSecureCookie({ host: '[::1]:3005', protocol: 'http' })).toBe(false);
      expect(resolveIsSecureCookie({ host: 'localhost:3005' })).toBe(false);

      const sessionOpts = getSessionCookieOptions(sampleDate, { host: 'localhost:3005', protocol: 'http' });
      expect(sessionOpts.secure).toBe(false);
      expect(sessionOpts.httpOnly).toBe(true);

      const clearOpts = getClearCookieOptions({ host: 'localhost:3005', protocol: 'http' });
      expect(clearOpts.secure).toBe(false);
      expect(clearOpts.httpOnly).toBe(true);
    });

    it('em desenvolvimento sem contexto e sem SECURE_COOKIES, secure é false', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.SECURE_COOKIES;

      expect(resolveIsSecureCookie()).toBe(false);
    });

    it('em desenvolvimento sem contexto com SECURE_COOKIES=true, secure é true', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      process.env.SECURE_COOKIES = 'true';

      expect(resolveIsSecureCookie()).toBe(true);
    });

    it('opções de emissão e limpeza são coerentes entre si para o mesmo contexto', () => {
      const contexts = [
        undefined,
        { host: 'localhost:3005', protocol: 'http' },
        { host: 'carteiraexpert.com.br', protocol: 'https' },
      ];

      for (const ctx of contexts) {
        const sessionOpts = getSessionCookieOptions(sampleDate, ctx);
        const clearOpts = getClearCookieOptions(ctx);

        expect(sessionOpts.httpOnly).toBe(clearOpts.httpOnly);
        expect(sessionOpts.sameSite).toBe(clearOpts.sameSite);
        expect(sessionOpts.path).toBe(clearOpts.path);
        expect(sessionOpts.secure).toBe(clearOpts.secure);
      }
    });
  });
});
