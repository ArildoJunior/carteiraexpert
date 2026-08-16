import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

async function expectDbError(promise: Promise<any>, pattern: RegExp) {
  try {
    await promise;
    expect.unreachable('Deveria ter lançado erro de restrição no PostgreSQL');
  } catch (err: any) {
    const errorDetails = [
      err?.message,
      err?.cause?.message,
      err?.cause?.constraint,
      err?.cause?.constraint_name,
      err?.cause?.detail,
    ]
      .filter(Boolean)
      .join(' ');

    expect(errorDetails).toMatch(pattern);
  }
}

describe('Integração: Constraints Físicas e Índices de Portfolio Core', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();
  let portfolio1Id: string;

  beforeAll(async () => {
    // 1. Cria dois usuários para os testes de isolamento e unicidade
    await db.insert(users).values([
      {
        id: user1Id,
        email: `schema_user1_${Date.now()}@carteiraexpert.test`,
        name: 'Schema User 1',
        passwordHash: 'dummy_hash_1',
      },
      {
        id: user2Id,
        email: `schema_user2_${Date.now()}@carteiraexpert.test`,
        name: 'Schema User 2',
        passwordHash: 'dummy_hash_2',
      },
    ]);

    // 2. Cria carteira para o User 1
    portfolio1Id = crypto.randomUUID();
    await db.insert(portfolios).values({
      id: portfolio1Id,
      userId: user1Id,
      name: 'Carteira Teste Constraints',
      baseCurrency: 'BRL',
      status: 'active',
    });
  });

  afterAll(async () => {
    // Limpeza em ordem reversa para respeitar as chaves estrangeiras
    await db.delete(portfolioEvents).where(eq(portfolioEvents.portfolioId, portfolio1Id));
    await db.delete(portfolios).where(eq(portfolios.id, portfolio1Id));
    await db.delete(assets).where(inArray(assets.userId, [user1Id, user2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  // ─── 1. Validação de Constraints em Assets (is_custom vs user_id) ─────────
  describe('Tabela assets: Coerência de is_custom e user_id', () => {
    it('deve rejeitar ativo customizado (is_custom = true) sem user_id', async () => {
      await expectDbError(
        db.insert(assets).values({
          id: crypto.randomUUID(),
          ticker: 'CUSTOM_NO_USER',
          name: 'Ativo Customizado Sem User',
          assetType: 'custom',
          market: 'CUSTOM',
          isCustom: true,
          userId: null,
        }),
        /chk_assets_custom_user/
      );
    });

    it('deve rejeitar ativo global (is_custom = false) com user_id preenchido', async () => {
      await expectDbError(
        db.insert(assets).values({
          id: crypto.randomUUID(),
          ticker: 'GLOBAL_WITH_USER',
          name: 'Ativo Global Com User',
          assetType: 'stock',
          market: 'B3',
          isCustom: false,
          userId: user1Id,
        }),
        /chk_assets_custom_user/
      );
    });

    it('deve aceitar ativo global válido (is_custom = false e user_id = null)', async () => {
      const assetId = crypto.randomUUID();
      const ticker = `GLOB_${Date.now()}`;
      await db.insert(assets).values({
        id: assetId,
        ticker,
        name: 'Ativo Global Válido',
        assetType: 'stock',
        market: 'B3',
        isCustom: false,
        userId: null,
      });

      const rows = await db.select().from(assets).where(eq(assets.id, assetId));
      expect(rows).toHaveLength(1);
      expect(rows[0].isCustom).toBe(false);
      expect(rows[0].userId).toBeNull();

      // Limpeza
      await db.delete(assets).where(eq(assets.id, assetId));
    });

    it('deve aceitar ativo customizado válido (is_custom = true e user_id preenchido)', async () => {
      const assetId = crypto.randomUUID();
      const ticker = `CUST_${Date.now()}`;
      await db.insert(assets).values({
        id: assetId,
        ticker,
        name: 'Ativo Custom Válido',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
        userId: user1Id,
      });

      const rows = await db.select().from(assets).where(eq(assets.id, assetId));
      expect(rows).toHaveLength(1);
      expect(rows[0].isCustom).toBe(true);
      expect(rows[0].userId).toBe(user1Id);

      // Limpeza
      await db.delete(assets).where(eq(assets.id, assetId));
    });
  });

  // ─── 2. Unicidade e Índices Parciais em Assets ─────────────────────────────
  describe('Tabela assets: Unicidade de Ticker por Mercado', () => {
    it('deve rejeitar ativo global duplicado com mesmo ticker e market', async () => {
      const ticker = `DUP_GLOB_${Date.now()}`;
      const asset1Id = crypto.randomUUID();
      const asset2Id = crypto.randomUUID();

      await db.insert(assets).values({
        id: asset1Id,
        ticker,
        name: 'Global 1',
        assetType: 'stock',
        market: 'B3',
        isCustom: false,
        userId: null,
      });

      try {
        await expectDbError(
          db.insert(assets).values({
            id: asset2Id,
            ticker,
            name: 'Global 2',
            assetType: 'stock',
            market: 'B3',
            isCustom: false,
            userId: null,
          }),
          /idx_assets_global_ticker_market|unique constraint/i
        );
      } finally {
        await db.delete(assets).where(eq(assets.id, asset1Id));
      }
    });

    it('deve rejeitar ativo customizado duplicado para o mesmo usuário com mesmo ticker e market', async () => {
      const ticker = `DUP_USER_${Date.now()}`;
      const asset1Id = crypto.randomUUID();
      const asset2Id = crypto.randomUUID();

      await db.insert(assets).values({
        id: asset1Id,
        ticker,
        name: 'User Custom 1',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
        userId: user1Id,
      });

      try {
        await expectDbError(
          db.insert(assets).values({
            id: asset2Id,
            ticker,
            name: 'User Custom 2',
            assetType: 'custom',
            market: 'CUSTOM',
            isCustom: true,
            userId: user1Id,
          }),
          /idx_assets_user_ticker_market|unique constraint/i
        );
      } finally {
        await db.delete(assets).where(eq(assets.id, asset1Id));
      }
    });

    it('deve permitir que usuários diferentes criem ativos customizados com o mesmo ticker e market', async () => {
      const ticker = `SAME_TICKER_${Date.now()}`;
      const asset1Id = crypto.randomUUID();
      const asset2Id = crypto.randomUUID();

      await db.insert(assets).values([
        {
          id: asset1Id,
          ticker,
          name: 'User 1 Custom Asset',
          assetType: 'custom',
          market: 'B3',
          isCustom: true,
          userId: user1Id,
        },
        {
          id: asset2Id,
          ticker,
          name: 'User 2 Custom Asset',
          assetType: 'custom',
          market: 'B3',
          isCustom: true,
          userId: user2Id,
        },
      ]);

      const rows = await db.select().from(assets).where(inArray(assets.id, [asset1Id, asset2Id]));
      expect(rows).toHaveLength(2);

      // Limpeza
      await db.delete(assets).where(inArray(assets.id, [asset1Id, asset2Id]));
    });
  });

  // ─── 3. Validação de Check Constraints em Portfolio Events ────────────────
  describe('Tabela portfolio_events: Check Constraints Numéricas', () => {
    let globalAssetId: string;

    beforeAll(async () => {
      globalAssetId = crypto.randomUUID();
      await db.insert(assets).values({
        id: globalAssetId,
        ticker: `PETR_TEST_${Date.now()}`,
        name: 'Petrobras Test Asset',
        assetType: 'stock',
        market: 'B3',
        isCustom: false,
        userId: null,
      });
    });

    afterAll(async () => {
      await db.delete(portfolioEvents).where(eq(portfolioEvents.assetId, globalAssetId));
      await db.delete(assets).where(eq(assets.id, globalAssetId));
    });

    it('deve rejeitar quantity igual a zero (chk_portfolio_events_quantity)', async () => {
      await expectDbError(
        db.insert(portfolioEvents).values({
          id: crypto.randomUUID(),
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date(),
          quantity: '0.0000000000',
          unitPrice: '35.50000000',
          fees: '0.00000000',
          createdBy: user1Id,
        }),
        /chk_portfolio_events_quantity/
      );
    });

    it('deve rejeitar quantity negativa (chk_portfolio_events_quantity)', async () => {
      await expectDbError(
        db.insert(portfolioEvents).values({
          id: crypto.randomUUID(),
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date(),
          quantity: '-10.0000000000',
          unitPrice: '35.50000000',
          fees: '0.00000000',
          createdBy: user1Id,
        }),
        /chk_portfolio_events_quantity/
      );
    });

    it('deve rejeitar unit_price negativo (chk_portfolio_events_unit_price)', async () => {
      await expectDbError(
        db.insert(portfolioEvents).values({
          id: crypto.randomUUID(),
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date(),
          quantity: '100.0000000000',
          unitPrice: '-1.00000000',
          fees: '0.00000000',
          createdBy: user1Id,
        }),
        /chk_portfolio_events_unit_price/
      );
    });

    it('deve rejeitar fees negativo (chk_portfolio_events_fees)', async () => {
      await expectDbError(
        db.insert(portfolioEvents).values({
          id: crypto.randomUUID(),
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date(),
          quantity: '100.0000000000',
          unitPrice: '35.50000000',
          fees: '-5.00000000',
          createdBy: user1Id,
        }),
        /chk_portfolio_events_fees/
      );
    });

    it('deve aceitar evento com valores positivos válidos', async () => {
      const eventId = crypto.randomUUID();
      await db.insert(portfolioEvents).values({
        id: eventId,
        portfolioId: portfolio1Id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-08-14T10:00:00Z'),
        quantity: '100.0000000000',
        unitPrice: '38.45000000',
        fees: '4.50000000',
        currency: 'BRL',
        source: 'manual',
        createdBy: user1Id,
      });

      const rows = await db.select().from(portfolioEvents).where(eq(portfolioEvents.id, eventId));
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe('100.0000000000');
      expect(rows[0].unitPrice).toBe('38.45000000');
      expect(rows[0].fees).toBe('4.50000000');

      // Limpeza
      await db.delete(portfolioEvents).where(eq(portfolioEvents.id, eventId));
    });
  });
});
