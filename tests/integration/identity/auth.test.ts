import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../../src/lib/db/schema';
import { users, sessions, passwordResetTokens, authRateLimits, userConsents } from '../../../src/lib/db/schema';
import { TestFakeEmailSender } from '../../../src/modules/identity/domain/email-sender';
import { hashToken } from '../../../src/modules/identity/server/session';
import * as authService from '../../../src/modules/identity/server/auth.service';
import { isBlocked, loginKey, recordFailure } from '../../../src/modules/identity/server/rate-limiter';
import { eq, and, sql } from 'drizzle-orm';

// ─── Configuração ─────────────────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL_TEST;

if (!connectionString) {
  describe('Auth Integration Tests', () => {
    it('deve falhar se DATABASE_URL_TEST estiver ausente', () => {
      throw new Error(
        '[FALHA CRÍTICA DE CONFIGURAÇÃO] DATABASE_URL_TEST não definida. Testes de integração exigem banco real.'
      );
    });
  });
} else {
  const queryClient = postgres(connectionString);
  const db = drizzle(queryClient, { schema });
  const emailSender = new TestFakeEmailSender();

  beforeEach(async () => {
    // Limpeza completa entre testes (ordem respeitando FKs)
    await db.delete(authRateLimits);
    await db.delete(passwordResetTokens);
    await db.delete(sessions);
    
    // Desativa trigger para permitir limpeza da tabela de consentimentos nos testes
    await db.execute(sql`ALTER TABLE user_consents DISABLE TRIGGER ALL;`);
    try {
      await db.delete(userConsents);
    } finally {
      await db.execute(sql`ALTER TABLE user_consents ENABLE TRIGGER ALL;`);
    }
    
    await db.delete(users);
    emailSender.clear();
  });

  afterAll(async () => {
    await queryClient.end();
  });

  // ─── Cadastro ────────────────────────────────────────────────────────────────
  describe('register', () => {
    it('cria usuário e sessão no banco de dados', async () => {
      const result = await authService.register(
        'João Teste',
        'joao@test.com',
        'SenhaForte@1', { marketingCommunications: false }, '127.0.0.1',
        'Vitest/1.0'
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verifica usuário no banco
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'joao@test.com'));
      expect(user).toBeDefined();
      expect(user.name).toBe('João Teste');
      expect(user.passwordHash).not.toBe('SenhaForte@1');
      expect(user.status).toBe('active');

      // Verifica sessão no banco
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user.id));
      expect(session).toBeDefined();
      expect(session.revokedAt).toBeNull();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verifica que token foi retornado e hash correto está no banco
      const tokenHash = hashToken(result.token);
      expect(session.tokenHash).toBe(tokenHash);
    });

    it('rejeita e-mail duplicado sem revelar detalhes técnicos', async () => {
      await authService.register('Primeiro', 'dup@test.com', 'SenhaForte@1', { marketingCommunications: false });

      const result = await authService.register('Segundo', 'dup@test.com', 'OutraSenh@1', { marketingCommunications: false });
      expect(result.success).toBe(false);
      if (result.success) return;

      // Mensagem de erro deve ser genérica (não revelar que e-mail existe)
      expect(result.error).not.toContain('já existe');
      expect(result.error).not.toContain('duplicate');
    });

    it('idempotência: registrar duas vezes o mesmo e-mail não duplica usuários', async () => {
      await authService.register('User A', 'unico@test.com', 'SenhaForte@1', { marketingCommunications: false });
      await authService.register('User B', 'unico@test.com', 'OutraSenh@1', { marketingCommunications: false });

      const allUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, 'unico@test.com'));
      expect(allUsers).toHaveLength(1);
    });
  });

  // ─── Login ────────────────────────────────────────────────────────────────────
  describe('login', () => {
    beforeEach(async () => {
      await authService.register('Usuário Teste', 'login@test.com', 'SenhaForte@1', { marketingCommunications: false });
    });

    it('autentica com credenciais corretas e retorna sessão', async () => {
      const result = await authService.login(
        'login@test.com',
        'SenhaForte@1',
        '127.0.0.1',
        'Vitest'
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.token.length).toBeGreaterThan(0);
      expect(result.user.email).toBe('login@test.com');
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejeita senha incorreta e registra falha no rate limiter', async () => {
      const result = await authService.login(
        'login@test.com',
        'SenhaErrada@1',
        '127.0.0.1',
        'Vitest'
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBe('Credenciais inválidas.');

      // Verifica que a falha foi registrada
      const key = loginKey('127.0.0.1', 'login@test.com');
      const [rateLimit] = await db
        .select()
        .from(authRateLimits)
        .where(eq(authRateLimits.key, key));
      expect(rateLimit).toBeDefined();
      expect(rateLimit.attempts).toBe(1);
    });

    it('rejeita e-mail inexistente sem revelar que não existe', async () => {
      const result = await authService.login(
        'naoexiste@test.com',
        'SenhaForte@1',
        '127.0.0.1'
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      // Mesma mensagem que senha errada — não enumera usuários
      expect(result.error).toBe('Credenciais inválidas.');
    });

    it('bloqueia após 5 falhas consecutivas', async () => {
      const ip = '10.0.0.1';
      const email = 'login@test.com';
      const key = loginKey(ip, email);

      // Registra 5 falhas diretamente no rate limiter
      for (let i = 0; i < 5; i++) {
        await recordFailure(key);
      }

      // A 6ª tentativa deve ser bloqueada
      const result = await authService.login(email, 'SenhaForte@1', ip);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.rateLimited).toBe(true);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('revoga a sessão e ela não fica mais acessível', async () => {
      const regResult = await authService.register('User', 'logout@test.com', 'SenhaForte@1', { marketingCommunications: false });
      if (!regResult.success) throw new Error('setup falhou');

      await authService.logout(regResult.sessionId, regResult.user.id);

      // Verifica que a sessão foi revogada no banco
      const [sess] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, regResult.sessionId));
      expect(sess.revokedAt).not.toBeNull();
    });

    it('registra evento de auditoria no encerramento de sessão', async () => {
      const regResult = await authService.register('Audit User', 'logout-audit@test.com', 'SenhaForte@1', { marketingCommunications: false });
      if (!regResult.success) throw new Error('setup falhou');

      await authService.logout(regResult.sessionId, regResult.user.id);

      const [audit] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.tableName, 'sessions'),
            eq(schema.auditLogs.recordId, regResult.sessionId),
            eq(schema.auditLogs.action, 'UPDATE')
          )
        );

      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(regResult.user.id);
      expect(audit.actorType).toBe('user');
      expect((audit.newValue as { reason?: string })?.reason).toBe('user_requested');
    });

    it('é idempotente: chamar logout duas vezes não gera erro', async () => {
      const regResult = await authService.register('User', 'logout2@test.com', 'SenhaForte@1', { marketingCommunications: false });
      if (!regResult.success) throw new Error('setup falhou');

      await authService.logout(regResult.sessionId, regResult.user.id);
      await expect(
        authService.logout(regResult.sessionId, regResult.user.id)
      ).resolves.not.toThrow();
    });

    it('é idempotente: logout com sessionId null não gera erro', async () => {
      await expect(authService.logout(null, null)).resolves.not.toThrow();
    });
  });


  // ─── Recuperação de Senha ─────────────────────────────────────────────────────
  describe('requestPasswordReset', () => {
    it('cria token de reset no banco após solicitação', async () => {
      await authService.register('User', 'reset@test.com', 'SenhaForte@1', { marketingCommunications: false });
      await authService.requestPasswordReset('reset@test.com', emailSender, '127.0.0.1');

      // Token criado e disponível pelo fake email sender
      const msg = emailSender.getLastSentEmail();
      expect(msg).not.toBeNull();
      expect(msg!.to).toBe('reset@test.com');
      expect(msg!.token.length).toBeGreaterThan(0);

      // Verifica token no banco
      const tokenHash = hashToken(msg!.token);
      const [tokenRow] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash));
      expect(tokenRow).toBeDefined();
      expect(tokenRow.usedAt).toBeNull();
    });

    it('resposta é sempre padronizada — não enumera e-mails inexistentes', async () => {
      // Não lança exceção para e-mail que não existe
      await expect(
        authService.requestPasswordReset('naoexiste@test.com', emailSender, '127.0.0.1')
      ).resolves.not.toThrow();

      // Nenhum e-mail é enviado para usuário inexistente
      expect(emailSender.getLastSentEmail()).toBeNull();
    });
  });

  // ─── Redefinição de Senha ─────────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('redefine senha e revoga todas as sessões ativas', async () => {
      await authService.register('User', 'newpass@test.com', 'SenhaForte@1', { marketingCommunications: false });
      await authService.requestPasswordReset('newpass@test.com', emailSender, '127.0.0.1');

      const msg = emailSender.getLastSentEmail();
      if (!msg) throw new Error('Email não enviado');

      const result = await authService.resetPassword(msg.token, 'NovaSenha@Forte1');
      expect(result.success).toBe(true);

      // Todas as sessões devem estar revogadas
      const [user] = await db.select().from(users).where(eq(users.email, 'newpass@test.com'));
      const activeSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user.id));

      expect(activeSessions.every((s) => s.revokedAt !== null)).toBe(true);
    });

    it('rejeita token já utilizado', async () => {
      await authService.register('User', 'token2@test.com', 'SenhaForte@1', { marketingCommunications: false });
      await authService.requestPasswordReset('token2@test.com', emailSender, '127.0.0.1');

      const msg = emailSender.getLastSentEmail();
      if (!msg) throw new Error('Email não enviado');

      // Usa o token pela primeira vez
      await authService.resetPassword(msg.token, 'NovaSenha@Forte1');

      // Tenta usar o mesmo token novamente
      await expect(
        authService.resetPassword(msg.token, 'OutraSenha@Forte2')
      ).rejects.toThrow('TOKEN_INVALID');
    });

    it('rejeita token inválido', async () => {
      await expect(
        authService.resetPassword('token-invalido-fake', 'NovaSenha@Forte1')
      ).rejects.toThrow('TOKEN_INVALID');
    });

    it('rejeita nova senha igual à atual', async () => {
      await authService.register('User', 'same@test.com', 'SenhaForte@1', { marketingCommunications: false });
      await authService.requestPasswordReset('same@test.com', emailSender, '127.0.0.1');

      const msg = emailSender.getLastSentEmail();
      if (!msg) throw new Error('Email não enviado');

      await expect(
        authService.resetPassword(msg.token, 'SenhaForte@1')
      ).rejects.toThrow('PASSWORD_SAME');
    });
  });
}
