import crypto from 'node:crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { sessions } from '../../../lib/db/schema/identity';
import type { Session } from '../domain/user.types';

// ─── Constantes ───────────────────────────────────────────────────────────────
import { SESSION_COOKIE_NAME } from '../domain/session-constants';
export { SESSION_COOKIE_NAME };

const SESSION_TTL_DAYS = 7;

// ─── Geração de Token ─────────────────────────────────────────────────────────
/** Gera token de 32 bytes aleatórios em base64url. */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Calcula hash SHA-256 do token para armazenamento no banco. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Anonimização de IP ───────────────────────────────────────────────────────
/** Anonimiza o endereço IP antes de persistir (LGPD — minimização de dados). */
export function anonymizeIp(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== 'string') return null;
  // IPv4: zera o último octeto
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return ip.replace(/\.\d+$/, '.0');
  }
  // IPv6: preserva apenas o prefixo /48 (primeiros 6 grupos)
  const parts = ip.split(':');
  if (parts.length > 4) {
    return parts.slice(0, 4).join(':') + ':0:0:0:0';
  }
  return null;
}

/** Trunca o User-Agent para no máximo 255 chars. */
export function sanitizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return ua.slice(0, 255);
}

// ─── Criação de Sessão ────────────────────────────────────────────────────────
export interface CreateSessionOptions {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreatedSession {
  token: string; // Texto puro — vai para o cookie
  sessionId: string;
  expiresAt: Date;
}

export async function createSession(
  opts: CreateSessionOptions,
  executor: any = db
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await executor.insert(sessions).values({
    id,
    userId: opts.userId,
    tokenHash,
    ipAddress: anonymizeIp(opts.ip),
    userAgent: sanitizeUserAgent(opts.userAgent),
    expiresAt,
  });

  return { token, sessionId: id, expiresAt };
}

// ─── Validação de Sessão ──────────────────────────────────────────────────────
/** Busca sessão válida pelo token (texto puro do cookie). */
export async function findValidSession(
  token: string
): Promise<Session | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    )
    .limit(1);

  return session ?? null;
}

// ─── Revogação de Sessão ──────────────────────────────────────────────────────
/** Revoga uma sessão específica (logout individual). */
export async function revokeSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoga TODAS as sessões ativas do usuário (reset de senha / suspensão). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

// ─── Contexto de Requisição ───────────────────────────────────────────────────
export interface RequestContext {
  protocol?: string | null;
  host?: string | null;
  origin?: string | null;
}

/**
 * Extrai o contexto de requisição (protocolo, host e origem) a partir de Headers.
 *
 * Regra de Segurança Inviolável:
 * - Cabeçalhos `x-forwarded-host` e `x-forwarded-proto` são SUMARIAMENTE IGNORADOS
 *   em Server Actions para a decisão do atributo `Secure`, pois o peer TCP real não é fornecido.
 * - Apenas o cabeçalho `Host` direto e a URL de `Origin`/`Referer` (quando o host coincidir
 *   estritamente com o Host direto) são utilizados.
 * - Qualquer cabeçalho encaminhado forjado pelo cliente é completamente desconsiderado.
 */
export function extractRequestContext(
  hdrs?: Headers | Record<string, string | string[] | undefined> | null
): RequestContext {
  if (!hdrs) return {};

  const getHeader = (name: string): string | null => {
    if ('get' in hdrs && typeof hdrs.get === 'function') {
      return hdrs.get(name);
    }
    const val =
      (hdrs as Record<string, string | string[] | undefined>)[name] ??
      (hdrs as Record<string, string | string[] | undefined>)[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] ?? null;
    return val ?? null;
  };

  // Host direto da conexão HTTP/1.1 (sempre utilizado, ignorando x-forwarded-host)
  const host = getHeader('host');
  const origin = getHeader('origin') || getHeader('referer');

  let protocol: string | null = null;
  if (origin) {
    try {
      const url = new URL(origin);
      // O protocolo da origin só é aceito se o host da origin for idêntico ao Host direto recebido
      if (host && url.host.toLowerCase() === host.toLowerCase()) {
        protocol = url.protocol.replace(':', '').toLowerCase();
      }
    } catch {
      // URL inválida
    }
  }

  return {
    protocol,
    host: host?.trim().toLowerCase() ?? null,
    origin: origin?.trim().toLowerCase() ?? null,
  };
}

/**
 * Verifica se um host corresponde estritamente ao loopback local.
 */
export function isLocalLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const raw = host.trim().toLowerCase();

  // Trata IPv6 com colchetes: [::1] ou [::1]:3005
  if (raw.startsWith('[')) {
    const closingBracketIndex = raw.indexOf(']');
    if (closingBracketIndex !== -1) {
      const ipv6 = raw.slice(1, closingBracketIndex);
      return ipv6 === '::1';
    }
  }

  // Trata IPv6 sem colchetes: ::1
  if (raw === '::1') {
    return true;
  }

  // Trata hostname ou IPv4 com ou sem porta (ex.: localhost:3005, 127.0.0.1:3005)
  const hostname = raw.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

// ─── Cookie Options ───────────────────────────────────────────────────────────
/**
 * Determina se o atributo `Secure` deve ser aplicado aos cookies de sessão.
 *
 * Política de Segurança Inviolável:
 * 1. Qualquer requisição com protocolo HTTPS: `secure === true` (SEMPRE).
 * 2. Qualquer host de produção ou externo (ex.: carteiraexpert.com.br): `secure === true` (SEMPRE).
 * 3. Ausência de contexto em produção (NODE_ENV=production): `secure === true` (SEMPRE).
 *    Nenhuma variável de ambiente (SECURE_COOKIES, PLAYWRIGHT_TEST, etc.) pode desabilitar
 *    o atributo `Secure` em produção quando o host for externo ou quando não houver contexto.
 * 4. Requisições em host loopback local (localhost, 127.0.0.1, [::1]):
 *    - `secure === false` se protocolo não for HTTPS (permitindo que motores como WebKit
 *      processem cookies em testes e desenvolvimento sobre HTTP local).
 *    - `secure === true` se protocolo for HTTPS.
 * 5. Em desenvolvimento (NODE_ENV=development):
 *    - `secure: true` se `SECURE_COOKIES === 'true'`, senão `false` por padrão.
 */
export function resolveIsSecureCookie(context?: RequestContext): boolean {
  if (context?.host || context?.protocol) {
    const isHttps = context.protocol === 'https';
    if (isHttps) {
      return true;
    }

    const isLocal = isLocalLoopbackHost(context.host);
    const isHttp = context.protocol === 'http';

    // Apenas requisição em host loopback local sem HTTPS recebe secure: false
    if (isLocal && (isHttp || !context.protocol)) {
      return false;
    }

    // Qualquer host que NÃO seja local loopback (ex.: carteiraexpert.com.br)
    // é estritamente obrigatório ter secure: true
    return true;
  }

  // Fallback sem contexto de requisição (ex.: tarefas agendadas, scripts):
  if (process.env.NODE_ENV === 'development') {
    return process.env.SECURE_COOKIES === 'true';
  }

  // Em produção ou qualquer outro ambiente sem contexto: SEMPRE true
  return true;
}

export function getSessionCookieOptions(expiresAt: Date, context?: RequestContext) {
  const isSecure = resolveIsSecureCookie(context);

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function getClearCookieOptions(context?: RequestContext) {
  const isSecure = resolveIsSecureCookie(context);

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
