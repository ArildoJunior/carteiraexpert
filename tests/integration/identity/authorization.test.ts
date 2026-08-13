import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { assertOwnership } from '../../../src/modules/identity/server/authorization-service';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Autorização e Prevenção IDOR', () => {
  const currentUser: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user_a@carteiraexpert.invalid',
    name: 'User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const otherUserId = crypto.randomUUID();

  beforeAll(async () => {
    await db.insert(users).values({
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      passwordHash: 'dummy_hash',
    });
  });

  afterEach(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.actorId, currentUser.id));
  });

  it('deve aprovar acesso se resourceOwnerId for igual ao currentUser.id', async () => {
    await expect(assertOwnership(currentUser.id, currentUser, 'wallet')).resolves.not.toThrow();
    
    // Nenhuma auditoria gerada para sucesso (auditoria de leitura normal fica no nível da requisição)
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.actorId, currentUser.id));
    expect(logs).toHaveLength(0);
  });

  it('deve lançar erro e auditar tentativa de IDOR se resourceOwnerId for diferente', async () => {
    await expect(assertOwnership(otherUserId, currentUser, 'wallet')).rejects.toThrow('FORBIDDEN');

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.actorId, currentUser.id));
    expect(logs).toHaveLength(1);
    
    // Verifica regras de segurança e privacidade na auditoria
    const log = logs[0];
    expect(log.tableName).toBe('audit_logs');
    expect(log.action).toBe('ADJUSTMENT');
    expect(log.reason).toBe('FORBIDDEN_IDOR_ATTEMPT');
    expect(log.source).toBe('manual');
    expect(log.recordId).toBeDefined(); // Deve ser UUID técnico
    expect(log.recordId).not.toBe(otherUserId); // NUNCA expor ID de terceiro!
  });
});
