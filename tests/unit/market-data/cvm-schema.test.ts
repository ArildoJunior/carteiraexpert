import { describe, expect, it } from 'vitest';
import {
  CVM_SECTORS_CATALOG,
  classifyCvmSector,
  cvmCompanyAssetStatusSchema,
  cvmCompanyStatusSchema,
  cvmDocumentTypeSchema,
  cvmExecutionModeSchema,
  cvmIngestionRunStatusSchema,
  cvmMatchMethodSchema,
  cvmSourceFileStatusSchema,
  cvmSourceReferenceSchema,
} from '@/modules/market-data/domain/cvm.schema';
import { buildAndValidateCvmSourceReference } from '@/modules/market-data/server/cvm-concurrency.service';

describe('CVM Domain Schemas & Contracts (Unit)', () => {
  describe('CVM Status Enums', () => {
    it('deve validar os status permitidos de cvm_companies', () => {
      expect(cvmCompanyStatusSchema.safeParse('ATIVO').success).toBe(true);
      expect(cvmCompanyStatusSchema.safeParse('CANCELADA').success).toBe(true);
      expect(cvmCompanyStatusSchema.safeParse('SUSPENSO(A) - DECISÃO ADM').success).toBe(true);
      expect(cvmCompanyStatusSchema.safeParse('INATIVO').success).toBe(false);
    });

    it('deve validar os status estritos de cvm_source_files (físicos)', () => {
      expect(cvmSourceFileStatusSchema.safeParse('DOWNLOADED').success).toBe(true);
      expect(cvmSourceFileStatusSchema.safeParse('AVAILABLE').success).toBe(true);
      expect(cvmSourceFileStatusSchema.safeParse('INVALID').success).toBe(true);
      // PROCESSED não deve ser aceito em cvm_source_files
      expect(cvmSourceFileStatusSchema.safeParse('PROCESSED').success).toBe(false);
      expect(cvmSourceFileStatusSchema.safeParse('COMPLETED').success).toBe(false);
    });

    it('deve validar os status de execução de cvm_ingestion_runs', () => {
      const validStatuses = [
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'ABANDONED',
        'CANCELLED',
        'DRY_RUN_SUCCESS',
        'DRY_RUN_FAILED',
      ];
      for (const status of validStatuses) {
        expect(cvmIngestionRunStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(cvmIngestionRunStatusSchema.safeParse('UNKNOWN_STATUS').success).toBe(false);
    });

    it('deve validar os tipos de documentos CVM suportados', () => {
      const validDocTypes = ['CAD', 'DFP', 'ITR', 'FCA', 'META'];
      for (const docType of validDocTypes) {
        expect(cvmDocumentTypeSchema.safeParse(docType).success).toBe(true);
      }
      expect(cvmDocumentTypeSchema.safeParse('B3_COTAHIST').success).toBe(false);
    });

    it('deve validar modos de execução e vínculos de ativos', () => {
      expect(cvmExecutionModeSchema.safeParse('CLI_MANUAL').success).toBe(true);
      expect(cvmExecutionModeSchema.safeParse('CLI_SCHEDULED').success).toBe(true);
      expect(cvmExecutionModeSchema.safeParse('DRY_RUN').success).toBe(true);

      expect(cvmCompanyAssetStatusSchema.safeParse('APPROVED').success).toBe(true);
      expect(cvmCompanyAssetStatusSchema.safeParse('PENDING_REVIEW').success).toBe(true);
      expect(cvmCompanyAssetStatusSchema.safeParse('REJECTED').success).toBe(true);

      expect(cvmMatchMethodSchema.safeParse('CURATED_SEED').success).toBe(true);
      expect(cvmMatchMethodSchema.safeParse('CNPJ_EXACT').success).toBe(true);
      expect(cvmMatchMethodSchema.safeParse('MANUAL').success).toBe(true);
      expect(cvmMatchMethodSchema.safeParse('HEURISTIC').success).toBe(true);
    });
  });

  describe('Dicionário e Classificador de Setores CVM', () => {
    it('deve conter exatamente 70 setores oficiais homologados no catálogo', () => {
      const sectorKeys = Object.keys(CVM_SECTORS_CATALOG);
      expect(sectorKeys.length).toBe(70);
    });

    it('deve classificar setores comerciais/industriais como ELIGIBLE e PROCESSABLE', () => {
      const petroleo = classifyCvmSector('Petróleo e Gás');
      expect(petroleo.classification).toBe('ELIGIBLE_COMMERCIAL_INDUSTRIAL');
      expect(petroleo.decision).toBe('PROCESSABLE');

      const mineracao = classifyCvmSector('Extração Mineral');
      expect(mineracao.classification).toBe('ELIGIBLE_COMMERCIAL_INDUSTRIAL');
      expect(mineracao.decision).toBe('PROCESSABLE');

      const energia = classifyCvmSector('Energia Elétrica');
      expect(energia.classification).toBe('ELIGIBLE_COMMERCIAL_INDUSTRIAL');
      expect(energia.decision).toBe('PROCESSABLE');
    });

    it('deve classificar setores financeiros/bancários como FINANCIAL_COSIF e SKIPPED', () => {
      const bancos = classifyCvmSector('Bancos');
      expect(bancos.classification).toBe('FINANCIAL_COSIF');
      expect(bancos.decision).toBe('SKIPPED');

      const seguradoras = classifyCvmSector('Seguradoras e Corretoras');
      expect(seguradoras.classification).toBe('FINANCIAL_COSIF');
      expect(seguradoras.decision).toBe('SKIPPED');

      const intermediacao = classifyCvmSector('Intermediação Financeira');
      expect(intermediacao.classification).toBe('FINANCIAL_COSIF');
      expect(intermediacao.decision).toBe('SKIPPED');
    });

    it('deve classificar holdings puras como HOLDING_PURE e SKIPPED', () => {
      const holding = classifyCvmSector('Emp. Adm. Participações');
      expect(holding.classification).toBe('HOLDING_PURE');
      expect(holding.decision).toBe('SKIPPED');
    });

    it('deve classificar setores desconhecidos ou vazios como UNKNOWN e SKIPPED', () => {
      const vazio = classifyCvmSector('');
      expect(vazio.classification).toBe('UNKNOWN');
      expect(vazio.decision).toBe('SKIPPED');

      const nullSector = classifyCvmSector(null);
      expect(nullSector.classification).toBe('UNKNOWN');
      expect(nullSector.decision).toBe('SKIPPED');

      const inventado = classifyCvmSector('Setor Aeroespacial Fictício');
      expect(inventado.classification).toBe('UNKNOWN');
      expect(inventado.decision).toBe('SKIPPED');
    });
  });

  describe('CVM Source Reference Contract', () => {
    it('deve validar um sourceReference perfeitamente conforme o contrato', () => {
      const raw = {
        source: 'cvm_dfp',
        fileId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'ÚLTIMO',
        version: 1,
        parserVersion: '1.0.0',
        entityLevel: 'COMPANY',
        assetBindingPurpose: 'PUBLICATION_ALIAS',
      };

      const result = cvmSourceReferenceSchema.safeParse(raw);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar sourceReference com entityLevel ou exerciseOrder incorretos', () => {
      const raw = {
        source: 'cvm_dfp',
        fileId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        cnpj: '33000167000101',
        cvmCode: '009512',
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        exerciseOrder: 'PENÚLTIMO', // Rejeitado: MVP publica somente ÚLTIMO
        version: 1,
        parserVersion: '1.0.0',
        entityLevel: 'ASSET',      // Rejeitado: Contabilidade é COMPANY
        assetBindingPurpose: 'PUBLICATION_ALIAS',
      };

      const result = cvmSourceReferenceSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });

    it('deve normalizar e gerar string JSON válida através de buildAndValidateCvmSourceReference', () => {
      const fileId = crypto.randomUUID();
      const runId = crypto.randomUUID();

      const jsonStr = buildAndValidateCvmSourceReference({
        fileId,
        runId,
        cnpj: '33.000.167/0001-01', // Normaliza pontuação
        cvmCode: '9512',             // Normaliza com padStart(6, '0')
        referenceDate: '2024-12-31',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        version: 1,
        parserVersion: '1.0.0',
      });

      const parsed = JSON.parse(jsonStr);
      expect(parsed.cnpj).toBe('33000167000101');
      expect(parsed.cvmCode).toBe('009512');
      expect(parsed.entityLevel).toBe('COMPANY');
      expect(parsed.assetBindingPurpose).toBe('PUBLICATION_ALIAS');
      expect(parsed.exerciseOrder).toBe('ÚLTIMO');
    });
  });
});
