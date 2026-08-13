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

// ─── Cookie Options ───────────────────────────────────────────────────────────
export function getSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
