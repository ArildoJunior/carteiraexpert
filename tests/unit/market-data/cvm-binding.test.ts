import { describe, expect, it } from 'vitest';
import {
  proposeBindingSchema,
  reviewBindingSchema,
} from '@/modules/market-data/domain/cvm-binding.schema';
import {
  inferAuxiliaryShareClassFromTicker,
  validateBindingProposalEvidence,
  validateBindingTransition,
  validateShareClassCompatibility,
} from '@/modules/market-data/domain/cvm-binding-engine';
import {
  CvmIncompatibleShareClassError,
  CvmIneligibleAssetTypeError,
  CvmInsufficientEvidenceError,
  CvmInvalidBindingTransitionError,
} from '@/modules/market-data/domain/cvm-binding.types';

describe('CVM Binding Engine & Validation (Unit)', () => {
  describe('Schemas Zod de Proposta e Revisão de Vínculos', () => {
    it('deve validar proposta com dados completos, trim e justificativa >= 10 caracteres', () => {
      const input = {
        companyId: 'a0000000-0000-4000-8000-000000000001',
        assetId: 'b0000000-0000-4000-8000-000000000002',
        shareClass: 'PN' as const,
        matchMethod: 'CURATED_SEED' as const,
        justification: '  FCA CVM 2024 - Seção 16.1 / Código ISIN BRPETRACNPR6 / PETR4  ',
        source: '  cvm_seed_2024  ',
      };

      const parsed = proposeBindingSchema.parse(input);
      expect(parsed.justification).toBe('FCA CVM 2024 - Seção 16.1 / Código ISIN BRPETRACNPR6 / PETR4');
      expect(parsed.source).toBe('cvm_seed_2024');
      expect(parsed.shareClass).toBe('PN');
    });

    it('deve rejeitar justificativa com menos de 10 caracteres válidos ou composta apenas por espaços', () => {
      expect(() =>
        proposeBindingSchema.parse({
          companyId: 'a0000000-0000-4000-8000-000000000001',
          assetId: 'b0000000-0000-4000-8000-000000000002',
          matchMethod: 'MANUAL',
          justification: '   curto   ', // 5 caracteres após trim
          source: 'manual',
        })
      ).toThrow();

      expect(() =>
        reviewBindingSchema.parse({
          bindingId: 'c0000000-0000-4000-8000-000000000003',
          reviewerId: 'd0000000-0000-4000-8000-000000000004',
          justification: '          ',
        })
      ).toThrow();
    });

    it('deve rejeitar UUIDs malformados', () => {
      expect(() =>
        proposeBindingSchema.parse({
          companyId: 'invalid-uuid',
          assetId: 'b0000000-0000-4000-8000-000000000002',
          matchMethod: 'MANUAL',
          justification: 'Justificativa válida com mais de dez caracteres.',
          source: 'manual',
        })
      ).toThrow();
    });
  });

  describe('Inferência Auxiliar por Ticker', () => {
    it('deve inferir classes auxiliares a partir de sufixos canônicos da B3', () => {
      expect(inferAuxiliaryShareClassFromTicker('PETR3')).toBe('ON');
      expect(inferAuxiliaryShareClassFromTicker('PETR4')).toBe('PN');
      expect(inferAuxiliaryShareClassFromTicker('VALE3')).toBe('ON');
      expect(inferAuxiliaryShareClassFromTicker('USIM5')).toBe('PNA');
      expect(inferAuxiliaryShareClassFromTicker('ELET6')).toBe('PNB');
      expect(inferAuxiliaryShareClassFromTicker('SANB11')).toBe('UNT');
      expect(inferAuxiliaryShareClassFromTicker('BOVA11')).toBe('UNT');
      expect(inferAuxiliaryShareClassFromTicker('INVALID')).toBeNull();
    });
  });

  describe('Validação de Compatibilidade e Elegibilidade de Ativos', () => {
    it('deve rejeitar FIIs, BDRs, ETFs, índices e bonds com CvmIneligibleAssetTypeError', () => {
      expect(() =>
        validateShareClassCompatibility('UNT', 'FII', 'HGLG11')
      ).toThrow(CvmIneligibleAssetTypeError);

      expect(() =>
        validateShareClassCompatibility(null, 'BDR', 'AAPL34')
      ).toThrow(CvmIneligibleAssetTypeError);

      expect(() =>
        validateShareClassCompatibility('UNT', 'ETF', 'BOVA11')
      ).toThrow(CvmIneligibleAssetTypeError);

      expect(() =>
        validateShareClassCompatibility(null, 'INDEX', 'IBOV')
      ).toThrow(CvmIneligibleAssetTypeError);
    });

    it('deve rejeitar discrepâncias comprovadas entre sufixo do ticker e classe acionária', () => {
      // Ticker 3 não pode ser PN
      expect(() =>
        validateShareClassCompatibility('PN', 'STOCK', 'PETR3')
      ).toThrow(CvmIncompatibleShareClassError);

      // Ticker 4 não pode ser ON
      expect(() =>
        validateShareClassCompatibility('ON', 'STOCK', 'PETR4')
      ).toThrow(CvmIncompatibleShareClassError);
    });

    it('deve exigir comprovação documental para ticker 11 classificado como UNT', () => {
      // Sem comprovação explícita de Unit
      expect(() =>
        validateShareClassCompatibility('UNT', 'STOCK', 'TAEE11', { isUnitDocumented: false })
      ).toThrow(CvmIncompatibleShareClassError);

      // Com comprovação documental de Unit
      expect(() =>
        validateShareClassCompatibility('UNT', 'STOCK', 'TAEE11', { isUnitDocumented: true })
      ).not.toThrow();
    });
  });

  describe('Validação de Evidência Documental por Método', () => {
    it('deve exigir ISIN para CURATED_SEED e correspondência de CNPJ para CNPJ_EXACT', () => {
      expect(() =>
        validateBindingProposalEvidence('CURATED_SEED', 'Justificativa documental válida.', 'seed_source', {
          hasIsin: false,
        })
      ).toThrow(CvmInsufficientEvidenceError);

      expect(() =>
        validateBindingProposalEvidence('CNPJ_EXACT', 'Justificativa documental válida.', 'b3_sync', {
          hasCnpjMatch: false,
        })
      ).toThrow(CvmInsufficientEvidenceError);

      expect(() =>
        validateBindingProposalEvidence('CURATED_SEED', 'Justificativa documental válida.', 'seed_source', {
          hasIsin: true,
        })
      ).not.toThrow();
    });
  });

  describe('Máquina de Estados de Revisão', () => {
    it('deve emitir CVM_BINDING_APPROVED na homologação de PENDING_REVIEW para APPROVED', () => {
      const result = validateBindingTransition('PENDING_REVIEW', 'APPROVED');
      expect(result.action).toBe('CVM_BINDING_APPROVED');
    });

    it('deve emitir CVM_BINDING_REJECTED na rejeição inicial de PENDING_REVIEW para REJECTED', () => {
      const result = validateBindingTransition('PENDING_REVIEW', 'REJECTED');
      expect(result.action).toBe('CVM_BINDING_REJECTED');
    });

    it('deve emitir CVM_BINDING_REVOKED na revogação formal de APPROVED para REJECTED', () => {
      const result = validateBindingTransition('APPROVED', 'REJECTED');
      expect(result.action).toBe('CVM_BINDING_REVOKED');
    });

    it('deve emitir CVM_BINDING_REOPENED na reabertura de REJECTED para PENDING_REVIEW', () => {
      const result = validateBindingTransition('REJECTED', 'PENDING_REVIEW');
      expect(result.action).toBe('CVM_BINDING_REOPENED');
    });

    it('deve retornar NO_OP para repetições idempotentes', () => {
      expect(validateBindingTransition('APPROVED', 'APPROVED')).toEqual({ action: 'NO_OP' });
      expect(validateBindingTransition('REJECTED', 'REJECTED')).toEqual({ action: 'NO_OP' });
      expect(validateBindingTransition('PENDING_REVIEW', 'PENDING_REVIEW')).toEqual({ action: 'NO_OP' });
    });

    it('deve proibir transição direta de APPROVED para PENDING_REVIEW e REJECTED para APPROVED', () => {
      expect(() => validateBindingTransition('APPROVED', 'PENDING_REVIEW')).toThrow(
        CvmInvalidBindingTransitionError
      );
      expect(() => validateBindingTransition('REJECTED', 'APPROVED')).toThrow(
        CvmInvalidBindingTransitionError
      );
    });
  });
});
