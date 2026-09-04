import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets } from '../../../src/lib/db/schema/portfolio';
import { custodyInstitutions, custodyAccounts } from '../../../src/lib/db/schema/custody';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { optionsContracts } from '../../../src/lib/db/schema/options';
import {
  listUserOptions,
  getOptionContractById,
  createOptionContract,
  updateOptionStatus,
  deleteOptionContract,
  getUserOptionAlerts,
  getOptionContractAnalytics,
} from '../../../src/modules/options/server/options.service';
import {
  OptionContractNotFoundError,
  UnderlyingAssetNotFoundError,
} from '../../../src/modules/options/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { Decimal } from '../../../src/lib/decimal';

describe('Integração: Módulo de Opções e Derivativos (Etapa 8)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let userA: SafeUser;
  let userB: SafeUser;

  const portfolioAId = crypto.randomUUID();
  const portfolioBId = crypto.randomUUID();

  const assetAId = crypto.randomUUID();
  const assetBId = crypto.randomUUID();

  const custodyAccountId = crypto.randomUUID();
  const createdContractIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();

    // 1. Criar Usuários A e B
    await db.insert(users).values([
      {
        id: userAId,
        email: `opt_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Options User A',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `opt_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Options User B',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Planos PRO para ambos
    await db.insert(userPlans).values([
      {
        id: crypto.randomUUID(),
        userId: userAId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: userBId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    userA = {
      id: userAId,
      email: `opt_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Options User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `opt_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Options User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Carteiras
    await db.insert(portfolios).values([
      {
        id: portfolioAId,
        userId: userAId,
        name: 'Carteira Opções A',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: portfolioBId,
        userId: userBId,
        name: 'Carteira Opções B',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 4. Ativos-objeto customizados dos usuários
    await db.insert(assets).values([
      {
        id: assetAId,
        userId: userAId,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetType: 'stock',
        isCustom: true,
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: assetBId,
        userId: userBId,
        ticker: 'VALE3',
        name: 'Vale ON',
        assetType: 'stock',
        isCustom: true,
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 5. Instituição e Conta de Custódia para Usuário A
    const [inst] = await db
      .select()
      .from(custodyInstitutions)
      .where(eq(custodyInstitutions.code, '102'))
      .limit(1);

    const instId = inst ? inst.id : crypto.randomUUID();
    if (!inst) {
      await db.insert(custodyInstitutions).values({
        id: instId,
        name: 'XP Test',
        code: 'XP_OPT_TEST',
        country: 'BR',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(custodyAccounts).values({
      id: custodyAccountId,
      portfolioId: portfolioAId,
      institutionId: instId,
      name: 'Conta XP Opções',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    // Cleanup reversivo
    if (createdContractIds.length > 0) {
      await db.delete(optionsContracts).where(inArray(optionsContracts.id, createdContractIds));
    }
    await db.delete(custodyAccounts).where(eq(custodyAccounts.id, custodyAccountId));
    await db.delete(assets).where(inArray(assets.id, [assetAId, assetBId]));
    await db.delete(portfolios).where(inArray(portfolios.id, [portfolioAId, portfolioBId]));
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  describe('1. Cadastro de Contratos de Opções e Persistência Relacional', () => {
    it('deve cadastrar contrato de CALL comprada com custódia associada e emitir audit log', async () => {
      const contract = await createOptionContract(
        {
          portfolioId: portfolioAId,
          underlyingAssetId: assetAId,
          custodyAccountId,
          ticker: 'PETRH380',
          optionType: 'CALL',
          optionStyle: 'AMERICAN',
          direction: 'BUY',
          strikePrice: '38.00',
          premiumPaidReceived: '1.50',
          quantity: '100',
          expirationDate: '2026-12-18',
          notes: 'CALL comprada para trava ou hedge descritivo',
        },
        userA
      );

      createdContractIds.push(contract.id);

      expect(contract.id).toBeDefined();
      expect(contract.userId).toBe(userAId);
      expect(contract.ticker).toBe('PETRH380');
      expect(contract.strikePrice.toFixed(2)).toBe('38.00');
      expect(contract.premiumPaidReceived.toFixed(2)).toBe('1.50');
      expect(contract.quantity.toFixed(0)).toBe('100');
      expect(contract.status).toBe('OPEN');
      expect(contract.underlyingAssetTicker).toBe('PETR4');
      expect(contract.custodyAccountName).toBe('Conta XP Opções');

      // Verificar persistência no banco
      const [persisted] = await db
        .select()
        .from(optionsContracts)
        .where(eq(optionsContracts.id, contract.id));

      expect(persisted).toBeDefined();
      expect(persisted.ticker).toBe('PETRH380');
      expect(persisted.optionType).toBe('CALL');

      // Verificar audit log
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.recordId, contract.id));

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].tableName).toBe('options_contracts');
      expect(logs[0].action).toBe('INSERT');
    });

    it('deve cadastrar contrato de PUT vendida sem custódia associada', async () => {
      const contract = await createOptionContract(
        {
          portfolioId: portfolioAId,
          underlyingAssetId: assetAId,
          ticker: 'PETRT350',
          optionType: 'PUT',
          optionStyle: 'AMERICAN',
          direction: 'SELL',
          strikePrice: '35.00',
          premiumPaidReceived: '0.80',
          quantity: '200',
          expirationDate: '2026-12-18',
          notes: 'PUT vendida coberta descritiva',
        },
        userA
      );

      createdContractIds.push(contract.id);

      expect(contract.custodyAccountId).toBeNull();
      expect(contract.direction).toBe('SELL');
      expect(contract.optionType).toBe('PUT');
      expect(contract.quantity.toFixed(0)).toBe('200');
    });
  });

  describe('2. Segurança, Isolamento Multiusuário e Anti-IDOR', () => {
    it('Usuário B não deve conseguir ler contrato do Usuário A por ID', async () => {
      const contractAId = createdContractIds[0];

      await expect(getOptionContractById(contractAId, userB)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('Usuário B não deve conseguir cadastrar contrato apontando para carteira do Usuário A', async () => {
      await expect(
        createOptionContract(
          {
            portfolioId: portfolioAId, // Carteira do User A
            underlyingAssetId: assetBId,
            ticker: 'VALEL800',
            optionType: 'CALL',
            direction: 'BUY',
            strikePrice: '80.00',
            premiumPaidReceived: '2.00',
            quantity: '100',
            expirationDate: '2026-12-18',
          },
          userB
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('Usuário A não deve conseguir cadastrar contrato com ativo pertencente ao Usuário B', async () => {
      await expect(
        createOptionContract(
          {
            portfolioId: portfolioAId,
            underlyingAssetId: assetBId, // Ativo do User B
            ticker: 'VALEL800',
            optionType: 'CALL',
            direction: 'BUY',
            strikePrice: '80.00',
            premiumPaidReceived: '2.00',
            quantity: '100',
            expirationDate: '2026-12-18',
          },
          userA
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('listUserOptions não deve retornar contratos de outro usuário', async () => {
      const listA = await listUserOptions(userA);
      const listB = await listUserOptions(userB);

      expect(listA.length).toBeGreaterThanOrEqual(2);
      expect(listB.length).toBe(0);

      const aIds = listA.map((c) => c.id);
      expect(aIds).toContain(createdContractIds[0]);
    });
  });

  describe('3. Atualização de Status e Exclusão Lógica', () => {
    it('deve atualizar o status do contrato para CLOSED com emissão de auditoria', async () => {
      const contractId = createdContractIds[1];
      const updated = await updateOptionStatus(contractId, 'CLOSED', userA);

      expect(updated.status).toBe('CLOSED');

      const [persisted] = await db
        .select()
        .from(optionsContracts)
        .where(eq(optionsContracts.id, contractId));

      expect(persisted.status).toBe('CLOSED');
    });

    it('deve executar exclusão lógica (soft delete) e impedir listagem', async () => {
      const contractId = createdContractIds[1];
      await deleteOptionContract(contractId, userA);

      const list = await listUserOptions(userA);
      const exists = list.some((c) => c.id === contractId);
      expect(exists).toBe(false);

      // Deve falhar ao buscar por ID
      await expect(getOptionContractById(contractId, userA)).rejects.toThrow(
        OptionContractNotFoundError
      );
    });

    it('Usuário B não deve conseguir excluir contrato do Usuário A', async () => {
      const contractAId = createdContractIds[0];
      await expect(deleteOptionContract(contractAId, userB)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('4. Alertas de Proximidade e Analytics Integrados', () => {
    it('deve gerar alertas de proximidade para opções em D-5 a D-0', async () => {
      // Cria contrato para teste de alerta com vencimento em 2026-09-11
      const alertContract = await createOptionContract(
        {
          portfolioId: portfolioAId,
          underlyingAssetId: assetAId,
          ticker: 'PETRI380',
          optionType: 'CALL',
          direction: 'BUY',
          strikePrice: '38.00',
          premiumPaidReceived: '1.20',
          quantity: '100',
          expirationDate: '2026-09-11',
        },
        userA
      );
      createdContractIds.push(alertContract.id);

      // Referência: terça 2026-09-08 (3 dias úteis até 11/09)
      const alerts = await getUserOptionAlerts(userA, '2026-09-08');
      const matchingAlert = alerts.find((a) => a.contractId === alertContract.id);

      expect(matchingAlert).toBeDefined();
      expect(matchingAlert?.status).toBe('NEAR_EXPIRATION');
      expect(matchingAlert?.businessDaysRemaining).toBe(3);
      expect(matchingAlert?.alertLevel).toBe('WARNING');
    });

    it('deve apurar gregas e payoff para um contrato persistido', async () => {
      const contractId = createdContractIds[0];
      const analytics = await getOptionContractAnalytics(contractId, userA, {
        spotPrice: '38.50',
        riskFreeRate: '0.105',
        volatility: '0.30',
        referenceDate: '2026-09-01',
      });

      expect(analytics.contract.ticker).toBe('PETRH380');
      expect(analytics.greeks.delta.greaterThan(new Decimal('0'))).toBe(true);
      expect(analytics.greeks.gamma.greaterThan(new Decimal('0'))).toBe(true);
      expect(analytics.payoff.points.length).toBeGreaterThan(10);
      expect(analytics.payoff.breakevenPrice.toFixed(2)).toBe('39.50'); // Strike 38 + Premium 1.50
    });
  });
});
