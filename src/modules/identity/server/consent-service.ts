import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../../lib/db';
import { userConsents } from '../../../lib/db/schema/identity';
import { insertAuditLog } from '../../../lib/db/audit';
import { anonymizeIp, sanitizeUserAgent } from './session';
import { CURRENT_CONSENT_VERSIONS, ConsentDocumentType } from '../domain/consent-constants';
import type { RecordConsentOptions, ConsentRecord } from '../domain/consent.types';

const CONSENT_ADVISORY_NAMESPACE = 1129270867; // 'CONS' in ASCII

/**
 * Retorna os detalhes do último consentimento para um tipo específico.
 */
export async function getLatestConsent(
  userId: string,
  consentType: ConsentDocumentType,
  executor: any = db
): Promise<ConsentRecord | null> {
  const [latest] = await executor
    .select()
    .from(userConsents)
    .where(
      and(
        eq(userConsents.userId, userId),
        eq(userConsents.consentType, consentType)
      )
    )
    .orderBy(desc(userConsents.createdAt), desc(userConsents.id))
    .limit(1);

  return latest ?? null;
}

/**
 * Grava um novo evento de consentimento (aceite ou revogação).
 * Usa advisory lock no PostgreSQL para evitar duplicação em corridas concorrentes.
 * Executa de forma atômica o INSERT e a auditoria transacional.
 */
export async function recordConsent(
  opts: RecordConsentOptions,
  executor: any = db
): Promise<void> {
  await executor.transaction(async (tx: any) => {
    // 1. Adquire trava transacional com namespace 1129270867 e hash de (userId:consentType)
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${CONSENT_ADVISORY_NAMESPACE}, hashtext(${opts.userId} || ':' || ${opts.consentType}))`
    );

    // 2. Consulta o último estado do consentimento para verificar idempotência
    const latest = await getLatestConsent(opts.userId, opts.consentType, tx);

    if (latest) {
      if (latest.action === 'granted' && opts.action === 'granted' && latest.version === opts.version) {
        return; // Idempotente: já tem o aceite da mesma versão.
      }
      if (latest.action === 'revoked' && opts.action === 'revoked') {
        return; // Idempotente: já está revogado.
      }
    }

    // 3. Insere o novo consentimento
    const [consent] = await tx
      .insert(userConsents)
      .values({
        id: crypto.randomUUID(),
        userId: opts.userId,
        consentType: opts.consentType,
        version: opts.version,
        action: opts.action,
        ipAddress: anonymizeIp(opts.ip),
        userAgent: sanitizeUserAgent(opts.userAgent),
        correlationId: opts.correlationId,
      })
      .returning();

    // 4. Grava auditoria transacional
    await insertAuditLog(
      {
        tableName: 'user_consents',
        recordId: consent.id,
        action: 'INSERT',
        actorId: opts.userId,
        actorType: 'user',
        reason: opts.action === 'granted' ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
        correlationId: opts.correlationId,
        source: 'manual',
      },
      { newValue: { consentType: opts.consentType, version: opts.version, action: opts.action } },
      { preMinimized: true },
      tx
    );
  });
}

/**
 * Verifica se o usuário aceitou as versões vigentes dos termos obrigatórios.
 * Retorna true se ambos (Termos de Uso e Política de Privacidade) estão na versão atual.
 */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const [terms, privacy] = await Promise.all([
    getLatestConsent(userId, 'terms_of_service'),
    getLatestConsent(userId, 'privacy_policy'),
  ]);

  const termsOk = terms?.action === 'granted' && terms?.version === CURRENT_CONSENT_VERSIONS.terms_of_service.version;
  const privacyOk = privacy?.action === 'granted' && privacy?.version === CURRENT_CONSENT_VERSIONS.privacy_policy.version;

  return termsOk && privacyOk;
}

/**
 * Auxiliar para revogar um consentimento opcional.
 */
export async function revokeOptionalConsent(
  opts: Omit<RecordConsentOptions, 'action' | 'version'> & { consentType: 'marketing_communications' }
): Promise<void> {
  const version = CURRENT_CONSENT_VERSIONS[opts.consentType].version;
  await recordConsent({
    ...opts,
    action: 'revoked',
    version,
  });
}
