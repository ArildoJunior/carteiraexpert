import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import * as currentUserModule from '../../../src/modules/identity/server/current-user';
import {
  createPortfolioAction,
  updatePortfolioAction,
  deletePortfolioAction,
  createCustomAssetAction,
  searchAssetsAction,
  createPortfolioEventAction,
  createBonusEventAction,
  createIncomeEventAction,
  cancelPortfolioEventAction,
  saveChartPreferenceAction,
  getUserChartPreferencesAction,
} from '../../../src/modules/portfolio/server/portfolio.actions';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { inArray, eq } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Portfolio Server Actions e Isolamento Multiusuário', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;
  let activeUser: SafeUser | null = null;

  const globalAssetId = crypto.randomUUID();
  const createdPortfolioIds: string[] = [];
  const createdAssetIds: string[] = [globalAssetId];
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    // Mock de requireAuth para apontar dinamicamente para o activeUser
    vi.spyOn(currentUserModule, 'requireAuth').mockImplementation(async () => {
      if (!activeUser) {
        throw new Error('UNAUTHORIZED');
      }
      return activeUser;
    });

    const now = new Date();

    // 1. Cria dois usuários reais
    await db.insert(users).values([
      {
        id: user1Id,
        email: `actions_user1_${Date.now()}@carteiraexpert.test`,
        name: 'Action User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `actions_user2_${Date.now()}@carteiraexpert.test`,
        name: 'Action User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `actions_user1_${Date.now()}@carteiraexpert.test`,
      name: 'Action User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `actions_user2_${Date.now()}@carteiraexpert.test`,
      name: 'Action User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Insere ativo global para testes de operações manuais
    await db.insert(assets).values({
      id: globalAssetId,
      ticker: `PETR4_${Date.now()}`,
      name: 'Petrobras PN Teste',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    // Limpeza rigorosa em ordem reversa de chaves estrangeiras
    try {
      if (createdEventIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdEventIds));
        await db.delete(portfolioEvents).where(inArray(portfolioEvents.id, createdEventIds));
      }
      // Limpa qualquer evento restante associado aos portfolios dos usuários de teste
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.createdBy, [user1Id, user2Id]));

      if (createdPortfolioIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdPortfolioIds));
        await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
      }
      // Limpa qualquer carteira restante associada aos usuários de teste
      await db.delete(portfolios).where(inArray(portfolios.userId, [user1Id, user2Id]));

      if (createdAssetIds.length > 0) {
        await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdAssetIds));
        await db.delete(assets).where(inArray(assets.id, createdAssetIds));
      }
      // Limpa qualquer ativo customizado restante associado aos usuários de teste
      await db.delete(assets).where(inArray(assets.userId, [user1Id, user2Id]));

      await db.delete(auditLogs).where(inArray(auditLogs.actorId, [user1Id, user2Id]));
      await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
    } catch (err) {
      console.warn('Aviso de limpeza de teste de integração:', err);
    }
  });

  beforeEach(() => {
    activeUser = user1;
  });

  // ─── 1. Autenticação e Autorização ──────────────────────────────────────────
  describe('Proteção de Autenticação nas Server Actions', () => {
    it('deve rejeitar chamadas de usuário não autenticado', async () => {
      activeUser = null;

      const formData = new FormData();
      formData.set('name', 'Tentativa Anônima');
      const res = await createPortfolioAction(null, formData);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Sessão expirada ou usuário não autenticado.');
    });
  });

  // ─── 2. Ciclo de Carteiras via Server Actions ───────────────────────────────
  describe('createPortfolioAction, updatePortfolioAction & deletePortfolioAction', () => {
    let portfolio1Id: string;

    it('deve criar uma carteira com sucesso e persistir no banco', async () => {
      const formData = new FormData();
      formData.set('name', 'Carteira Ações Action Test');
      formData.set('description', 'Descrição da carteira');
      formData.set('baseCurrency', 'BRL');

      const res = await createPortfolioAction(null, formData);

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.name).toBe('Carteira Ações Action Test');
      expect(res.data?.userId).toBe(user1Id);

      portfolio1Id = res.data!.id;
      createdPortfolioIds.push(portfolio1Id);
    });

    it('deve rejeitar criação de carteira com nome vazio', async () => {
      const formData = new FormData();
      formData.set('name', '   ');

      const res = await createPortfolioAction(null, formData);

      expect(res.success).toBe(false);
      expect(res.fieldErrors?.name).toBeDefined();
    });

    it('deve atualizar o nome da carteira com sucesso', async () => {
      const formData = new FormData();
      formData.set('id', portfolio1Id);
      formData.set('name', 'Carteira Ações Atualizada');

      const res = await updatePortfolioAction(null, formData);

      expect(res.success).toBe(true);
      expect(res.data?.name).toBe('Carteira Ações Atualizada');
    });

    it('deve bloquear tentativa do User 2 de atualizar carteira do User 1 (IDOR)', async () => {
      activeUser = user2;

      const formData = new FormData();
      formData.set('id', portfolio1Id);
      formData.set('name', 'Tentativa de Hack');

      const res = await updatePortfolioAction(null, formData);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Acesso não autorizado a este recurso.');
    });

    it('deve realizar exclusão lógica (soft delete) da carteira', async () => {
      const formData = new FormData();
      formData.set('id', portfolio1Id);

      const res = await deletePortfolioAction(null, formData);
      expect(res.success).toBe(true);

      const [row] = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, portfolio1Id));

      expect(row.deletedAt).not.toBeNull();
    });
  });

  // ─── 3. Ativos Customizados e Busca ──────────────────────────────────────────
  describe('createCustomAssetAction & searchAssetsAction', () => {
    let customAssetId: string;
    const ticker = `CUST_${Date.now()}`;

    it('deve permitir que User 1 cadastre ativo customizado', async () => {
      const formData = new FormData();
      formData.set('ticker', ticker);
      formData.set('name', 'Fundo Imobiliário Customizado');
      formData.set('currency', 'BRL');

      const res = await createCustomAssetAction(null, formData);

      expect(res.success).toBe(true);
      expect(res.data?.ticker).toBe(ticker.toUpperCase());
      expect(res.data?.isCustom).toBe(true);
      expect(res.data?.userId).toBe(user1Id);

      customAssetId = res.data!.id;
      createdAssetIds.push(customAssetId);
    });

    it('deve rejeitar duplicidade de ticker para o mesmo usuário', async () => {
      const formData = new FormData();
      formData.set('ticker', ticker);
      formData.set('name', 'Fundo Duplicado');
      formData.set('currency', 'BRL');

      const res = await createCustomAssetAction(null, formData);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Já existe um ativo customizado');
    });

    it('deve permitir que User 1 busque seu ativo customizado', async () => {
      const res = await searchAssetsAction(ticker);
      expect(res.success).toBe(true);
      expect(res.data.some((a) => a.id === customAssetId)).toBe(true);
    });

    it('deve garantir que User 2 NÃO visualize o ativo customizado do User 1', async () => {
      activeUser = user2;
      const res = await searchAssetsAction(ticker);
      expect(res.success).toBe(true);
      expect(res.data.some((a) => a.id === customAssetId)).toBe(false);
    });
  });

  // ─── 4. Operações Manuais e Cancelamento ─────────────────────────────────────
  describe('createPortfolioEventAction & cancelPortfolioEventAction', () => {
    let testPortfolioId: string;
    let eventId: string;

    beforeAll(async () => {
      activeUser = user1;
      const formData = new FormData();
      formData.set('name', 'Carteira Eventos Teste');
      formData.set('baseCurrency', 'BRL');
      const res = await createPortfolioAction(null, formData);
      testPortfolioId = res.data!.id;
      createdPortfolioIds.push(testPortfolioId);
    });

    it('deve registrar operação manual de compra com taxas e datas', async () => {
      const formData = new FormData();
      formData.set('portfolioId', testPortfolioId);
      formData.set('assetId', globalAssetId);
      formData.set('type', 'BUY');
      formData.set('tradeDate', '2026-08-14');
      formData.set('settlementDate', '2026-08-15');
      formData.set('quantity', '100');
      formData.set('unitPrice', '34.50');
      formData.set('fees', '5.00');
      formData.set('currency', 'BRL');
      formData.set('notes', 'Compra manual lote padrão');

      const res = await createPortfolioEventAction(null, formData);

      expect(res.success).toBe(true);
      expect(res.data?.type).toBe('BUY');
      expect(res.data?.quantity).toBe('100.0000000000');
      expect(res.data?.unitPrice).toBe('34.50000000');
      expect(res.data?.fees).toBe('5.00000000');

      eventId = res.data!.id;
      createdEventIds.push(eventId);
    });

    it('deve rejeitar venda com quantidade superior à posição disponível e permitir venda válida', async () => {
      // 1. Tenta vender 500 (posição disponível é 100)
      const excessFormData = new FormData();
      excessFormData.set('portfolioId', testPortfolioId);
      excessFormData.set('assetId', globalAssetId);
      excessFormData.set('type', 'SELL');
      excessFormData.set('tradeDate', '2026-08-14');
      excessFormData.set('quantity', '500');
      excessFormData.set('unitPrice', '40.00');
      excessFormData.set('fees', '2.50');
      excessFormData.set('currency', 'BRL');

      const excessRes = await createPortfolioEventAction(null, excessFormData);
      expect(excessRes.success).toBe(false);
      expect(excessRes.error).toContain('insuficiente');

      // 2. Vende 50 (válida dentro da posição de 100)
      const validFormData = new FormData();
      validFormData.set('portfolioId', testPortfolioId);
      validFormData.set('assetId', globalAssetId);
      validFormData.set('type', 'SELL');
      validFormData.set('tradeDate', '2026-08-14');
      validFormData.set('quantity', '50');
      validFormData.set('unitPrice', '40.00');
      validFormData.set('fees', '2.50');
      validFormData.set('currency', 'BRL');

      const validRes = await createPortfolioEventAction(null, validFormData);
      expect(validRes.success).toBe(true);
      expect(validRes.data?.type).toBe('SELL');
      createdEventIds.push(validRes.data!.id);
    });

    it('deve bloquear tentativa do User 2 de inserir evento na carteira do User 1', async () => {
      activeUser = user2;

      const formData = new FormData();
      formData.set('portfolioId', testPortfolioId);
      formData.set('assetId', globalAssetId);
      formData.set('type', 'BUY');
      formData.set('tradeDate', '2026-08-14');
      formData.set('quantity', '10');
      formData.set('unitPrice', '10.00');

      const res = await createPortfolioEventAction(null, formData);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Acesso não autorizado a este recurso.');
    });

    it('deve cancelar evento com justificativa obrigatória e manter persistência (soft delete)', async () => {
      activeUser = user1;

      // 1. Tentar cancelar a compra (que lastreou a venda de 50) deve falhar por inconsistência temporal
      const invalidCancelFormData = new FormData();
      invalidCancelFormData.set('id', eventId);
      invalidCancelFormData.set('portfolioId', testPortfolioId);
      invalidCancelFormData.set('cancellationReason', 'Tentando cancelar compra com venda posterior');

      const invalidRes = await cancelPortfolioEventAction(null, invalidCancelFormData);
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toContain('inconsistência');

      // 2. Cancelar a venda (que não deixa posições negativas) deve ter sucesso
      const sellEventId = createdEventIds[createdEventIds.length - 1];
      const validCancelFormData = new FormData();
      validCancelFormData.set('id', sellEventId);
      validCancelFormData.set('portfolioId', testPortfolioId);
      validCancelFormData.set('cancellationReason', 'Erro de digitação no preço da corretora');

      const res = await cancelPortfolioEventAction(null, validCancelFormData);
      expect(res.success).toBe(true);

      const [cancelledEvent] = await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.id, sellEventId));

      expect(cancelledEvent.deletedAt).not.toBeNull();
      expect(cancelledEvent.cancellationReason).toBe(
        'Erro de digitação no preço da corretora'
      );
    });

    it('deve rejeitar cancelamento com justificativa curta (< 5 chars)', async () => {
      const formData = new FormData();
      formData.set('id', eventId);
      formData.set('portfolioId', testPortfolioId);
      formData.set('cancellationReason', 'abc');

      const res = await cancelPortfolioEventAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.fieldErrors?.cancellationReason).toBeDefined();
    });

    it('deve criar evento de BONUS_SHARE com sucesso via createBonusEventAction', async () => {
      activeUser = user1;

      const formData = new FormData();
      formData.set('portfolioId', testPortfolioId);
      formData.set('assetId', globalAssetId);
      formData.set('tradeDate', '2026-08-15');
      formData.set('quantity', '10');
      formData.set('unitPrice', '15.40');
      formData.set('notes', 'Bonificação 10%');

      const res = await createBonusEventAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data?.type).toBe('BONUS_SHARE');

      if (res.data?.id) {
        createdEventIds.push(res.data.id);
      }
    });

    it('deve criar evento de DIVIDEND e JCP com sucesso via createIncomeEventAction', async () => {
      activeUser = user1;

      // Dividendo
      const divFormData = new FormData();
      divFormData.set('portfolioId', testPortfolioId);
      divFormData.set('assetId', globalAssetId);
      divFormData.set('type', 'DIVIDEND');
      divFormData.set('tradeDate', '2026-08-15');
      divFormData.set('settlementDate', '2026-08-20');
      divFormData.set('quantity', '50');
      divFormData.set('unitPrice', '0.80');
      divFormData.set('notes', 'Dividendo intermediário');

      const divRes = await createIncomeEventAction(null, divFormData);
      expect(divRes.success).toBe(true);
      expect(divRes.data?.type).toBe('DIVIDEND');

      if (divRes.data?.id) {
        createdEventIds.push(divRes.data.id);
      }

      // JCP
      const jcpFormData = new FormData();
      jcpFormData.set('portfolioId', testPortfolioId);
      jcpFormData.set('assetId', globalAssetId);
      jcpFormData.set('type', 'JCP');
      jcpFormData.set('tradeDate', '2026-08-15');
      jcpFormData.set('settlementDate', '2026-08-22');
      jcpFormData.set('quantity', '50');
      jcpFormData.set('unitPrice', '1.00');
      jcpFormData.set('fees', '7.50');
      jcpFormData.set('notes', 'JCP 3T');

      const jcpRes = await createIncomeEventAction(null, jcpFormData);
      expect(jcpRes.success).toBe(true);
      expect(jcpRes.data?.type).toBe('JCP');

      if (jcpRes.data?.id) {
        createdEventIds.push(jcpRes.data.id);
      }
    });
  });

  // ─── 5. PREFERÊNCIAS DE GRÁFICOS (SERVER ACTIONS) ──────────────────────────
  describe('5. Preferências de Gráficos (Server Actions)', () => {
    it('deve rejeitar chamadas não autenticadas', async () => {
      activeUser = null;

      const saveRes = await saveChartPreferenceAction({
        chartArea: 'portfolio_evolution',
        period: '1M',
        viewMode: 'market_value',
      });
      expect(saveRes.success).toBe(false);
      expect(saveRes.error).toContain('Sessão expirada ou usuário não autenticado');

      const getRes = await getUserChartPreferencesAction();
      expect(getRes.success).toBe(false);
      expect(getRes.error).toContain('Sessão expirada ou usuário não autenticado');
    });

    it('deve salvar e recuperar preferências derivando o usuário exclusivamente da sessão autenticada', async () => {
      activeUser = user1;

      // Tentar enviar userId malicioso no payload não deve afetar a persistência
      const saveRes = await saveChartPreferenceAction({
        chartArea: 'portfolio_evolution',
        period: '3M',
        viewMode: 'cost_basis',
        userId: user2Id, // Deve ser ignorado pelo schema e pelo servidor
      });

      expect(saveRes.success).toBe(true);
      expect(saveRes.data?.chartArea).toBe('portfolio_evolution');
      expect(saveRes.data?.period).toBe('3M');
      expect(saveRes.data?.viewMode).toBe('cost_basis');

      // Recupera preferências do user1
      const getRes = await getUserChartPreferencesAction();
      expect(getRes.success).toBe(true);
      expect(getRes.data?.portfolio_evolution?.period).toBe('3M');
      expect(getRes.data?.portfolio_evolution?.viewMode).toBe('cost_basis');

      // Troca para user2 e verifica que ele não possui a preferência do user1
      activeUser = user2;
      const getResUser2 = await getUserChartPreferencesAction();
      expect(getResUser2.success).toBe(true);
      expect(getResUser2.data?.portfolio_evolution).toBeUndefined();
    });
  });
});
