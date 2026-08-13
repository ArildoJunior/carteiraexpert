import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from '../../../src/lib/db';
import { users, userConsents, sessions } from '../../../src/lib/db/schema/identity';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { recordConsent, hasAcceptedCurrentTerms } from '../../../src/modules/identity/server/consent-service';
import { CURRENT_CONSENT_VERSIONS } from '../../../src/modules/identity/domain/consent-constants';
import crypto from 'node:crypto';
import { sql, desc, eq } from 'drizzle-orm';

describe('Integração: Consentimentos (user_consents)', () => {
  const testUserId = crypto.randomUUID();

  beforeAll(async () => {
    await db.insert(users).values({
      id: testUserId,
      email: 'test_consent@carteiraexpert.invalid',
      name: 'Test Consent',
      passwordHash: 'dummy_hash',
    });
  });

  afterEach(async () => {
    // Como a tabela user_consents não permite DELETE normal via Drizzle/Trigger,
    // usaremos TRUNCATE CASCADE apenas no banco de teste ou desativamos a trigger temporariamente
    await db.execute(sql`ALTER TABLE user_consents DISABLE TRIGGER ALL;`);
    await db.delete(userConsents).where(eq(userConsents.userId, testUserId));
    await db.execute(sql`ALTER TABLE user_consents ENABLE TRIGGER ALL;`);
    await db.delete(auditLogs).where(eq(auditLogs.actorId, testUserId));
  });

  it('deve registrar consentimento e gerar auditoria transacional', async () => {
    await recordConsent({
      userId: testUserId,
      consentType: 'terms_of_service',
      version: CURRENT_CONSENT_VERSIONS.terms_of_service.version,
      action: 'granted',
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    const rows = await db.select().from(userConsents).where(eq(userConsents.userId, testUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].consentType).toBe('terms_of_service');
    expect(rows[0].ipAddress).toBe('192.168.1.0'); // Anonimizado

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.actorId, testUserId));
    expect(logs).toHaveLength(1);
    expect(logs[0].tableName).toBe('user_consents');
    expect(logs[0].action).toBe('INSERT');
    expect(logs[0].reason).toBe('CONSENT_GRANTED');
  });

  it('deve bloquear exclusão via trigger', async () => {
    await recordConsent({
      userId: testUserId,
      consentType: 'privacy_policy',
      version: CURRENT_CONSENT_VERSIONS.privacy_policy.version,
      action: 'granted',
      ip: undefined,
      userAgent: undefined,
    });

    await expect(db.delete(userConsents).where(eq(userConsents.userId, testUserId))).rejects.toThrow(/Failed query: delete from "user_consents"/);  });

  it('deve identificar pendência de consentimento', async () => {
    const hasConsent = await hasAcceptedCurrentTerms(testUserId);
    expect(hasConsent).toBe(false);

    await recordConsent({
      userId: testUserId,
      consentType: 'terms_of_service',
      version: CURRENT_CONSENT_VERSIONS.terms_of_service.version,
      action: 'granted',
      ip: undefined,
      userAgent: undefined,
    });
    
    expect(await hasAcceptedCurrentTerms(testUserId)).toBe(false);

    await recordConsent({
      userId: testUserId,
      consentType: 'privacy_policy',
      version: CURRENT_CONSENT_VERSIONS.privacy_policy.version,
      action: 'granted',
      ip: undefined,
      userAgent: undefined,
    });

    expect(await hasAcceptedCurrentTerms(testUserId)).toBe(true);
  });

  it('deve ser idempotente em retries (mesma ação/versão não insere nova linha)', async () => {
    await recordConsent({
      userId: testUserId,
      consentType: 'marketing_communications',
      version: '1.0',
      action: 'granted',
      ip: undefined,
      userAgent: undefined,
    });

    await recordConsent({
      userId: testUserId,
      consentType: 'marketing_communications',
      version: '1.0',
      action: 'granted',
      ip: undefined,
      userAgent: undefined,
    });

    const rows = await db.select().from(userConsents).where(eq(userConsents.userId, testUserId));
    expect(rows).toHaveLength(1); // Não duplicou
  });
});
