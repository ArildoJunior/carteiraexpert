import { describe, it, expect } from 'vitest';
import {
  generateSessionToken,
  hashToken,
  anonymizeIp,
  sanitizeUserAgent,
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
