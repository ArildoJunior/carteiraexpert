import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios } from '../../../src/lib/db/schema/portfolio';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  createPortfolio,
  createPortfolioInTransaction,
  updatePortfolio,
} from '../../../src/modules/portfolio/server/portfolio.service';
import { DuplicateRealPortfolioError } from '../../../src/modules/portfolio/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Concorrência e Unicidade Estrita de Carteira REAL', () => {
  const userId = crypto.randomUUID();
  let testUser: SafeUser;
  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();
    const email = `purpose_concurrency_${Date.now()}@carteiraexpert.test`;
    await db.insert(users).values({
      id: userId,
      email,
      name: 'Purpose Concurrency User',
      passwordHash: 'dummy_hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // Plano PRO para não esbarrar em quotas de plano
    await db.insert(userPlans).values({
      id: crypto.randomUUID(),
      userId,
      planId: 'pro',
      status: 'active',
      startsAt: now,
      createdAt: now,
      updatedAt: now,
    });

    testUser = {
      id: userId,
      email,
      name: 'Purpose Concurrency User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    if (createdPortfolioIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdPortfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(userPlans).where(eq(userPlans.userId, userId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('deve criar com sucesso a primeira carteira REAL do usuário', async () => {
    const portReal = await createPortfolio(
      {
        name: 'Patrimônio Real 1',
        purpose: 'REAL',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(portReal.id);

    expect(portReal.purpose).toBe('REAL');
    expect(portReal.name).toBe('Patrimônio Real 1');

    // Confirma persistência real no PostgreSQL
    const [row] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, portReal.id));
    expect(row).toBeDefined();
    expect(row.purpose).toBe('REAL');
  });

  it('deve lançar DuplicateRealPortfolioError ao tentar criar uma segunda carteira REAL sequencialmente', async () => {
    await expect(
      createPortfolio(
        {
          name: 'Segunda Carteira Real Tentada',
          purpose: 'REAL',
          baseCurrency: 'BRL',
        },
        testUser
      )
    ).rejects.toThrow(DuplicateRealPortfolioError);
  });

  it('deve permitir criar múltiplas carteiras ESTUDO e ANALISE para o mesmo usuário', async () => {
    const portEstudo = await createPortfolio(
      {
        name: 'Carteira Estudo Tech',
        purpose: 'ESTUDO',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(portEstudo.id);
    expect(portEstudo.purpose).toBe('ESTUDO');

    const portAnalise = await createPortfolio(
      {
        name: 'Carteira Análise Macro',
        purpose: 'ANALISE',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(portAnalise.id);
    expect(portAnalise.purpose).toBe('ANALISE');
  });

  it('deve impedir a conversão de uma carteira ESTUDO para REAL se já houver REAL ativa', async () => {
    const estudoPort = createdPortfolioIds[1]; // portEstudo
    await expect(
      updatePortfolio(
        estudoPort,
        {
          purpose: 'REAL',
        },
        testUser
      )
    ).rejects.toThrow(DuplicateRealPortfolioError);
  });

  it('deve exigir confirmação explícita ao alterar de REAL para ESTUDO', async () => {
    const realPort = createdPortfolioIds[0]; // portReal
    await expect(
      updatePortfolio(
        realPort,
        {
          purpose: 'ESTUDO',
          confirmPurposeChange: false,
        },
        testUser
      )
    ).rejects.toThrow(/confirmação explícita/);
  });

  it('deve permitir alterar de REAL para ESTUDO com confirmPurposeChange: true e liberar criação de nova REAL', async () => {
    const realPort = createdPortfolioIds[0]; // portReal
    const updated = await updatePortfolio(
      realPort,
      {
        purpose: 'ESTUDO',
        confirmPurposeChange: true,
      },
      testUser
    );
    expect(updated.purpose).toBe('ESTUDO');

    // Agora o usuário tem 0 carteiras REAL. Deve ser possível criar uma nova REAL!
    const novaReal = await createPortfolio(
      {
        name: 'Nova Carteira Real',
        purpose: 'REAL',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(novaReal.id);
    expect(novaReal.purpose).toBe('REAL');
  });

  it('deve garantir unicidade em concorrência estrita: 2 transações simultâneas geram exatamente 1 sucesso e 1 DuplicateRealPortfolioError', async () => {
    // Cria um novo usuário exclusivo para o teste de corrida
    const raceUserId = crypto.randomUUID();
    const now = new Date();
    await db.insert(users).values({
      id: raceUserId,
      email: `race_user_${Date.now()}@carteiraexpert.test`,
      name: 'Race User',
      passwordHash: 'dummy_hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userPlans).values({
      id: crypto.randomUUID(),
      userId: raceUserId,
      planId: 'pro',
      status: 'active',
      startsAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const raceUser: SafeUser = {
      id: raceUserId,
      email: `race_user_${Date.now()}@carteiraexpert.test`,
      name: 'Race User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Dispara 2 transações concorrentes para inserir carteira REAL simultaneamente
      const results = await Promise.allSettled([
        db.transaction(async (tx) => {
          return createPortfolioInTransaction(
            {
              name: 'Corrida REAL A',
              baseCurrency: 'BRL',
              purpose: 'REAL',
            },
            raceUser,
            tx
          );
        }),
        db.transaction(async (tx) => {
          return createPortfolioInTransaction(
            {
              name: 'Corrida REAL B',
              baseCurrency: 'BRL',
              purpose: 'REAL',
            },
            raceUser,
            tx
          );
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exatamente uma teve sucesso e exatamente uma foi rejeitada
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // O erro rejeitado deve ser DuplicateRealPortfolioError
      const error = (rejected[0] as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(DuplicateRealPortfolioError);

      // Confirma que no banco existe exatamente UMA carteira REAL não excluída para o usuário
      const rows = await db
        .select()
        .from(portfolios)
        .where(
          and(
            eq(portfolios.userId, raceUserId),
            eq(portfolios.purpose, 'REAL'),
            isNull(portfolios.deletedAt)
          )
        );
      expect(rows).toHaveLength(1);

      // Limpeza das carteiras criadas na corrida
      const racePortIds = rows.map((r) => r.id);
      if (racePortIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.recordId, racePortIds));
        await db.delete(portfolios).where(inArray(portfolios.id, racePortIds));
      }
    } finally {
      await db.delete(userPlans).where(eq(userPlans.userId, raceUserId));
      await db.delete(auditLogs).where(eq(auditLogs.actorId, raceUserId));
      await db.delete(users).where(eq(users.id, raceUserId));
    }
  });

  it('não deve capturar ou mascarar outros erros 23505 como DuplicateRealPortfolioError', async () => {
    // Tenta violar a constraint única de email em users (não é idx_unique_user_real_portfolio)
    const duplicateEmail = testUser.email;
    let thrownError: any;
    try {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: duplicateEmail,
        name: 'Duplicate Email User',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    // O erro 23505 de users não deve ser instanciado como DuplicateRealPortfolioError
    expect(thrownError).not.toBeInstanceOf(DuplicateRealPortfolioError);
    const errorCode = (thrownError as any)?.code || (thrownError as any)?.cause?.code;
    expect(errorCode).toBe('23505');
  });
});
