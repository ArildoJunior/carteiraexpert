import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './modules/identity/domain/session-constants';
import { checkCsrf } from './modules/identity/server/csrf';
import { buildCspHeader, getStaticSecurityHeaders } from './lib/security/headers';

// ─── Rotas públicas ───────────────────────────────────────────────────────────
// Acessíveis sem sessão válida.
const AUTH_FORM_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

const PUBLIC_STATIC_PATHS = new Set([
  '/',
  '/ativos',
  '/acoes',
  '/fiis',
  '/etfs',
  '/bdrs',
  '/simulador',
  '/sitemap.xml',
  '/robots.txt',
  '/api/health',
]);

function isPublicPath(pathname: string): boolean {
  if (AUTH_FORM_PATHS.has(pathname) || PUBLIC_STATIC_PATHS.has(pathname)) {
    return true;
  }
  if (
    pathname.startsWith('/acoes/') ||
    pathname.startsWith('/fiis/') ||
    pathname.startsWith('/etfs/') ||
    pathname.startsWith('/bdrs/')
  ) {
    return true;
  }
  return false;
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function applySecurityHeaders(res: NextResponse, cspHeader: string): NextResponse {
  const staticHeaders = getStaticSecurityHeaders();
  for (const h of staticHeaders) {
    if (!res.headers.has(h.key)) {
      res.headers.set(h.key, h.value);
    }
  }
  if (!res.headers.has('Content-Security-Policy')) {
    res.headers.set('Content-Security-Policy', cspHeader);
  }
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ── Geração de Nonce por requisição para CSP ─────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeader = buildCspHeader({ nonce });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  // ── Rotas públicas do catálogo, landing page, health check e sitemap ───────
  if (isPublicPath(pathname)) {
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(res, cspHeader);
  }

  // ── Rotas de jobs agendados (autenticação server-to-server via CRON_SECRET) ──
  // Agendadores externos (Cloud Scheduler, cron) não possuem origin/referer nem cookies.
  // A autenticação segura e a rejeição de query string ocorrem no Route Handler via validateCronAuth.
  if (pathname.startsWith('/api/jobs/')) {
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(res, cspHeader);
  }

  // ── Proteção CSRF para Route Handlers mutáveis ────────────────────────────
  if (isApiRoute(pathname)) {
    const csrf = checkCsrf(req);
    if (!csrf.allowed) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'Requisição rejeitada: origin inválida.' },
          { status: 403 }
        ),
        cspHeader
      );
    }
  }

  // ── Verificação de sessão (baseada apenas no cookie, sem DB no Edge) ──────
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const hasSessionCookie = Boolean(
    sessionToken && sessionToken.length >= 32 && sessionToken !== 'deleted'
  );

  // ── Redirecionamentos ─────────────────────────────────────────────────────

  // Formulários de autenticação (login, register, etc.)
  if (AUTH_FORM_PATHS.has(pathname)) {
    if (hasSessionCookie && !req.nextUrl.searchParams.has('redirect')) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', req.url)),
        cspHeader
      );
    }
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applySecurityHeaders(res, cspHeader);
  }

  // Rotas protegidas: exige cookie de sessão presente
  if (!hasSessionCookie) {
    if (isApiRoute(pathname)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'Não autorizado.' }, { status: 401 }),
        cspHeader
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return applySecurityHeaders(NextResponse.redirect(url), cspHeader);
  }

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  return applySecurityHeaders(res, cspHeader);
}

// ─── Configuração do matcher ──────────────────────────────────────────────────
// Exclui arquivos estáticos, _next e imagens.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
