import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '@/lib/db/schema/portfolio';
import { importBatches, importBatchItems } from '@/lib/db/schema/imports';
import { auditLogs } from '@/lib/db/schema/audit';
import * as currentUserModule from '@/modules/identity/server/current-user';
import * as consentServiceModule from '@/modules/identity/server/consent-service';
import {
  processImportUpload,
  confirmImportBatch,
  rejectImportBatch,
  getImportBatchById,
  toggleImportBatchItemExclusion,
} from '@/modules/imports/server/import.service';
import {
  confirmImportBatchAction,
  rejectImportBatchAction,
} from '@/modules/imports/server/import.actions';
import { createPortfolio } from '@/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '@/modules/portfolio/server/asset.service';
import {
  ImportBatchNotFoundError,
  ImportBatchNotEditableError,
} from '@/modules/imports/domain/errors';
import { InsufficientPositionError } from '@/modules/portfolio/domain/errors';
import { PortfolioFrozenError } from '@/modules/plans/domain/errors';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import { calculateFileHash } from '@/modules/imports/domain/import-utils';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { eq, inArray, and, isNull, or, desc } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Confirmação e Rejeição Transacional de Lotes (PostgreSQL Real)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;
  let activeUser: SafeUser | null = null;

  let portfolio1Id: string;
  let portfolio2Id: string;
  let frozenPortfolioId: string;

  let petr4GlobalAssetId: string;
  let vale3GlobalAssetId: string;
  let customAssetUser1Id: string;
  let customAssetUser1Ticker: string;

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

    // 1. Cria 2 usuários reais
    await db.insert(users).values([
      {
        id: user1Id,
        email: `confirm_user1_${timestamp}@carteiraexpert.test`,
        name: 'Confirm User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `confirm_user2_${timestamp}@carteiraexpert.test`,
        name: 'Confirm User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `confirm_user1_${timestamp}@carteiraexpert.test`,
      name: 'Confirm User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `confirm_user2_${timestamp}@carteiraexpert.test`,
      name: 'Confirm User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Cria carteira principal do User 1 e User 2
    const port1 = await createPortfolio(
      { name: 'Carteira Confirmação User 1', baseCurrency: 'BRL' },
      user1
    );
    portfolio1Id = port1.id;

    const port2 = await createPortfolio(
      { name: 'Carteira Confirmação User 2', baseCurrency: 'BRL' },
      user2
    );
    portfolio2Id = port2.id;

    // 3. Cria carteira congelada
    const [frozenPort] = await db
      .insert(portfolios)
      .values({
        id: crypto.randomUUID(),
        userId: user1.id,
        name: 'Carteira Congelada Confirmação',
        baseCurrency: 'BRL',
        status: 'frozen',
        purpose: 'ESTUDO',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    frozenPortfolioId = frozenPort.id;

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

    // 5. Cria ativo customizado para o User 1
    const cust1 = await createCustomAsset(
      {
        ticker: `CUSTCONF_${timestamp.toString().slice(-4)}`,
        name: 'Ativo Customizado Confirmação',
        currency: 'BRL',
      },
      user1
    );
    customAssetUser1Id = cust1.id;
    customAssetUser1Ticker = cust1.ticker;
  });

  afterEach(async () => {
    // Remove eventos gerados para garantir isolamento e evitar colisão de deduplicação entre testes
    await db.delete(portfolioEvents).where(
      inArray(portfolioEvents.portfolioId, [portfolio1Id, portfolio2Id, frozenPortfolioId])
    );
  });

  afterAll(async () => {
    // Limpeza rigorosa na ordem reversa de chaves estrangeiras
    if (createdBatchIds.length > 0) {
      await db.delete(importBatchItems).where(inArray(importBatchItems.batchId, createdBatchIds));
      await db.delete(importBatches).where(inArray(importBatches.id, createdBatchIds));
    }

    const pIds = [portfolio1Id, portfolio2Id, frozenPortfolioId].filter(Boolean);
    if (pIds.length > 0) {
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.portfolioId, pIds));
      await db.delete(portfolios).where(inArray(portfolios.id, pIds));
    }
    await db.delete(assets).where(
      or(
        inArray(assets.userId, [user1Id, user2Id]),
        inArray(assets.id, [customAssetUser1Id])
      )
    );
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  describe('Fluxo Principal de Confirmação Transacional', () => {
    it('deve confirmar lote válido com sucesso, criar portfolio_events, vincular itens e auditar', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço;Taxas;Notas',
        '10/01/2026;COMPRA;PETR4;100;38,50;4,50;Compra Lote 1',
        '11/01/2026;COMPRA;VALE3;50;62,00;0;Compra Lote 2',
      ].join('\n');

      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'confirmacao_sucesso.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      expect(upload.batch.status).toBe('pending_review');

      // Executa confirmação
      const confirmResult = await confirmImportBatch(
        { batchId: upload.batch.id },
        user1
      );

      expect(confirmResult.batch.status).toBe('confirmed');
      expect(confirmResult.batch.confirmedAt).not.toBeNull();
      expect(confirmResult.importedEventsCount).toBe(2);
      expect(confirmResult.eventIds.length).toBe(2);

      // 1. Verifica se os portfolio_events foram gravados no banco
      const events = await db
        .select()
        .from(portfolioEvents)
        .where(inArray(portfolioEvents.id, confirmResult.eventIds));

      expect(events.length).toBe(2);
      expect(events.every((e) => e.portfolioId === portfolio1Id)).toBe(true);
      expect(events.every((e) => e.source === 'import')).toBe(true);
      expect(events.every((e) => e.createdBy === user1.id)).toBe(true);

      // 2. Verifica se os itens do lote foram vinculados com importedPortfolioEventId
      const batchDetails = await getImportBatchById(upload.batch.id, user1);
      expect(batchDetails.batch.status).toBe('confirmed');
      expect(batchDetails.items[0].importedPortfolioEventId).toBe(events[0].id);
      expect(batchDetails.items[1].importedPortfolioEventId).toBe(events[1].id);

      // 3. Verifica se a auditoria foi registrada em audit_logs
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'import_batches'),
            eq(auditLogs.recordId, upload.batch.id),
            eq(auditLogs.action, 'UPDATE')
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(user1.id);
    });

    it('deve respeitar itens desmarcados (isExcluded = true) e não criar eventos para eles', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '10/01/2026;COMPRA;PETR4;100;38,50', // Mantido
        '11/01/2026;COMPRA;VALE3;50;62,00',  // Será desmarcado
      ].join('\n');

      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'com_exclusao.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Desmarca o item 2 (VALE3)
      await toggleImportBatchItemExclusion(
        upload.batch.id,
        upload.items[1].id,
        true,
        user1
      );

      const confirmResult = await confirmImportBatch(
        { batchId: upload.batch.id },
        user1
      );

      expect(confirmResult.importedEventsCount).toBe(1);
      expect(confirmResult.eventIds.length).toBe(1);

      const batchDetails = await getImportBatchById(upload.batch.id, user1);
      // Item 0 (PETR4) vinculado
      expect(batchDetails.items[0].importedPortfolioEventId).not.toBeNull();
      // Item 1 (VALE3 excluído) NÃO vinculado
      expect(batchDetails.items[1].importedPortfolioEventId).toBeNull();
    });

    it('deve ordenar deterministicamente compra antes de venda na mesma data/hora', async () => {
      // Arquivo onde a VENDA está na linha 1 e a COMPRA na linha 2, ambas no mesmo dia
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '15/01/2026;VENDA;PETR4;50;40,00',   // Linha 1: VENDA de 50
        '15/01/2026;COMPRA;PETR4;100;38,00', // Linha 2: COMPRA de 100
      ].join('\n');

      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'compra_antes_de_venda.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Confirmação deve processar COMPRA antes da VENDA e não estourar InsufficientPositionError
      const confirmResult = await confirmImportBatch(
        { batchId: upload.batch.id },
        user1
      );

      expect(confirmResult.importedEventsCount).toBe(2);
      expect(confirmResult.batch.status).toBe('confirmed');
    });
  });

  describe('Validações Estritas e Bloqueios Prévios', () => {
    it('deve rejeitar confirmação se nenhum item válido estiver selecionado', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'sem_selecao.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Desmarca o único item
      await toggleImportBatchItemExclusion(
        upload.batch.id,
        upload.items[0].id,
        true,
        user1
      );

      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow('Nenhum item válido selecionado para importação');
    });

    it('deve rejeitar confirmação se houver item ativo com erro no lote', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '10/01/2026;COMPRA;PETR4;100;38,50',
        '31/02/2026;COMPRA;VALE3;50;60,00', // Erro de data
      ].join('\n');

      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'com_erro.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow('possui erros e não pode ser importada');
    });

    it('deve rejeitar confirmação se houver item ativo sem ativo associado (unmapped warning)', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;ATIVODESCONHECIDO;10;50,00';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'sem_ativo.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow('não possui um ativo associado');
    });

    it('deve bloquear confirmação em carteira congelada com PortfolioFrozenError', async () => {
      const batchId = crypto.randomUUID();
      await db.insert(importBatches).values({
        id: batchId,
        userId: user1.id,
        portfolioId: frozenPortfolioId,
        fileName: 'congelada_batch.csv',
        fileSize: 100,
        fileFormat: 'carteiraexpert_csv',
        status: 'pending_review',
        rawContentHash: calculateFileHash('dummy content for frozen'),
      });
      createdBatchIds.push(batchId);

      await db.insert(importBatchItems).values({
        id: crypto.randomUUID(),
        batchId,
        lineNumber: 1,
        rawLine: '...',
        status: 'valid',
        actionType: 'BUY',
        rawTicker: 'PETR4',
        resolvedAssetId: petr4GlobalAssetId,
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '38.50',
        fees: '0',
        currency: 'BRL',
      });

      await expect(
        confirmImportBatch({ batchId }, user1)
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve bloquear tentativa de confirmação por outro usuário (IDOR)', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'lote_user1_idor.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // User 2 tenta confirmar lote do User 1
      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user2)
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve rejeitar confirmação de lote já confirmado com ImportBatchNotEditableError', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'confirmado_bis.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Primeira confirmação: Sucesso
      await confirmImportBatch({ batchId: upload.batch.id }, user1);

      // Segunda confirmação: Rejeição segura
      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow(ImportBatchNotEditableError);
    });
  });

  describe('Consistência Temporal e Atomicidade com Rollback', () => {
    it('deve rejeitar venda a descoberto com InsufficientPositionError e executar rollback total', async () => {
      // Tenta comprar 10 e vender 1.000.000 de VALE3 (sem ter saldo suficiente)
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '10/01/2026;COMPRA;VALE3;10;60,00',         // Compra 10
        '12/01/2026;VENDA;VALE3;1000000;70,00',     // Venda inválida a descoberto (1.000.000)
      ].join('\n');

      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'venda_descoberto.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // A confirmação deve estourar InsufficientPositionError
      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow(InsufficientPositionError);

      // PROVA DE ATOMICIDADE: Nenhum evento (nem o da linha 1 de COMPRA) pode ter sido gravado nesta carteira!
      const unrolledEvents = await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.portfolioId, portfolio1Id));

      expect(unrolledEvents.length).toBe(0);

      // O lote deve permanecer em pending_review
      const batchAfter = await getImportBatchById(upload.batch.id, user1);
      expect(batchAfter.batch.status).toBe('pending_review');
      expect(batchAfter.items.every((i) => i.importedPortfolioEventId === null)).toBe(true);
    });
  });

  describe('Rejeição e Descarte de Lotes', () => {
    it('deve rejeitar lote pendente via rejectImportBatch e registrar motivo', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'para_rejeitar.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const rejectResult = await rejectImportBatch(
        {
          batchId: upload.batch.id,
          reason: 'Arquivo enviado por engano.',
        },
        user1
      );

      expect(rejectResult.batch.status).toBe('rejected');
      expect(rejectResult.batch.errorMessage).toBe('Arquivo enviado por engano.');

      // Tentativa de confirmar lote rejeitado deve ser bloqueada
      await expect(
        confirmImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow(ImportBatchNotEditableError);

      // Tentativa de rejeitar novamente deve ser bloqueada
      await expect(
        rejectImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow(ImportBatchNotEditableError);
    });

    it('deve bloquear rejeição de lote já confirmado', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'confirmado_depois_rejeitar.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      await confirmImportBatch({ batchId: upload.batch.id }, user1);

      await expect(
        rejectImportBatch({ batchId: upload.batch.id }, user1)
      ).rejects.toThrow(ImportBatchNotEditableError);
    });
  });

  describe('Concorrência Pessimista', () => {
    it('deve serializar confirmações concorrentes garantindo exatamente 1 sucesso e 1 erro tratado', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'concorrencia.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Executa duas chamadas simultâneas de confirmação do mesmo lote
      const results = await Promise.allSettled([
        confirmImportBatch({ batchId: upload.batch.id }, user1),
        confirmImportBatch({ batchId: upload.batch.id }, user1),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      if (failures[0].status === 'rejected') {
        expect(failures[0].reason).toBeInstanceOf(ImportBatchNotEditableError);
      }
    });
  });

  describe('Server Actions (confirmImportBatchAction & rejectImportBatchAction)', () => {
    it('deve executar confirmImportBatchAction com sucesso via autenticação segura', async () => {
      activeUser = user1;
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'action_confirm.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const actionResult = await confirmImportBatchAction({
        batchId: upload.batch.id,
      });

      expect(actionResult.success).toBe(true);
      expect(actionResult.data?.batch.status).toBe('confirmed');
      expect(actionResult.data?.importedEventsCount).toBe(1);
    });

    it('deve executar rejectImportBatchAction com sucesso', async () => {
      activeUser = user1;
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'action_reject.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      const actionResult = await rejectImportBatchAction({
        batchId: upload.batch.id,
        reason: 'Descarte via Server Action',
      });

      expect(actionResult.success).toBe(true);
      expect(actionResult.data?.batch.status).toBe('rejected');
    });

    it('deve retornar erro tratado em confirmImportBatchAction quando o usuário não estiver autenticado', async () => {
      activeUser = null; // Sem sessão
      const actionResult = await confirmImportBatchAction({
        batchId: crypto.randomUUID(),
      });

      expect(actionResult.success).toBe(false);
      expect(actionResult.error).toBe('UNAUTHORIZED');
    });
  });
});
