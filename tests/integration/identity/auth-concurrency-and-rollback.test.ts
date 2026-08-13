import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../../src/lib/db/schema';
import { users, sessions, passwordResetTokens, authRateLimits, userConsents, auditLogs } from '../../../src/lib/db/schema';
import * as authService from '../../../src/modules/identity/server/auth.service';
import * as auditModule from '../../../src/lib/db/audit';
import * as sessionModule from '../../../src/modules/identity/server/session';
import { inspectPhysicalSchema } from '../../../src/lib/db/verify-schema';
import { sql, eq } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_TEST;

if (!connectionString) {
  describe('Auth Concurrency, Integridade e Rollback', () => {
    it('deve falhar se DATABASE_URL_TEST estiver ausente', () => {
      throw new Error(
        '[FALHA CRÍTICA DE CONFIGURAÇÃO] DATABASE_URL_TEST não definida. Testes de integração exigem banco real.'
      );
    });
  });
} else {
  const queryClient = postgres(connectionString);
  const db = drizzle(queryClient, { schema });

  beforeEach(async () => {
    // Limpeza completa entre testes
    await db.delete(authRateLimits);
    await db.delete(passwordResetTokens);
    // Desativa trigger temporariamente para permitir limpeza em testes
    await db.execute(sql`ALTER TABLE user_consents DISABLE TRIGGER ALL;`);
    try {
      await db.delete(userConsents);
    } finally {
      await db.execute(sql`ALTER TABLE user_consents ENABLE TRIGGER ALL;`);
    }

    await db.delete(auditLogs);
    await db.delete(users);
  });

  afterAll(async () => {
    await queryClient.end();
  });

  // ─── 1. Divergência Real de Schema em Estrutura Isolada ──────────────────────
  describe('Divergência Real de Schema', () => {
    it('deve detectar divergência física real em schema temporário descartável sem afetar o banco principal', async () => {
      const tempSchema = 'temp_divergence_test_schema';

      // Cria schema temporário isolado
      await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${tempSchema}";`));

      // Cria uma tabela audit_logs deliberadamente incompatível (faltando table_name e record_id)
      await db.execute(sql.raw(`
        CREATE TABLE "${tempSchema}"."audit_logs" (
          "id" uuid PRIMARY KEY,
          "user_id" uuid,
          "action" text NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `));

      try {
        const inspection = await inspectPhysicalSchema(db, {
          targetSchema: tempSchema,
          checkMigrations: false,
        });

        expect(inspection.isValid).toBe(false);
        expect(inspection.errors.some((e) => e.includes('audit_logs.table_name'))).toBe(true);
        expect(inspection.errors.some((e) => e.includes('audit_logs.record_id'))).toBe(true);
      } finally {
        // Limpeza garantida do schema descartável
        await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${tempSchema}" CASCADE;`));
      }
    });
  });

  // ─── 2. Concorrência e Isolamento Transacional ───────────────────────────────
  describe('Concorrência no Cadastro', () => {
    it('cadastro concorrente com o mesmo e-mail: exatamente 1 sucesso, 4 falhas tratadas e sem deadlock', async () => {
      const targetEmail = 'concurrent_same@carteiraexpert.test';
      const password = 'SenhaForte@1234';

      // Dispara 5 requisições concorrentes simultâneas
      const results = await Promise.all([
        authService.register('User 1', targetEmail, password, { marketingCommunications: false }),
        authService.register('User 2', targetEmail, password, { marketingCommunications: false }),
        authService.register('User 3', targetEmail, password, { marketingCommunications: false }),
        authService.register('User 4', targetEmail, password, { marketingCommunications: false }),
        authService.register('User 5', targetEmail, password, { marketingCommunications: false }),
      ]);

      const successes = results.filter((r) => r.success === true);
      const failures = results.filter((r) => r.success === false);

      // Validação do contrato real da aplicação
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);

      for (const failure of failures) {
        if (!failure.success) {
          expect(failure.error).toContain('Não foi possível criar a conta');
        }
      }

      // Verificação direta no PostgreSQL: apenas 1 usuário, 1 sessão e 2 consentimentos
      const dbUsers = await db.select().from(users).where(eq(users.email, targetEmail));
      expect(dbUsers).toHaveLength(1);

      const dbSessions = await db.select().from(sessions).where(eq(sessions.userId, dbUsers[0].id));
      expect(dbSessions).toHaveLength(1);

      const dbConsents = await db.select().from(userConsents).where(eq(userConsents.userId, dbUsers[0].id));
      expect(dbConsents).toHaveLength(2); // terms + privacy
    });

    it('cadastros concorrentes com e-mails diferentes: todos com sucesso e persistência íntegra', async () => {
      const results = await Promise.all([
        authService.register('User A', 'usera@carteiraexpert.test', 'SenhaForte@1', { marketingCommunications: false }),
        authService.register('User B', 'userb@carteiraexpert.test', 'SenhaForte@1', { marketingCommunications: false }),
        authService.register('User C', 'userc@carteiraexpert.test', 'SenhaForte@1', { marketingCommunications: false }),
        authService.register('User D', 'userd@carteiraexpert.test', 'SenhaForte@1', { marketingCommunications: false }),
        authService.register('User E', 'usere@carteiraexpert.test', 'SenhaForte@1', { marketingCommunications: false }),
      ]);

      for (const res of results) {
        expect(res.success).toBe(true);
      }

      const allUsers = await db.select().from(users);
      expect(allUsers).toHaveLength(5);
    });
  });

  // ─── 3. Rollback Transacional e Falhas Deliberadas ────────────────────────────
  describe('Rollback Transacional Completo', () => {
    it('falha deliberada na inserção de auditoria: deve reverter users, sessions e user_consents no PostgreSQL', async () => {
      const email = 'rollback_audit_test@carteiraexpert.test';

      // Espiona insertAuditLog para falhar deliberadamente na segunda chamada (inserção de sessão)
      let callCount = 0;
      const originalInsertAuditLog = auditModule.insertAuditLog;
      vi.spyOn(auditModule, 'insertAuditLog').mockImplementation(async (...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('[SIMULAÇÃO DE FALHA] Falha forçada na auditoria');
        }
        return originalInsertAuditLog(...args);
      });

      await expect(
        authService.register('User Rollback', email, 'SenhaForte@1', { marketingCommunications: false })
      ).rejects.toThrow('[SIMULAÇÃO DE FALHA]');

      vi.restoreAllMocks();

      // Consulta direta no PostgreSQL: NENHUM registro deve ter permanecido
      const dbUsers = await db.select().from(users).where(eq(users.email, email));
      expect(dbUsers).toHaveLength(0);

      const dbSessions = await db.select().from(sessions);
      expect(dbSessions).toHaveLength(0);

      const dbConsents = await db.select().from(userConsents);
      expect(dbConsents).toHaveLength(0);

      const dbLogs = await db.select().from(auditLogs);
      expect(dbLogs).toHaveLength(0);
    });

    it('falha deliberada na criação de sessão: deve reverter a inserção de users no PostgreSQL', async () => {
      const email = 'rollback_session_test@carteiraexpert.test';

      vi.spyOn(sessionModule, 'createSession').mockRejectedValueOnce(
        new Error('[SIMULAÇÃO DE FALHA] Falha forçada na criação de sessão')
      );

      await expect(
        authService.register('User Rollback 2', email, 'SenhaForte@1', { marketingCommunications: false })
      ).rejects.toThrow('[SIMULAÇÃO DE FALHA]');

      vi.restoreAllMocks();

      // Verificação direta no PostgreSQL: zero registros
      const dbUsers = await db.select().from(users).where(eq(users.email, email));
      expect(dbUsers).toHaveLength(0);

      const dbLogs = await db.select().from(auditLogs);
      expect(dbLogs).toHaveLength(0);
    });
  });

  // ─── 4. Testes Específicos da Auditoria ───────────────────────────────────────
  describe('Integridade Estrutural de Audit Logs', () => {
    it('deve registrar auditoria detalhada com usuário, sessão e consentimentos devidamente sanitizados', async () => {
      const email = 'audit_detail_test@carteiraexpert.test';
      const result = await authService.register(
        'Audit Detail User',
        email,
        'SenhaForte@1',
        { marketingCommunications: true },
        '192.168.1.50',
        'Vitest Integration Agent'
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.actorId, result.user.id));

      // Esperado: 1 de users + 1 de sessions + 1 terms + 1 privacy + 1 marketing = 5 logs
      expect(logs.length).toBeGreaterThanOrEqual(4);

      // 1. Log de criação de usuário
      const userLog = logs.find((l) => l.tableName === 'users' && l.action === 'INSERT');
      expect(userLog).toBeDefined();
      expect(userLog?.actorType).toBe('user');
      expect(userLog?.recordId).toBe(result.user.id);
      expect((userLog?.newValue as any)?.email).toContain('*'); // E-mail mascarado
      expect((userLog?.newValue as any)?.status).toBe('active');

      // 2. Log de criação de sessão
      const sessionLog = logs.find((l) => l.tableName === 'sessions' && l.action === 'INSERT');
      expect(sessionLog).toBeDefined();
      expect((sessionLog?.newValue as any)?.ip_masked).toBe('192.168.1.0'); // IP anonimizado
    });
  });
}
