import crypto from 'node:crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { users, sessions, passwordResetTokens } from '../../../lib/db/schema/identity';
import { insertAuditLog } from '../../../lib/db/audit';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  DUMMY_ARGON2_HASH,
} from '../domain/password';
import { createSession, revokeAllUserSessions, hashToken } from './session';
import {
  isBlocked,
  loginKey,
  recordFailure,
  clearFailures,
  checkResetRateLimit,
  recordResetAttempt,
  resetByIpKey,
  resetByEmailKey,
} from './rate-limiter';
import type { EmailSenderService } from '../domain/email-sender';
import type { SafeUser } from '../domain/user.types';

// ─── Mascaramento de E-mail ───────────────────────────────────────────────────
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[e-mail inválido]';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local.at(-1)}@${domain}`;
}

function anonymizeIpForAudit(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, '.0');
  return null;
}

// ─── Interfaces de Retorno ────────────────────────────────────────────────────
export interface AuthResult {
  success: true;
  token: string;
  sessionId: string;
  expiresAt: Date;
  user: SafeUser;
}

export interface AuthError {
  success: false;
  error: string;
  rateLimited?: boolean;
}

import { recordConsent } from './consent-service';
import { CURRENT_CONSENT_VERSIONS } from '../domain/consent-constants';
import { assertSchemaCompatible } from '../../../lib/db/verify-schema';

// ─── CADASTRO ─────────────────────────────────────────────────────────────────
export async function register(
  name: string,
  email: string,
  password: string,
  consents: { marketingCommunications: boolean },
  ip?: string | null,
  userAgent?: string | null
): Promise<AuthResult | AuthError> {
  await assertSchemaCompatible();

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    let token = '';
    let sessionId = '';
    let expiresAt = new Date();
    let createdUser: SafeUser | null = null;

    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ id: userId, email, name, passwordHash })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      createdUser = user;

      await insertAuditLog(
        {
          tableName: 'users',
          recordId: userId,
          action: 'INSERT',
          actorId: userId,
          actorType: 'user',
          source: 'manual',
        },
        { newValue: { email: maskEmail(email), name, status: 'active' } },
        { allowlist: ['email', 'name', 'status'], preMinimized: false },
        tx
      );

      const sess = await createSession({ userId, ip, userAgent }, tx);
      token = sess.token;
      sessionId = sess.sessionId;
      expiresAt = sess.expiresAt;

      await insertAuditLog(
        {
          tableName: 'sessions',
          recordId: sessionId,
          action: 'INSERT',
          actorId: userId,
          actorType: 'user',
          source: 'manual',
        },
        { newValue: { userId, ip_masked: anonymizeIpForAudit(ip) } },
        { preMinimized: true },
        tx
      );

      // Registrar consentimentos iniciais na mesma transação
      await recordConsent({
        userId,
        consentType: 'terms_of_service',
        version: CURRENT_CONSENT_VERSIONS.terms_of_service.version,
        action: 'granted',
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
      }, tx);

      await recordConsent({
        userId,
        consentType: 'privacy_policy',
        version: CURRENT_CONSENT_VERSIONS.privacy_policy.version,
        action: 'granted',
        ip: ip ?? undefined,
        userAgent: userAgent ?? undefined,
      }, tx);

      if (consents.marketingCommunications) {
        await recordConsent({
          userId,
          consentType: 'marketing_communications',
          version: CURRENT_CONSENT_VERSIONS.marketing_communications.version,
          action: 'granted',
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
        }, tx);
      }
    });

    return { success: true, token, sessionId, expiresAt, user: createdUser! };
  } catch (err: unknown) {
    const cause = typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause: unknown }).cause : null;
    const errStr = String(err) + ' ' + (cause ? String(cause) : '') + ' ' + JSON.stringify(err);

    const isUniqueViolation =
      (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505') ||
      (typeof cause === 'object' && cause !== null && 'code' in cause && (cause as { code?: string }).code === '23505') ||
      /23505|users_email_unique|unicidade/i.test(errStr);

    if (isUniqueViolation) {
      return {
        success: false,
        error: 'Não foi possível criar a conta. Verifique os dados e tente novamente.',
      };
    }
    throw err;
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export async function login(
  email: string,
  password: string,
  ip?: string | null,
  userAgent?: string | null
): Promise<AuthResult | AuthError> {
  await assertSchemaCompatible();

  const rateLimitKey = loginKey(ip ?? 'unknown', email);

  const { isBlocked: blocked } = await isBlocked(rateLimitKey);
  if (blocked) {
    await insertAuditLog(
      { tableName: 'users', recordId: 'anonymous', action: 'UPDATE', actorType: 'system', source: 'manual' },
      { newValue: { key_hash: rateLimitKey.slice(0, 16), reason: 'rate_limit_exceeded' } },
      { preMinimized: true }
    ).catch(() => {});
    return { success: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.', rateLimited: true };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    await verifyPassword(DUMMY_ARGON2_HASH, password);
    await insertAuditLog(
      { tableName: 'users', recordId: 'anonymous', action: 'UPDATE', actorType: 'system', source: 'manual' },
      { newValue: { email: maskEmail(email), reason: 'user_not_found' } },
      { preMinimized: true }
    ).catch(() => {});
    return { success: false, error: 'Credenciais inválidas.' };
  }

  if (user.status !== 'active') {
    await verifyPassword(DUMMY_ARGON2_HASH, password);
    return { success: false, error: 'Credenciais inválidas ou conta indisponível.' };
  }

  const valid = await verifyPassword(user.passwordHash, password);

  if (!valid) {
    await recordFailure(rateLimitKey);
    await insertAuditLog(
      { tableName: 'users', recordId: user.id, action: 'UPDATE', actorId: user.id, actorType: 'user', source: 'manual' },
      { newValue: { email: maskEmail(email), reason: 'invalid_password' } },
      { preMinimized: true }
    ).catch(() => {});
    return { success: false, error: 'Credenciais inválidas.' };
  }

  await clearFailures(rateLimitKey);

  let token = '';
  let sessionId = '';
  let expiresAt = new Date();

  await db.transaction(async (tx) => {
    const sess = await createSession({ userId: user.id, ip, userAgent }, tx);
    token = sess.token;
    sessionId = sess.sessionId;
    expiresAt = sess.expiresAt;

    await insertAuditLog(
      { tableName: 'sessions', recordId: sess.sessionId, action: 'INSERT', actorId: user.id, actorType: 'user', source: 'manual' },
      { newValue: { userId: user.id, ip_masked: anonymizeIpForAudit(ip) } },
      { preMinimized: true },
      tx
    );
  });

  // Re-hash otimista com verificação de versão
  if (needsRehash(user.passwordHash)) {
    const newHash = await hashPassword(password);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)));
  }

  const { passwordHash: _ph, ...safeUser } = user;
  return { success: true, token, sessionId, expiresAt, user: safeUser };
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export async function logout(sessionId: string | null, userId: string | null): Promise<void> {
  if (!sessionId) return;

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));

  if (userId) {
    await insertAuditLog(
      { tableName: 'sessions', recordId: sessionId, action: 'UPDATE', actorId: userId, actorType: 'user', source: 'manual' },
      { newValue: { userId, reason: 'user_requested' } },
      { preMinimized: true }
    );
  }
}


// ─── ESQUECI MINHA SENHA ──────────────────────────────────────────────────────
export async function requestPasswordReset(
  email: string,
  emailSender: EmailSenderService,
  ip?: string | null
): Promise<void> {
  await assertSchemaCompatible();

  const ipKey = resetByIpKey(ip ?? 'unknown');
  const emailKey = resetByEmailKey(email);

  const { isBlocked: blocked } = await checkResetRateLimit(ipKey, emailKey);
  if (blocked) return;

  await recordResetAttempt(ipKey, emailKey);

  const [user] = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || user.status !== 'active') {
    await insertAuditLog(
      { tableName: 'users', recordId: 'anonymous', action: 'UPDATE', actorType: 'system', source: 'manual' },
      { newValue: { email: maskEmail(email), status: 'user_not_found' } },
      { preMinimized: true }
    );
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

    await tx.insert(passwordResetTokens).values({
      id: tokenId,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await insertAuditLog(
      { tableName: 'users', recordId: user.id, action: 'UPDATE', actorId: user.id, actorType: 'user', source: 'manual' },
      { newValue: { email: maskEmail(email), status: 'requested' } },
      { preMinimized: true },
      tx
    );
  });

  try {
    await emailSender.sendPasswordResetEmail(email, rawToken);
  } catch {
    // EMAIL_DELIVERY_FAILED — token já no banco; usuário pode tentar novamente
  }
}

// ─── REDEFINIÇÃO DE SENHA ─────────────────────────────────────────────────────
export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  await assertSchemaCompatible();

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Usamos uma variável fora da transação para comunicar o userId
  let resolvedUserId: string | undefined;

  await db.transaction(async (tx) => {
    // Consumo atômico do token — UPDATE ... RETURNING em SQL raw
    const rows = await tx.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = '${tokenHash}'
         AND used_at IS NULL
         AND expires_at > '${now.toISOString()}'::timestamptz
       RETURNING user_id`
    ) as unknown as Array<{ user_id: string }>;

    const firstRow = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ user_id: string }> }).rows?.[0];
    if (!firstRow?.user_id) {
      throw new Error('TOKEN_INVALID');
    }

    resolvedUserId = firstRow.user_id;

    const [user] = await tx
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, resolvedUserId))
      .limit(1);

    if (user && await verifyPassword(user.passwordHash, newPassword)) {
      throw new Error('PASSWORD_SAME');
    }

    const newPasswordHash = await hashPassword(newPassword);

    await tx
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, resolvedUserId));

    // Revogar todas as sessões via SQL raw
    await tx.execute(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE user_id = '${resolvedUserId}' AND revoked_at IS NULL`
    );

    await insertAuditLog(
      {
        tableName: 'users',
        recordId: resolvedUserId,
        action: 'UPDATE',
        actorId: resolvedUserId,
        actorType: 'user',
        source: 'manual',
      },
      { newValue: { reason: 'reset_successful' } },
      { preMinimized: true },
      tx
    );
  });

  return { success: true };
}
