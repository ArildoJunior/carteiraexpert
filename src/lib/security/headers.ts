/**
 * CarteiraExpert — Cabeçalhos de Segurança HTTP e Content Security Policy (CSP)
 *
 * Define e constrói cabeçalhos de segurança em estrita conformidade com as diretrizes
 * do projeto, garantindo proteção contra XSS, clickjacking, MIME sniffing e vazamentos,
 * sem comprometer scripts de inicialização (anti-FOUC), Recharts ou fontes do sistema.
 */

// Hash SHA-256 exato da string exportada por themeScriptInline em src/lib/theme/theme-script.ts
export const THEME_SCRIPT_SHA256 = 'sha256-oXhU9KFBfrcmCfKwisG+kjco0qCEUcSzqmdq6erNu9E=';

export interface CspOptions {
  nonce?: string;
  isProduction?: boolean;
}

/**
 * Constrói a diretiva Content-Security-Policy (CSP) padronizada do CarteiraExpert.
 *
 * Regras rígidas:
 * - default-src 'self'
 * - script-src 'self' com o hash SHA-256 exato do script anti-FOUC (e nonce dinâmico)
 * - NUNCA utiliza 'unsafe-eval'
 * - NUNCA utiliza 'unsafe-inline' em script-src
 * - style-src 'self' 'unsafe-inline' (necessário para Tailwind CSS e atributos inline de SVG no Recharts)
 * - img-src 'self' data: https:
 * - font-src 'self' https://fonts.gstatic.com
 * - connect-src 'self'
 * - object-src 'none'
 * - base-uri 'self'
 * - frame-ancestors 'none'
 */
export function buildCspHeader(options: CspOptions = {}): string {
  const { nonce } = options;

  const scriptSources = ["'self'", `'${THEME_SCRIPT_SHA256}'`];
  if (nonce) {
    scriptSources.push(`'nonce-${nonce}'`);
  }

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSources,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Retorna os cabeçalhos estáticos de segurança HTTP (sem CSP dinâmico por request).
 */
export function getStaticSecurityHeaders(isProduction = process.env.NODE_ENV === 'production'): Array<{ key: string; value: string }> {
  const headers: Array<{ key: string; value: string }> = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];

  if (isProduction) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
}

/**
 * Retorna a lista completa de cabeçalhos de segurança HTTP configurados para a aplicação.
 */
export function getSecurityHeaders(options: CspOptions = {}): Array<{ key: string; value: string }> {
  const isProd = options.isProduction ?? process.env.NODE_ENV === 'production';
  const csp = buildCspHeader(options);

  return [
    ...getStaticSecurityHeaders(isProd),
    { key: 'Content-Security-Policy', value: csp },
  ];
}
