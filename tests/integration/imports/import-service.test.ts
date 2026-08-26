import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '@/lib/db/schema/portfolio';
import { importBatches, importBatchItems } from '@/lib/db/schema/imports';
import {
  processImportUpload,
  getImportBatchById,
  listImportBatches,
  updateImportBatchItem,
  toggleImportBatchItemExclusion,
  resolveUnmappedBatchItemAsset,
} from '@/modules/imports/server/import.service';
import { createPortfolio } from '@/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '@/modules/portfolio/server/asset.service';
import { createPortfolioEvent } from '@/modules/portfolio/server/portfolio-event.service';
import {
  ImportBatchNotFoundError,
  ImportBatchItemNotFoundError,
  ImportBatchNotEditableError,
  ImportFileValidationError,
} from '@/modules/imports/domain/errors';
import { PortfolioFrozenError } from '@/modules/plans/domain/errors';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import { calculateFileHash } from '@/modules/imports/domain/import-utils';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { eq, inArray, and, isNull, or } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: ImportService (PostgreSQL Real)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;

  let portfolio1Id: string;
  let portfolio2Id: string;
  let frozenPortfolioId: string;

  let petr4GlobalAssetId: string;
  let vale3GlobalAssetId: string;
  let customAssetUser1Id: string;
  let customAssetUser2Id: string;
  let customAssetUser1Ticker: string;
  let customAssetUser2Ticker: string;

  const createdBatchIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();
    const timestamp = Date.now();

    // 1. Cria 2 usuários de teste
    await db.insert(users).values([
      {
        id: user1Id,
        email: `import_user1_${timestamp}@carteiraexpert.test`,
        name: 'Import User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `import_user2_${timestamp}@carteiraexpert.test`,
        name: 'Import User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `import_user1_${timestamp}@carteiraexpert.test`,
      name: 'Import User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `import_user2_${timestamp}@carteiraexpert.test`,
      name: 'Import User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Cria carteiras ativas
    const port1 = await createPortfolio(
      { name: 'Carteira Principal User 1', baseCurrency: 'BRL' },
      user1
    );
    portfolio1Id = port1.id;

    const port2 = await createPortfolio(
      { name: 'Carteira Principal User 2', baseCurrency: 'BRL' },
      user2
    );
    portfolio2Id = port2.id;

    // 3. Cria carteira congelada para testar bloqueio
    const [frozenPort] = await db
      .insert(portfolios)
      .values({
        id: crypto.randomUUID(),
        userId: user1.id,
        name: 'Carteira Congelada User 1',
        baseCurrency: 'BRL',
        status: 'frozen',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    frozenPortfolioId = frozenPort.id;

    // 4. Busca ou cria ativos globais B3
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

    // 5. Cria ativos customizados para User 1 e User 2
    const cust1 = await createCustomAsset(
      {
        ticker: `CUST1_${timestamp.toString().slice(-4)}`,
        name: 'Ativo Customizado User 1',
        currency: 'BRL',
      },
      user1
    );
    customAssetUser1Id = cust1.id;
    customAssetUser1Ticker = cust1.ticker;

    const cust2 = await createCustomAsset(
      {
        ticker: `CUST2_${timestamp.toString().slice(-4)}`,
        name: 'Ativo Customizado User 2',
        currency: 'BRL',
      },
      user2
    );
    customAssetUser2Id = cust2.id;
    customAssetUser2Ticker = cust2.ticker;
  });

  afterAll(async () => {
    // Limpeza na ordem reversa de chaves estrangeiras
    if (createdBatchIds.length > 0) {
      await db.delete(importBatchItems).where(inArray(importBatchItems.batchId, createdBatchIds));
      await db.delete(importBatches).where(inArray(importBatches.id, createdBatchIds));
    }

    await db.delete(portfolioEvents).where(
      inArray(portfolioEvents.portfolioId, [portfolio1Id, portfolio2Id, frozenPortfolioId])
    );
    await db.delete(portfolios).where(
      inArray(portfolios.id, [portfolio1Id, portfolio2Id, frozenPortfolioId])
    );
    await db.delete(assets).where(
      or(
        inArray(assets.userId, [user1Id, user2Id]),
        inArray(assets.id, [customAssetUser1Id, customAssetUser2Id])
      )
    );
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  describe('processImportUpload & getImportBatchById', () => {
    it('deve processar upload de CSV padrão, resolver ativo global e persistir lote em pending_review', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço;Taxas;Notas',
        '10/01/2026;COMPRA;PETR4;100;38,50;4,50;Compra B3',
        '15/01/2026;VENDA;VALE3;50;62,00;0;Venda B3',
      ].join('\n');

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'minhas_operacoes.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );

      createdBatchIds.push(result.batch.id);

      expect(result.batch.id).toBeDefined();
      expect(result.batch.userId).toBe(user1.id);
      expect(result.batch.portfolioId).toBe(portfolio1Id);
      expect(result.batch.fileFormat).toBe('carteiraexpert_csv');
      expect(result.batch.status).toBe('pending_review');
      expect(result.batch.totalRecords).toBe(2);
      expect(result.batch.validRecords).toBe(2);
      expect(result.batch.warningRecords).toBe(0);
      expect(result.batch.errorRecords).toBe(0);

      expect(result.items.length).toBe(2);
      expect(result.items[0].resolvedAssetId).toBe(petr4GlobalAssetId);
      expect(result.items[0].status).toBe('valid');
      expect(result.items[1].resolvedAssetId).toBe(vale3GlobalAssetId);

      // Consulta de leitura pelo ID
      const fetched = await getImportBatchById(result.batch.id, user1);
      expect(fetched.batch.id).toBe(result.batch.id);
      expect(fetched.items.length).toBe(2);
      expect(fetched.items[0].rawTicker).toBe('PETR4');
    });

    it('deve resolver ativo customizado do próprio usuário e marcar ativo não identificado como WARNING sem criá-lo automaticamente', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço;Taxas',
        `10/01/2026;COMPRA;${customAssetUser1Ticker};10;100,00;0`, // Custom do User 1 -> deve resolver
        '11/01/2026;COMPRA;XPTO99;5;50,00;0',  // Ativo não identificado -> WARNING
      ].join('\n');

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'custom_e_warning.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );

      createdBatchIds.push(result.batch.id);

      expect(result.batch.validRecords).toBe(1);
      expect(result.batch.warningRecords).toBe(1);
      expect(result.batch.errorRecords).toBe(0);

      // Item 1: customAssetUser1Ticker resolvido
      expect(result.items[0].resolvedAssetId).toBe(customAssetUser1Id);
      expect(result.items[0].status).toBe('valid');

      // Item 2: XPTO99 -> WARNING (não criado automaticamente)
      expect(result.items[1].resolvedAssetId).toBeNull();
      expect(result.items[1].status).toBe('warning');
      expect(
        result.items[1].validationErrors.some((e) => e.includes('Ativo não encontrado'))
      ).toBe(true);

      // Confirma que XPTO99 NÃO foi inserido no banco de ativos
      const [shouldNotExist] = await db
        .select()
        .from(assets)
        .where(eq(assets.ticker, 'XPTO99'));
      expect(shouldNotExist).toBeUndefined();
    });

    it('não deve resolver ativo customizado pertencente a outro usuário', async () => {
      // User 1 tenta importar customAssetUser2Ticker (que pertence exclusivamente ao User 2)
      const csvContent = `Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;${customAssetUser2Ticker};10;100,00`;

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'outro_usuario.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );

      createdBatchIds.push(result.batch.id);

      // customAssetUser2Ticker não deve ser resolvido para o User 1, deve ficar como WARNING
      expect(result.items[0].resolvedAssetId).toBeNull();
      expect(result.items[0].status).toBe('warning');
    });

    it('deve registrar erros por linha sem descarte silencioso', async () => {
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '10/01/2026;COMPRA;PETR4;100;38,50', // Válida
        '31/02/2026;COMPRA;VALE3;50;60,00', // Erro de data
        '12/01/2026;X;PETR4;10;38,50',       // Erro de tipo
      ].join('\n');

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'parcial_erros.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );

      createdBatchIds.push(result.batch.id);

      expect(result.batch.totalRecords).toBe(3);
      expect(result.batch.validRecords).toBe(1);
      expect(result.batch.errorRecords).toBe(2);

      expect(result.items[0].status).toBe('valid');
      expect(result.items[1].status).toBe('error');
      expect(result.items[2].status).toBe('error');
    });
  });

  describe('Deduplicação de Arquivo e Linha', () => {
    it('deve detectar duplicidade linha a linha contra portfolio_events já lançados na carteira', async () => {
      // 1. Cria um evento existente diretamente na carteira 1
      const tradeDate = new Date('2026-01-10T15:00:00.000Z');
      await createPortfolioEvent(
        {
          portfolioId: portfolio1Id,
          assetId: petr4GlobalAssetId,
          type: 'BUY',
          tradeDate: '2026-01-10T12:00:00-03:00',
          quantity: '100',
          unitPrice: '38.50',
          fees: '0',
          currency: 'BRL',
          source: 'manual',
        },
        user1
      );

      // 2. Importa CSV contendo a mesma operação de PETR4 + uma operação nova de VALE3
      const csvContent = [
        'Data;Tipo;Ticker;Quantidade;Preço',
        '10/01/2026;COMPRA;PETR4;100;38,50', // Idêntica à existente
        '12/01/2026;COMPRA;VALE3;50;62,00',  // Nova
      ].join('\n');

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'duplicata_linha.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );

      createdBatchIds.push(result.batch.id);

      // Item 0: PETR4 deve ser marcado como duplicate e isExcluded: true
      expect(result.items[0].isDuplicate).toBe(true);
      expect(result.items[0].isExcluded).toBe(true);
      expect(result.items[0].status).toBe('duplicate');
      expect(result.items[0].duplicateReason).toContain('Operação idêntica já registrada');

      // Item 1: VALE3 deve ser válido
      expect(result.items[1].isDuplicate).toBe(false);
      expect(result.items[1].status).toBe('valid');
    });

    it('deve alertar se um arquivo com mesmo hash já foi confirmado anteriormente', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const hash = calculateFileHash(csvContent);

      // Simula um lote previamente confirmado com o mesmo hash
      const confirmedBatchId = crypto.randomUUID();
      await db.insert(importBatches).values({
        id: confirmedBatchId,
        userId: user1.id,
        portfolioId: portfolio1Id,
        fileName: 'arquivo_anterior.csv',
        fileSize: 100,
        fileFormat: 'carteiraexpert_csv',
        status: 'confirmed',
        rawContentHash: hash,
        confirmedAt: new Date(),
      });
      createdBatchIds.push(confirmedBatchId);

      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'arquivo_duplicado.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(result.batch.id);

      expect(result.batch.errorMessage).toContain('já foi importado nesta carteira');
    });
  });

  describe('Segurança, Autorização e Bloqueios', () => {
    it('deve rejeitar upload em carteira congelada com PortfolioFrozenError', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';

      await expect(
        processImportUpload(
          {
            fileContent: csvContent,
            fileName: 'congelada.csv',
            fileSize: Buffer.byteLength(csvContent),
            portfolioId: frozenPortfolioId,
          },
          user1
        )
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve bloquear IDOR: Usuário 2 tentando acessar lote do Usuário 1 com AuthorizationError', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const result = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'lote_user1.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(result.batch.id);

      // User 2 tenta buscar lote do User 1
      await expect(getImportBatchById(result.batch.id, user2)).rejects.toThrow(
        AuthorizationError
      );
    });

    it('deve bloquear upload direcionado para carteira pertencente a outro usuário', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';

      // User 1 tenta importar apontando para a carteira do User 2
      await expect(
        processImportUpload(
          {
            fileContent: csvContent,
            fileName: 'carteira_alheia.csv',
            fileSize: Buffer.byteLength(csvContent),
            portfolioId: portfolio2Id,
          },
          user1
        )
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('Edição, Exclusão e Resolução de Ativos', () => {
    it('deve atualizar item do lote em pending_review via updateImportBatchItem', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'edicao.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);
      const item = upload.items[0];

      // Edita o preço e quantidade
      const updated = await updateImportBatchItem(
        upload.batch.id,
        item.id,
        {
          actionType: 'BUY',
          rawTicker: 'VALE3',
          tradeDate: '2026-01-10T12:00:00Z',
          quantity: '200',
          unitPrice: '65.00',
          fees: '5.00',
          currency: 'BRL',
          isExcluded: false,
        },
        user1
      );

      expect(updated.rawTicker).toBe('VALE3');
      expect(updated.resolvedAssetId).toBe(vale3GlobalAssetId);
      expect(updated.quantity.toString()).toBe('200');
      expect(updated.unitPrice.toString()).toBe('65');
      expect(updated.fees.toString()).toBe('5');
      expect(updated.status).toBe('valid');
    });

    it('deve alternar exclusão de item via toggleImportBatchItemExclusion', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;100;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'toggle.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);
      const item = upload.items[0];

      // Desmarca da importação
      const excluded = await toggleImportBatchItemExclusion(
        upload.batch.id,
        item.id,
        true,
        user1
      );
      expect(excluded.isExcluded).toBe(true);

      // Reinclui na importação
      const reincluded = await toggleImportBatchItemExclusion(
        upload.batch.id,
        item.id,
        false,
        user1
      );
      expect(reincluded.isExcluded).toBe(false);
    });

    it('deve resolver ativo não identificado mediante ação explícita create_custom', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;NOVOATIVO;50;10,00';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'novo_ativo.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);
      const item = upload.items[0];
      expect(item.status).toBe('warning');

      // Ação explícita do usuário autorizando criação de ativo customizado
      const resolved = await resolveUnmappedBatchItemAsset(
        {
          batchId: upload.batch.id,
          itemId: item.id,
          action: 'create_custom',
          customAssetData: {
            name: 'Ativo Novo Customizado S.A.',
            currency: 'BRL',
          },
        },
        user1
      );

      expect(resolved.resolvedAssetId).not.toBeNull();
      expect(resolved.status).toBe('valid');

      // Confirma que o ativo customizado foi criado para o user1
      const [customCreated] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, resolved.resolvedAssetId!));

      expect(customCreated).toBeDefined();
      expect(customCreated.ticker).toBe('NOVOATIVO');
      expect(customCreated.userId).toBe(user1.id);
      expect(customCreated.isCustom).toBe(true);
    });

    it('deve resolver ativo não identificado associando a um ativo global existente via select_existing', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;DESCONHECIDO;10;50,00';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'associar_existente.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);
      const item = upload.items[0];
      expect(item.status).toBe('warning');

      // Associa explicitamente a PETR4 global
      const resolved = await resolveUnmappedBatchItemAsset(
        {
          batchId: upload.batch.id,
          itemId: item.id,
          action: 'select_existing',
          existingAssetId: petr4GlobalAssetId,
        },
        user1
      );

      expect(resolved.resolvedAssetId).toBe(petr4GlobalAssetId);
      expect(resolved.status).toBe('valid');
    });

    it('deve bloquear tentativa de associar a ativo customizado pertencente a outro usuário', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;DESCONHECIDO;10;50,00';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'associar_alheio.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);
      const item = upload.items[0];

      // User 1 tenta associar a customAssetUser2Id (ativo customizado exclusivo do User 2)
      await expect(
        resolveUnmappedBatchItemAsset(
          {
            batchId: upload.batch.id,
            itemId: item.id,
            action: 'select_existing',
            existingAssetId: customAssetUser2Id,
          },
          user1
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve rejeitar edição em lote que não está em pending_review com ImportBatchNotEditableError', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';
      const upload = await processImportUpload(
        {
          fileContent: csvContent,
          fileName: 'lote_confirmado.csv',
          fileSize: Buffer.byteLength(csvContent),
          portfolioId: portfolio1Id,
        },
        user1
      );
      createdBatchIds.push(upload.batch.id);

      // Simula confirmação do lote
      await db
        .update(importBatches)
        .set({ status: 'confirmed', confirmedAt: new Date() })
        .where(eq(importBatches.id, upload.batch.id));

      await expect(
        updateImportBatchItem(
          upload.batch.id,
          upload.items[0].id,
          {
            actionType: 'BUY',
            rawTicker: 'VALE3',
            tradeDate: '2026-01-10T12:00:00Z',
            quantity: '10',
            unitPrice: '50.00',
            currency: 'BRL',
            isExcluded: false,
          },
          user1
        )
      ).rejects.toThrow(ImportBatchNotEditableError);

      await expect(
        toggleImportBatchItemExclusion(
          upload.batch.id,
          upload.items[0].id,
          true,
          user1
        )
      ).rejects.toThrow(ImportBatchNotEditableError);
    });

    it('deve garantir rollback transacional quando a gravação do lote falha', async () => {
      const csvContent = 'Data;Tipo;Ticker;Quantidade;Preço\n10/01/2026;COMPRA;PETR4;10;38,50';

      const mockAuditFail = async () => {
        throw new Error('Falha simulada no audit log durante transação');
      };

      await expect(
        processImportUpload(
          {
            fileContent: csvContent,
            fileName: 'rollback_test.csv',
            fileSize: Buffer.byteLength(csvContent),
            portfolioId: portfolio1Id,
          },
          user1,
          db,
          mockAuditFail as any
        )
      ).rejects.toThrow('Falha simulada no audit log durante transação');

      // Verifica que nenhum lote com este nome de arquivo foi persistido
      const [saved] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.fileName, 'rollback_test.csv'));

      expect(saved).toBeUndefined();
    });

    it('deve listar lotes do usuário via listImportBatches', async () => {
      const batches = await listImportBatches(user1, portfolio1Id);
      expect(batches.length).toBeGreaterThan(0);
      expect(batches.every((b) => b.userId === user1.id)).toBe(true);
    });
  });
});
