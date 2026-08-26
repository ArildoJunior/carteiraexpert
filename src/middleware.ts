import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './modules/identity/domain/session-constants';
import { checkCsrf } from './modules/identity/server/csrf';

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
  '/sitemap.xml',
  '/robots.txt',
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

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ── Proteção CSRF para Route Handlers mutáveis ────────────────────────────
  if (isApiRoute(pathname)) {
    const csrf = checkCsrf(req);
    if (!csrf.allowed) {
      return NextResponse.json(
        { error: 'Requisição rejeitada: origin inválida.' },
        { status: 403 }
      );
    }
  }

  // ── Verificação de sessão (baseada apenas no cookie, sem DB no Edge) ──────
  // NOTA: O Edge Runtime não pode acessar o PostgreSQL. A validação completa
  // da sessão (tokenHash + expiresAt + revokedAt) ocorre no server-side de
  // cada Server Component / Route Handler via getCurrentUser().
  // O middleware verifica apenas a PRESENÇA do cookie como proteção de rota.
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const hasSessionCookie = Boolean(
    sessionToken && sessionToken.length >= 32 && sessionToken !== 'deleted'
  );

  // ── Redirecionamentos ─────────────────────────────────────────────────────

  // Formulários de autenticação (login, register, etc.)
  if (AUTH_FORM_PATHS.has(pathname)) {
    if (hasSessionCookie && !req.nextUrl.searchParams.has('redirect')) {
      // Usuário já autenticado: redireciona para dashboard
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // Rotas públicas do catálogo, landing page e sitemap
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Rotas protegidas: exige cookie de sessão presente
  if (!hasSessionCookie) {
    // API: retorna 401
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    // Páginas: redireciona para login
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// ─── Configuração do matcher ──────────────────────────────────────────────────
// Exclui arquivos estáticos, _next e imagens.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
