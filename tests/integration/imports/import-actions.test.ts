import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '@/lib/db/schema/portfolio';
import { importBatches, importBatchItems } from '@/lib/db/schema/imports';
import { userPlans } from '@/lib/db/schema/plans';
import * as currentUserModule from '@/modules/identity/server/current-user';
import * as consentServiceModule from '@/modules/identity/server/consent-service';
import {
  processImportUploadAction,
  toggleImportBatchItemExclusionAction,
  updateImportBatchItemAction,
  resolveUnmappedBatchItemAssetAction,
  confirmImportBatchAction,
  rejectImportBatchAction,
} from '@/modules/imports/server/import.actions';
import {
  processImportUpload,
  getImportBatchById,
} from '@/modules/imports/server/import.service';
import { createPortfolio } from '@/modules/portfolio/server/portfolio.service';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { eq, inArray, and, isNull, or } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Server Actions do Módulo de Importações (PostgreSQL Real)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;
  let activeUser: SafeUser | null = null;

  let portfolio1Id: string;
  let portfolio2Id: string;

  let petr4GlobalAssetId: string;
  let vale3GlobalAssetId: string;

  const createdBatchIds: string[] = [];

  beforeAll(async () => {
    // Spies para autenticação de Server Actions
    vi.spyOn(currentUserModule, 'requireAuth').mockImplementation(async () => {
      if (!activeUser) {
        throw new Error('UNAUTHORIZED');
      }
      return activeUser;
    });
    vi.spyOn(consentServiceModule, 'hasAcceptedCurrentTerms').mockResolvedValue(true);

    const now = new Date();
    const timestamp = Date.now();

    // 1. Cria usuários reais
    await db.insert(users).values([
      {
        id: user1Id,
        email: `actions_imp_user1_${timestamp}@carteiraexpert.test`,
        name: 'Actions Import User 1',
        passwordHash: 'dummy_hash_1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `actions_imp_user2_${timestamp}@carteiraexpert.test`,
        name: 'Actions Import User 2',
        passwordHash: 'dummy_hash_2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `actions_imp_user1_${timestamp}@carteiraexpert.test`,
      name: 'Actions Import User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `actions_imp_user2_${timestamp}@carteiraexpert.test`,
      name: 'Actions Import User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Concede plano PRO aos usuários de teste
    await db.insert(userPlans).values([
      {
        id: crypto.randomUUID(),
        userId: user1Id,
        planId: 'pro',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: user2Id,
        planId: 'pro',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 3. Cria carteiras para User 1 e User 2
    const p1 = await createPortfolio({ name: 'Carteira Actions 1', baseCurrency: 'BRL' }, user1);
    portfolio1Id = p1.id;

    const p2 = await createPortfolio({ name: 'Carteira Actions 2', baseCurrency: 'BRL' }, user2);
    portfolio2Id = p2.id;

    // 4. Busca ou cria ativos globais
    let [petr4] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.ticker, 'PETR4'), eq(assets.market, 'B3'), isNull(assets.userId)))
      .limit(1);

    if (!petr4) {
      const [inserted] = await db
        .insert(assets)
        .values({
          id: crypto.randomUUID(),
          ticker: 'PETR4',
          name: 'Petrobras PN',
          assetType: 'stock',
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
        })
        .returning();
      petr4 = inserted;
    }
    petr4GlobalAssetId = petr4.id;

    let [vale3] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.ticker, 'VALE3'), eq(assets.market, 'B3'), isNull(assets.userId)))
      .limit(1);

    if (!vale3) {
      const [inserted] = await db
        .insert(assets)
        .values({
          id: crypto.randomUUID(),
          ticker: 'VALE3',
          name: 'Vale ON',
          assetType: 'stock',
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
        })
        .returning();
      vale3 = inserted;
    }
    vale3GlobalAssetId = vale3.id;
  });

  beforeEach(() => {
    activeUser = user1;
  });

  afterAll(async () => {
    // Limpeza
    if (createdBatchIds.length > 0) {
      await db.delete(importBatchItems).where(inArray(importBatchItems.batchId, createdBatchIds));
      await db.delete(importBatches).where(inArray(importBatches.id, createdBatchIds));
    }

    await db.delete(portfolioEvents).where(
      inArray(portfolioEvents.portfolioId, [portfolio1Id, portfolio2Id])
    );
    await db.delete(portfolios).where(
      inArray(portfolios.id, [portfolio1Id, portfolio2Id])
    );
    await db.delete(assets).where(inArray(assets.userId, [user1Id, user2Id]));
    await db.delete(userPlans).where(inArray(userPlans.userId, [user1Id, user2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  describe('processImportUploadAction', () => {
    it('deve processar upload de arquivo CSV via Server Action com sucesso', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const result = await processImportUploadAction({
        fileName: 'upload_action_test.csv',
        fileSize: Buffer.byteLength(csvContent),
        fileContent: csvContent,
        portfolioId: portfolio1Id,
      });

      expect(result.success).toBe(true);
      expect(result.data?.batchId).toBeDefined();
      expect(result.data?.totalRecords).toBe(1);
      expect(result.data?.validRecords).toBe(1);

      if (result.data?.batchId) {
        createdBatchIds.push(result.data.batchId);
      }
    });

    it('deve rejeitar upload quando o usuário não estiver autenticado', async () => {
      activeUser = null;
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const result = await processImportUploadAction({
        fileName: 'unauth_test.csv',
        fileSize: Buffer.byteLength(csvContent),
        fileContent: csvContent,
        portfolioId: portfolio1Id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED');
    });

    it('deve rejeitar upload se a carteira pertencer a outro usuário (IDOR)', async () => {
      activeUser = user2; // User 2 tenta enviar para portfolio1 (do User 1)
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const result = await processImportUploadAction({
        fileName: 'idor_test.csv',
        fileSize: Buffer.byteLength(csvContent),
        fileContent: csvContent,
        portfolioId: portfolio1Id,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Acesso negado ao recurso solicitado.');
    });
  });

  describe('toggleImportBatchItemExclusionAction', () => {
    it('deve desmarcar e remarcar item do lote com persistência no banco', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileName: 'toggle_test.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const itemId = upload.items[0].id;

      // Desmarca (isExcluded = true)
      const res1 = await toggleImportBatchItemExclusionAction({
        batchId: upload.batch.id,
        itemId,
        isExcluded: true,
      });

      expect(res1.success).toBe(true);
      expect(res1.data?.isExcluded).toBe(true);

      const check1 = await getImportBatchById(upload.batch.id, user1);
      expect(check1.items[0].isExcluded).toBe(true);

      // Reativa (isExcluded = false)
      const res2 = await toggleImportBatchItemExclusionAction({
        batchId: upload.batch.id,
        itemId,
        isExcluded: false,
      });

      expect(res2.success).toBe(true);
      expect(res2.data?.isExcluded).toBe(false);

      const check2 = await getImportBatchById(upload.batch.id, user1);
      expect(check2.items[0].isExcluded).toBe(false);
    });

    it('deve bloquear toggle por outro usuário (IDOR)', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileName: 'toggle_idor.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      activeUser = user2; // User 2 tenta alterar item do User 1
      const res = await toggleImportBatchItemExclusionAction({
        batchId: upload.batch.id,
        itemId: upload.items[0].id,
        isExcluded: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Acesso negado ao recurso solicitado.');
    });
  });

  describe('updateImportBatchItemAction', () => {
    it('deve atualizar campos de um item em pending_review com sucesso', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileName: 'edit_action_test.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const itemId = upload.items[0].id;

      const editResult = await updateImportBatchItemAction(
        upload.batch.id,
        itemId,
        {
          actionType: 'BUY',
          direction: null,
          rawTicker: 'VALE3',
          tradeDate: '2026-01-15T12:00:00.000Z',
          quantity: '200',
          unitPrice: '65.00',
          fees: '10.00',
          currency: 'BRL',
          notes: 'Nota atualizada via Server Action',
          isExcluded: false,
        }
      );

      expect(editResult.success).toBe(true);

      const updated = await getImportBatchById(upload.batch.id, user1);
      const item = updated.items[0];
      expect(item.rawTicker).toBe('VALE3');
      expect(item.quantity.toString()).toBe('200');
      expect(item.unitPrice.toString()).toBe('65');
      expect(item.fees.toString()).toBe('10');
      expect(item.notes).toBe('Nota atualizada via Server Action');
      expect(item.resolvedAssetId).toBe(vale3GlobalAssetId);
    });
  });

  describe('resolveUnmappedBatchItemAssetAction', () => {
    it('deve resolver ativo não identificado associando a um ativo global existente', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;TICKERDESCONHECIDO;10;50,00';
      const upload = await processImportUpload(
        {
          fileName: 'resolve_existing_test.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const itemId = upload.items[0].id;
      expect(upload.items[0].status).toBe('warning');
      expect(upload.items[0].resolvedAssetId).toBeNull();

      const resolveRes = await resolveUnmappedBatchItemAssetAction({
        batchId: upload.batch.id,
        itemId,
        action: 'select_existing',
        existingAssetId: petr4GlobalAssetId,
      });

      expect(resolveRes.success).toBe(true);

      const resolved = await getImportBatchById(upload.batch.id, user1);
      expect(resolved.items[0].resolvedAssetId).toBe(petr4GlobalAssetId);
      expect(resolved.items[0].status).toBe('valid');
      expect(resolved.batch.validRecords).toBe(1);
      expect(resolved.batch.warningRecords).toBe(0);
    });

    it('deve resolver ativo criando ativo customizado pertencente ao usuário', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;STARTUPXYZ;10;1000,00';
      const upload = await processImportUpload(
        {
          fileName: 'resolve_custom_test.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const itemId = upload.items[0].id;

      const resolveRes = await resolveUnmappedBatchItemAssetAction({
        batchId: upload.batch.id,
        itemId,
        action: 'create_custom',
        customAssetData: {
          name: 'Minha Startup Participações',
          currency: 'BRL',
        },
      });

      expect(resolveRes.success).toBe(true);

      const resolved = await getImportBatchById(upload.batch.id, user1);
      expect(resolved.items[0].resolvedAssetId).not.toBeNull();
      expect(resolved.items[0].status).toBe('valid');

      // Verifica se o ativo customizado foi realmente criado no banco para o User 1
      const [customAsset] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, resolved.items[0].resolvedAssetId!));

      expect(customAsset).toBeDefined();
      expect(customAsset.userId).toBe(user1.id);
      expect(customAsset.isCustom).toBe(true);
      expect(customAsset.name).toBe('Minha Startup Participações');
    });
  });

  describe('Bloqueio de Edição em Lotes Confirmados ou Rejeitados', () => {
    it('deve impedir edição e resolução de ativo em lote já confirmado', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileName: 'confirmed_no_edit.csv',
          fileSize: Buffer.byteLength(csvContent),
          fileContent: csvContent,
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Confirma o lote
      await confirmImportBatchAction({ batchId: upload.batch.id });

      // Tentativa de editar item deve falhar com erro amigável
      const editRes = await updateImportBatchItemAction(
        upload.batch.id,
        upload.items[0].id,
        {
          actionType: 'BUY',
          direction: null,
          rawTicker: 'PETR4',
          tradeDate: '2026-01-10T12:00:00.000Z',
          quantity: '500',
          unitPrice: '38.50',
          fees: '0',
          currency: 'BRL',
          notes: null,
          isExcluded: false,
        }
      );

      expect(editRes.success).toBe(false);
      expect(editRes.error).toBe(
        'Este lote de importação não pode mais ser editado pois já foi confirmado ou finalizado.'
      );
    });
  });
});
