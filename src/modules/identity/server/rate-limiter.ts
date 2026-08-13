import crypto from 'node:crypto';
import { eq, and, lt, isNull, lte } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { authRateLimits } from '../../../lib/db/schema/identity';

// ─── Configuração ─────────────────────────────────────────────────────────────
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5; // 5ª falha inicia bloqueio; 6ª é rejeitada por isBlocked()

const RESET_PER_IP_LIMIT = 3;
const RESET_WINDOW_HOURS = 1;

// ─── Chave HMAC-SHA256 ────────────────────────────────────────────────────────
// Derivada de AUTH_RATE_LIMIT_SECRET + tipo de operação + IP + e-mail.
// Nunca armazena o IP em texto puro como registro histórico.
function buildKey(
  action: 'login' | 'reset:ip' | 'reset:email',
  identifier: string
): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET ?? '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${action}:${identifier}`)
    .digest('hex');
}

// ─── Chaves Públicas (para chamadores) ───────────────────────────────────────
export function loginKey(ip: string, email: string): string {
  return buildKey('login', `ip:${ip}:email:${email}`);
}

export function resetByIpKey(ip: string): string {
  return buildKey('reset:ip', `ip:${ip}`);
}

export function resetByEmailKey(email: string): string {
  return buildKey('reset:email', `email:${email}`);
}

// ─── isBlocked ────────────────────────────────────────────────────────────────
// Verificação prévia ao login. Não altera estado.
// Retorna { isBlocked: true, blockedUntil } se o IP/e-mail ainda estiver bloqueado.
export interface IsBlockedResult {
  isBlocked: boolean;
  blockedUntil: Date | null;
}

export async function isBlocked(key: string): Promise<IsBlockedResult> {
  const now = new Date();
  const [record] = await db
    .select({ blockedUntil: authRateLimits.blockedUntil })
    .from(authRateLimits)
    .where(eq(authRateLimits.key, key))
    .limit(1);

  if (!record) return { isBlocked: false, blockedUntil: null };
  if (!record.blockedUntil || record.blockedUntil <= now) {
    return { isBlocked: false, blockedUntil: null };
  }
  return { isBlocked: true, blockedUntil: record.blockedUntil };
}

// ─── recordFailure ────────────────────────────────────────────────────────────
// Chamada APENAS quando a autenticação falhar.
// Regra: 5ª falha acumula o bloqueio. A 6ª tentativa é interceptada por isBlocked().
//
// Ordem de avaliação em blocked_until:
//   1. Janela expirada → NULL (reseta)
//   2. attempts + 1 >= MAX_FAILURES → NOW() + 15 min (inicia bloqueio)
//   3. Caso contrário → mantém valor atual
export interface RecordFailureResult {
  attempts: number;
  blockedUntil: Date | null;
}

export async function recordFailure(key: string): Promise<RecordFailureResult> {
  const id = crypto.randomUUID();
  const windowMs = WINDOW_MINUTES * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const result = await db.execute(
    `INSERT INTO auth_rate_limits (id, key, attempts, first_attempt_at, blocked_until)
     VALUES ('${id}', '${key}', 1, NOW(), NULL)
     ON CONFLICT (key) DO UPDATE
     SET attempts = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN 1
           ELSE auth_rate_limits.attempts + 1
         END,
         first_attempt_at = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN NOW()
           ELSE auth_rate_limits.first_attempt_at
         END,
         blocked_until = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN NULL
           WHEN auth_rate_limits.attempts + 1 >= ${MAX_FAILURES} THEN NOW() + INTERVAL '${WINDOW_MINUTES} minutes'
           ELSE auth_rate_limits.blocked_until
         END
     RETURNING attempts, blocked_until`
  ) as unknown as Array<{ attempts: number; blocked_until: string | null }>;

  const rows = Array.isArray(result) ? result : (result as { rows?: Array<{ attempts: number; blocked_until: string | null }> }).rows ?? [];
  const row = rows[0];
  if (!row) return { attempts: 0, blockedUntil: null };
  return {
    attempts: Number(row.attempts),
    blockedUntil: row.blocked_until ? new Date(row.blocked_until) : null,
  };
}

// ─── clearFailures ────────────────────────────────────────────────────────────
// Chamada após login bem-sucedido. Logins corretos não incrementam o contador.
export async function clearFailures(key: string): Promise<void> {
  await db.delete(authRateLimits).where(eq(authRateLimits.key, key));
}

// ─── checkResetRateLimit ─────────────────────────────────────────────────────
// Verificação combinada para solicitações de redefinição de senha.
// Verifica por IP (3 por hora) e por e-mail (3 por hora) separadamente.
export async function checkResetRateLimit(
  ipKey: string,
  emailKey: string
): Promise<{ isBlocked: boolean }> {
  const [ipResult, emailResult] = await Promise.all([
    isBlocked(ipKey),
    isBlocked(emailKey),
  ]);
  return { isBlocked: ipResult.isBlocked || emailResult.isBlocked };
}

export async function recordResetAttempt(
  ipKey: string,
  emailKey: string
): Promise<void> {
  await Promise.all([
    recordResetFailureWithWindow(ipKey, RESET_PER_IP_LIMIT, RESET_WINDOW_HOURS),
    recordResetFailureWithWindow(emailKey, RESET_PER_IP_LIMIT, RESET_WINDOW_HOURS),
  ]);
}

async function recordResetFailureWithWindow(
  key: string,
  maxAttempts: number,
  windowHours: number
): Promise<void> {
  const id = crypto.randomUUID();
  const windowMs = windowHours * 60 * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  await db.execute(
    `INSERT INTO auth_rate_limits (id, key, attempts, first_attempt_at, blocked_until)
     VALUES ('${id}', '${key}', 1, NOW(), NULL)
     ON CONFLICT (key) DO UPDATE
     SET attempts = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN 1
           ELSE auth_rate_limits.attempts + 1
         END,
         first_attempt_at = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN NOW()
           ELSE auth_rate_limits.first_attempt_at
         END,
         blocked_until = CASE
           WHEN auth_rate_limits.first_attempt_at < '${windowStart.toISOString()}'::timestamptz THEN NULL
           WHEN auth_rate_limits.attempts + 1 >= ${maxAttempts} THEN NOW() + INTERVAL '${windowHours} hours'
           ELSE auth_rate_limits.blocked_until
         END`
  );
}

// ─── Limpeza de Registros Expirados ──────────────────────────────────────────
// Pode ser chamada por um job assíncrono periódico.
export async function purgeExpiredRateLimits(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .delete(authRateLimits)
    .where(
      and(
        isNull(authRateLimits.blockedUntil),
        lt(authRateLimits.firstAttemptAt, oneHourAgo)
      )
    );

  // Limpa também bloqueios já expirados
  await db
    .delete(authRateLimits)
    .where(
      and(
        lte(authRateLimits.blockedUntil, new Date())
      )
    );
}
