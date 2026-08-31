import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import {
  acquireCvmFileLease,
  completeCvmRun,
  failCvmRun,
  renewCvmHeartbeat,
  CvmConcurrencyError,
} from '@/modules/market-data/server/cvm-concurrency.service';

const connectionString =
  process.env.DATABASE_URL_TEST ||
  'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

const queryClient = postgres(connectionString, { max: 5 });
const db = drizzle(queryClient, { schema });

describe('CVM Concurrency, Locks & Lease Lifecycle (Integration)', () => {
  let testFileId: string;

  beforeEach(async () => {
    // Limpeza de tabelas CVM
    await db.delete(schema.cvmCompanyAssets);
    await db.delete(schema.cvmIngestionRuns);
    await db.delete(schema.cvmSourceFiles);
    await db.delete(schema.cvmCompanies);

    // Cria um arquivo de teste padrão
    testFileId = crypto.randomUUID();
    await db.insert(schema.cvmSourceFiles).values({
      id: testFileId,
      fileName: 'dfp_cia_aberta_2024.zip',
      documentType: 'DFP',
      referenceYear: 2024,
      sourceUrl: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2024.zip',
      sha256: 'hash_conc_test_' + crypto.randomUUID(),
      fileSize: 13000000,
      storagePath: '.local-data/cvm/dfp_cia_aberta_2024.zip',
      status: 'AVAILABLE',
    });
  });

  afterAll(async () => {
    await queryClient.end();
  });

  describe('Aquisição de Lease e Exclusão Mútua de Workers', () => {
    it('deve adquirir lease com sucesso para um worker e registrar status RUNNING', async () => {
      const workerA = crypto.randomUUID();

      const { runId, lockExpiresAt } = await db.transaction(async (tx) => {
        return acquireCvmFileLease(tx as any, {
          fileId: testFileId,
          workerId: workerA,
          leaseDurationMinutes: 2,
        });
      });

      expect(runId).toBeDefined();
      expect(lockExpiresAt.getTime()).toBeGreaterThan(Date.now());

      const [run] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runId}`);

      expect(run.status).toBe('RUNNING');
      expect(run.workerId).toBe(workerA);
    });

    it('deve impedir que um segundo worker adquira o lease do mesmo arquivo ativo', async () => {
      const workerA = crypto.randomUUID();
      const workerB = crypto.randomUUID();

      // Worker A adquire o lease
      await db.transaction(async (tx) => {
        return acquireCvmFileLease(tx as any, {
          fileId: testFileId,
          workerId: workerA,
          leaseDurationMinutes: 5,
        });
      });

      // Worker B tenta adquirir o mesmo arquivo enquanto Worker A está ativo
      await expect(
        db.transaction(async (tx) => {
          return acquireCvmFileLease(tx as any, {
            fileId: testFileId,
            workerId: workerB,
          });
        })
      ).rejects.toThrow(CvmConcurrencyError);
    });

    it('deve ser bloqueado pelo índice parcial único uq_cvm_ingestion_runs_active_file se inserido diretamente', async () => {
      const worker1 = crypto.randomUUID();
      const worker2 = crypto.randomUUID();

      // Primeiro run ativo
      await db.insert(schema.cvmIngestionRuns).values({
        id: crypto.randomUUID(),
        fileId: testFileId,
        workerId: worker1,
        status: 'RUNNING',
        lockExpiresAt: new Date(Date.now() + 60000),
      });

      // Tentativa de segundo run ativo via SQL direto
      await expect(
        db.insert(schema.cvmIngestionRuns).values({
          id: crypto.randomUUID(),
          fileId: testFileId,
          workerId: worker2,
          status: 'RUNNING',
          lockExpiresAt: new Date(Date.now() + 60000),
        })
      ).rejects.toThrow(); // Violação de unicidade física parcial
    });

    it('deve transitar automaticamente run expirado para ABANDONED e permitir nova aquisição', async () => {
      const workerAntigo = crypto.randomUUID();
      const runAntigoId = crypto.randomUUID();

      // Insere um run antigo com lease já expirado no passado
      await db.insert(schema.cvmIngestionRuns).values({
        id: runAntigoId,
        fileId: testFileId,
        workerId: workerAntigo,
        status: 'RUNNING',
        lockExpiresAt: new Date(Date.now() - 10000), // Expirado há 10s
        startedAt: new Date(Date.now() - 60000),
      });

      const workerNovo = crypto.randomUUID();

      // Novo worker tenta adquirir
      const { runId: runNovoId } = await db.transaction(async (tx) => {
        return acquireCvmFileLease(tx as any, {
          fileId: testFileId,
          workerId: workerNovo,
        });
      });

      expect(runNovoId).toBeDefined();

      // Verifica que o run antigo foi marcado como ABANDONED
      const [runAntigo] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runAntigoId}`);

      expect(runAntigo.status).toBe('ABANDONED');
      expect(runAntigo.errorMessage).toContain('Lease expirado');

      // Verifica que o novo run está RUNNING
      const [runNovo] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runNovoId}`);

      expect(runNovo.status).toBe('RUNNING');
      expect(runNovo.workerId).toBe(workerNovo);
    });
  });

  describe('Heartbeat do Lease', () => {
    it('deve estender o prazo de expiração durante o streaming', async () => {
      const workerId = crypto.randomUUID();

      const { runId, lockExpiresAt: initialExpiresAt } = await db.transaction(
        async (tx) => {
          return acquireCvmFileLease(tx as any, {
            fileId: testFileId,
            workerId,
            leaseDurationMinutes: 1,
          });
        }
      );

      // Simula passagem de tempo e renovação
      const newExpiresAt = await db.transaction(async (tx) => {
        return renewCvmHeartbeat(tx as any, {
          fileId: testFileId,
          runId,
          workerId,
          leaseExtensionMinutes: 5,
        });
      });

      expect(newExpiresAt.getTime()).toBeGreaterThan(initialExpiresAt.getTime());

      const [run] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runId}`);

      expect(run.lockExpiresAt.getTime()).toBe(newExpiresAt.getTime());
    });

    it('deve falhar ao renovar heartbeat se o lease já tiver expirado (rowCount === 0)', async () => {
      const workerId = crypto.randomUUID();
      const runId = crypto.randomUUID();

      // Cria um run já expirado
      await db.insert(schema.cvmIngestionRuns).values({
        id: runId,
        fileId: testFileId,
        workerId,
        status: 'RUNNING',
        lockExpiresAt: new Date(Date.now() - 5000), // Expirado
      });

      await expect(
        db.transaction(async (tx) => {
          return renewCvmHeartbeat(tx as any, {
            fileId: testFileId,
            runId,
            workerId,
          });
        })
      ).rejects.toThrow(CvmConcurrencyError);
    });
  });

  describe('Conclusão Atômica e Rollback Transacional', () => {
    it('deve concluir o run com COMPLETED quando o lease estiver válido', async () => {
      const workerId = crypto.randomUUID();

      const { runId } = await db.transaction(async (tx) => {
        return acquireCvmFileLease(tx as any, {
          fileId: testFileId,
          workerId,
        });
      });

      // Conclui o run
      await db.transaction(async (tx) => {
        await completeCvmRun(tx as any, {
          fileId: testFileId,
          runId,
          workerId,
          metrics: {
            companiesRead: 10,
            statementsInserted: 2,
            statementsUpdated: 0,
            statementsSkipped: 8,
          },
        });
      });

      const [run] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runId}`);

      expect(run.status).toBe('COMPLETED');
      expect(run.completedAt).not.toBeNull();
      expect(run.companiesRead).toBe(10);
      expect(run.statementsInserted).toBe(2);
      expect(run.statementsSkipped).toBe(8);
    });

    it('deve disparar rollback integral se o lease expirar antes do completeCvmRun', async () => {
      const workerId = crypto.randomUUID();
      const runId = crypto.randomUUID();

      // Insere run já expirado
      await db.insert(schema.cvmIngestionRuns).values({
        id: runId,
        fileId: testFileId,
        workerId,
        status: 'RUNNING',
        lockExpiresAt: new Date(Date.now() - 1000), // Expirado
      });

      let rollbackOccurred = false;

      try {
        await db.transaction(async (tx) => {
          // Simula tentativa de inserção contábil dentro da transação
          await completeCvmRun(tx as any, {
            fileId: testFileId,
            runId,
            workerId,
            metrics: {
              companiesRead: 10,
              statementsInserted: 2,
              statementsUpdated: 0,
              statementsSkipped: 8,
            },
          });
        });
      } catch (err: any) {
        if (err instanceof CvmConcurrencyError) {
          rollbackOccurred = true;
        }
      }

      expect(rollbackOccurred).toBe(true);

      // O run deve permanecer inalterado em RUNNING com lock_expires_at no passado (não promovido a COMPLETED)
      const [run] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runId}`);

      expect(run.status).toBe('RUNNING');
      expect(run.completedAt).toBeNull();
    });

    it('deve marcar run como FAILED através de failCvmRun', async () => {
      const workerId = crypto.randomUUID();

      const { runId } = await db.transaction(async (tx) => {
        return acquireCvmFileLease(tx as any, {
          fileId: testFileId,
          workerId,
        });
      });

      await db.transaction(async (tx) => {
        await failCvmRun(tx as any, {
          fileId: testFileId,
          runId,
          workerId,
          errorMessage: 'Erro simulado de descompactação ZIP corrompido',
        });
      });

      const [run] = await db
        .select()
        .from(schema.cvmIngestionRuns)
        .where(sql`id = ${runId}`);

      expect(run.status).toBe('FAILED');
      expect(run.errorMessage).toContain('ZIP corrompido');
      expect(run.completedAt).not.toBeNull();
    });
  });
});
