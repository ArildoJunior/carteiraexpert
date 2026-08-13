import { describe, it, expect, afterEach } from 'vitest';
import {
  generateSessionToken,
  hashToken,
  anonymizeIp,
  sanitizeUserAgent,
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
describe('Cookie Options (getSessionCookieOptions & getClearCookieOptions)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const sampleDate = new Date('2026-12-31T23:59:59.000Z');

  it('em produção sem SECURE_COOKIES, secure deve ser SEMPRE true', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.SECURE_COOKIES;

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

  it('em produção com SECURE_COOKIES=false, secure deve continuar SEMPRE true', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.SECURE_COOKIES = 'false';

    const sessionOpts = getSessionCookieOptions(sampleDate);
    expect(sessionOpts.secure).toBe(true);

    const clearOpts = getClearCookieOptions();
    expect(clearOpts.secure).toBe(true);
  });

  it('em desenvolvimento com SECURE_COOKIES=false, secure deve ser false', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.SECURE_COOKIES = 'false';

    const sessionOpts = getSessionCookieOptions(sampleDate);
    expect(sessionOpts.secure).toBe(false);

    const clearOpts = getClearCookieOptions();
    expect(clearOpts.secure).toBe(false);
  });

  it('em desenvolvimento com SECURE_COOKIES=true, secure deve ser true', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    process.env.SECURE_COOKIES = 'true';

    const sessionOpts = getSessionCookieOptions(sampleDate);
    expect(sessionOpts.secure).toBe(true);

    const clearOpts = getClearCookieOptions();
    expect(clearOpts.secure).toBe(true);
  });
});
