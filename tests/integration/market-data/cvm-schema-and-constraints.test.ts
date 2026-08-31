import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';

const connectionString =
  process.env.DATABASE_URL_TEST ||
  'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

const queryClient = postgres(connectionString, { max: 1 });
const db = drizzle(queryClient, { schema });

describe('CVM Tables Schema & Constraints (Integration)', () => {
  // Sets de rastreamento estrito de IDs criados pela suíte
  const createdCompanyIds = new Set<string>();
  const createdFileIds = new Set<string>();
  const createdRunIds = new Set<string>();
  const createdBindingIds = new Set<string>();

  async function cleanupTrackedIds() {
    try {
      const bindingIds = Array.from(createdBindingIds);
      if (bindingIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.id, bindingIds));
      }

      const runIds = Array.from(createdRunIds);
      if (runIds.length > 0) {
        await db
          .delete(schema.cvmIngestionRuns)
          .where(inArray(schema.cvmIngestionRuns.id, runIds));
      }

      const fileIds = Array.from(createdFileIds);
      if (fileIds.length > 0) {
        await db
          .delete(schema.cvmSourceFiles)
          .where(inArray(schema.cvmSourceFiles.id, fileIds));
      }

      const compIds = Array.from(createdCompanyIds);
      if (compIds.length > 0) {
        // Limpa possíveis vínculos dependentes
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.companyId, compIds));

        await db
          .delete(schema.cvmCompanies)
          .where(inArray(schema.cvmCompanies.id, compIds));
      }
    } finally {
      createdBindingIds.clear();
      createdRunIds.clear();
      createdFileIds.clear();
      createdCompanyIds.clear();
    }
  }

  beforeEach(async () => {
    await cleanupTrackedIds();
  });

  afterEach(async () => {
    await cleanupTrackedIds();
  });

  afterAll(async () => {
    await cleanupTrackedIds();
    await queryClient.end();
  });

  describe('Tabela cvm_companies', () => {
    it('deve inserir uma companhia válida com dados normalizados', async () => {
      const companyId = crypto.randomUUID();
      createdCompanyIds.add(companyId);

      await db.insert(schema.cvmCompanies).values({
        id: companyId,
        cvmCode: '009512',
        cnpj: '33000167000101',
        legalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
        tradeName: 'PETROBRAS',
        industrySector: 'Petróleo e Gás',
        marketType: 'BOLSA',
        status: 'ATIVO',
      });

      const [inserted] = await db
        .select()
        .from(schema.cvmCompanies)
        .where(sql`id = ${companyId}`);

      expect(inserted).toBeDefined();
      expect(inserted.cvmCode).toBe('009512');
      expect(inserted.cnpj).toBe('33000167000101');
      expect(inserted.status).toBe('ATIVO');
    });

    it('deve violar constraint quando o status for inválido', async () => {
      const companyId = crypto.randomUUID();
      createdCompanyIds.add(companyId);

      await expect(
        db.insert(schema.cvmCompanies).values({
          id: companyId,
          cvmCode: '009512',
          cnpj: '33000167000101',
          legalName: 'PETROBRAS',
          status: 'INVALID_STATUS' as any,
        })
      ).rejects.toThrow();
    });

    it('deve violar constraint quando CNPJ ou CVM_CODE tiverem tamanho incorreto', async () => {
      const c1 = crypto.randomUUID();
      const c2 = crypto.randomUUID();
      createdCompanyIds.add(c1);
      createdCompanyIds.add(c2);

      // CNPJ com 13 dígitos
      await expect(
        db.insert(schema.cvmCompanies).values({
          id: c1,
          cvmCode: '009512',
          cnpj: '3300016700010', // 13 dígitos
          legalName: 'EMPRESA TESTE',
        })
      ).rejects.toThrow();

      // CVM_CODE com 4 dígitos (sem padding)
      await expect(
        db.insert(schema.cvmCompanies).values({
          id: c2,
          cvmCode: '9512', // 4 dígitos
          cnpj: '33000167000101',
          legalName: 'EMPRESA TESTE',
        })
      ).rejects.toThrow();
    });

    it('deve impedir duplicidade de CNPJ ou Código CVM (Unique constraints)', async () => {
      const c1 = crypto.randomUUID();
      const c2 = crypto.randomUUID();
      const c3 = crypto.randomUUID();
      createdCompanyIds.add(c1);
      createdCompanyIds.add(c2);
      createdCompanyIds.add(c3);

      await db.insert(schema.cvmCompanies).values({
        id: c1,
        cvmCode: '004170',
        cnpj: '33592510000154',
        legalName: 'VALE S.A.',
      });

      // Duplicidade de CVM Code
      await expect(
        db.insert(schema.cvmCompanies).values({
          id: c2,
          cvmCode: '004170',
          cnpj: '11111111000199',
          legalName: 'OUTRA EMPRESA',
        })
      ).rejects.toThrow();

      // Duplicidade de CNPJ
      await expect(
        db.insert(schema.cvmCompanies).values({
          id: c3,
          cvmCode: '009999',
          cnpj: '33592510000154',
          legalName: 'OUTRA EMPRESA 2',
        })
      ).rejects.toThrow();
    });
  });

  describe('Tabela cvm_source_files', () => {
    it('deve inserir arquivo físico com status DOWNLOADED, AVAILABLE ou INVALID', async () => {
      const fileId = crypto.randomUUID();
      createdFileIds.add(fileId);

      await db.insert(schema.cvmSourceFiles).values({
        id: fileId,
        fileName: 'dfp_cia_aberta_2024.zip',
        documentType: 'DFP',
        referenceYear: 2024,
        sourceUrl: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2024.zip',
        sha256: '3131dd308f06ae4f182cb38abc06330238251729b1b62b42b32779a4edeb06ab',
        fileSize: 13396363,
        storagePath: '.local-data/cvm/dfp_cia_aberta_2024.zip',
        status: 'AVAILABLE',
      });

      const [inserted] = await db
        .select()
        .from(schema.cvmSourceFiles)
        .where(sql`id = ${fileId}`);

      expect(inserted).toBeDefined();
      expect(inserted.status).toBe('AVAILABLE');
      expect(inserted.documentType).toBe('DFP');
    });

    it('deve rejeitar status de processamento como PROCESSED em cvm_source_files', async () => {
      const fileId = crypto.randomUUID();
      createdFileIds.add(fileId);

      await expect(
        db.insert(schema.cvmSourceFiles).values({
          id: fileId,
          fileName: 'teste.zip',
          documentType: 'DFP',
          sourceUrl: 'https://exemplo.com',
          sha256: 'hash_invalido_status',
          fileSize: 1000,
          storagePath: '/caminho',
          status: 'PROCESSED' as any,
        })
      ).rejects.toThrow();
    });

    it('deve rejeitar document_type inválido ou file_size <= 0', async () => {
      const f1 = crypto.randomUUID();
      const f2 = crypto.randomUUID();
      createdFileIds.add(f1);
      createdFileIds.add(f2);

      await expect(
        db.insert(schema.cvmSourceFiles).values({
          id: f1,
          fileName: 'teste.zip',
          documentType: 'INVALID_TYPE' as any,
          sourceUrl: 'https://exemplo.com',
          sha256: 'hash_invalido_doc',
          fileSize: 1000,
          storagePath: '/caminho',
        })
      ).rejects.toThrow();

      await expect(
        db.insert(schema.cvmSourceFiles).values({
          id: f2,
          fileName: 'teste.zip',
          documentType: 'DFP',
          sourceUrl: 'https://exemplo.com',
          sha256: 'hash_size_zero',
          fileSize: 0, // Incorreto
          storagePath: '/caminho',
        })
      ).rejects.toThrow();
    });
  });

  describe('Tabela cvm_ingestion_runs', () => {
    it('deve respeitar foreign key restrict para cvm_source_files', async () => {
      const fileId = crypto.randomUUID();
      createdFileIds.add(fileId);

      await db.insert(schema.cvmSourceFiles).values({
        id: fileId,
        fileName: 'cad_cia_aberta.csv',
        documentType: 'CAD',
        sourceUrl: 'https://exemplo.com',
        sha256: 'hash_teste_fk',
        fileSize: 5000,
        storagePath: '/caminho',
        status: 'AVAILABLE',
      });

      const runId = crypto.randomUUID();
      createdRunIds.add(runId);

      await db.insert(schema.cvmIngestionRuns).values({
        id: runId,
        fileId,
        workerId: crypto.randomUUID(),
        parserVersion: '1.0.0',
        executionMode: 'CLI_MANUAL',
        status: 'PENDING',
        lockExpiresAt: new Date(Date.now() + 120000),
      });

      // Tentar deletar o arquivo deve ser bloqueado por ON DELETE RESTRICT
      await expect(
        db.delete(schema.cvmSourceFiles).where(sql`id = ${fileId}`)
      ).rejects.toThrow();
    });
  });

  describe('Tabela cvm_company_assets', () => {
    it('deve permitir associação de ativo com status PENDING_REVIEW', async () => {
      const companyId = crypto.randomUUID();
      createdCompanyIds.add(companyId);

      await db.insert(schema.cvmCompanies).values({
        id: companyId,
        cvmCode: '009512',
        cnpj: '33000167000101',
        legalName: 'PETROBRAS',
      });

      // Busca um ativo público existente no banco
      const [existingAsset] = await db.select().from(schema.assets).limit(1);

      if (existingAsset) {
        const linkId = crypto.randomUUID();
        createdBindingIds.add(linkId);

        await db.insert(schema.cvmCompanyAssets).values({
          id: linkId,
          companyId,
          assetId: existingAsset.id,
          shareClass: 'PN',
          status: 'PENDING_REVIEW',
          matchMethod: 'MANUAL',
          justification: 'Vínculo preliminar aguardando de-para documental auditável',
        });

        const [link] = await db
          .select()
          .from(schema.cvmCompanyAssets)
          .where(sql`id = ${linkId}`);

        expect(link).toBeDefined();
        expect(link.status).toBe('PENDING_REVIEW');

        // Duplicidade do mesmo par (companyId, assetId) deve ser rejeitada
        const dupId = crypto.randomUUID();
        createdBindingIds.add(dupId);

        await expect(
          db.insert(schema.cvmCompanyAssets).values({
            id: dupId,
            companyId,
            assetId: existingAsset.id,
            status: 'APPROVED',
          })
        ).rejects.toThrow();
      }
    });
  });
});
