import { describe, it, expect } from 'vitest';
import {
  buildCspHeader,
  getSecurityHeaders,
  THEME_SCRIPT_SHA256,
} from '../../../src/lib/security/headers';

describe('Cabeçalhos de Segurança HTTP e CSP', () => {
  it('gera cabeçalhos de segurança básicos em desenvolvimento', () => {
    const headers = getSecurityHeaders({ isProduction: false });
    const headerMap = new Map(headers.map((h) => [h.key, h.value]));

    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerMap.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');

    // HSTS não deve estar presente em desenvolvimento HTTP
    expect(headerMap.has('Strict-Transport-Security')).toBe(false);

    // CSP deve estar presente
    expect(headerMap.has('Content-Security-Policy')).toBe(true);
  });

  it('inclui HSTS estrito exclusivamente em produção', () => {
    const headers = getSecurityHeaders({ isProduction: true });
    const headerMap = new Map(headers.map((h) => [h.key, h.value]));

    expect(headerMap.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload'
    );
  });

  describe('Content Security Policy (CSP)', () => {
    it('contém todas as diretivas base exigidas', () => {
      const csp = buildCspHeader({ isProduction: false });

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('NUNCA inclui unsafe-eval', () => {
      const cspDev = buildCspHeader({ isProduction: false });
      expect(cspDev).not.toContain('unsafe-eval');

      const cspProd = buildCspHeader({ isProduction: true });
      expect(cspProd).not.toContain('unsafe-eval');
    });

    it('NUNCA inclui unsafe-inline em script-src', () => {
      const csp = buildCspHeader({ isProduction: false });
      const scriptDirective = csp
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('script-src'));

      expect(scriptDirective).toBeDefined();
      expect(scriptDirective).not.toContain("'unsafe-inline'");
    });

    it('inclui o hash SHA-256 exato do script anti-FOUC em script-src', () => {
      const csp = buildCspHeader();
      expect(csp).toContain(`'${THEME_SCRIPT_SHA256}'`);
    });

    it('adiciona nonce dinâmico quando fornecido', () => {
      const csp = buildCspHeader({ nonce: 'test-nonce-12345' });
      expect(csp).toContain("'nonce-test-nonce-12345'");
    });
  });
});
