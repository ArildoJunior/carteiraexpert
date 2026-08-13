import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './modules/identity/domain/session-constants';
import { checkCsrf } from './modules/identity/server/csrf';

// ─── Rotas públicas ───────────────────────────────────────────────────────────
// Acessíveis sem sessão válida.
const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

// ─── Rotas de API públicas ────────────────────────────────────────────────────
// Route Handlers que não requerem sessão.
const PUBLIC_API_PREFIXES = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
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

  // Rotas públicas (login, register, etc.)
  if (isPublicPath(pathname)) {
    if (hasSessionCookie && !req.nextUrl.searchParams.has('redirect')) {
      // Usuário já autenticado: redireciona para dashboard
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // Raiz: redireciona para dashboard ou login
  if (pathname === '/') {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.redirect(new URL('/login', req.url));
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
