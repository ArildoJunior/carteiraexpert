import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  uploadFileLimitsSchema,
  updateImportItemSchema,
  confirmImportBatchSchema,
  rejectImportBatchSchema,
  MAX_IMPORT_FILE_SIZE,
} from '@/modules/imports/domain/import.schema';

describe('Import Schemas — Testes Unitários de Validação Zod', () => {
  describe('uploadFileLimitsSchema', () => {
    const validPortfolioId = crypto.randomUUID();

    it('deve aceitar arquivo .csv dentro dos limites', () => {
      const valid = {
        fileName: 'minhas_operacoes.csv',
        fileSize: 1024 * 500, // 500 KB
        portfolioId: validPortfolioId,
      };
      const result = uploadFileLimitsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar arquivo que não termine em .csv', () => {
      const invalid = {
        fileName: 'operacoes.xlsx',
        fileSize: 1024,
        portfolioId: validPortfolioId,
      };
      const result = uploadFileLimitsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Apenas arquivos .csv são permitidos');
      }
    });

    it('deve rejeitar arquivo vazio (0 bytes)', () => {
      const invalid = {
        fileName: 'vazio.csv',
        fileSize: 0,
        portfolioId: validPortfolioId,
      };
      const result = uploadFileLimitsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('está vazio');
      }
    });

    it('deve rejeitar arquivo que exceda 5 MB', () => {
      const invalid = {
        fileName: 'pesado.csv',
        fileSize: MAX_IMPORT_FILE_SIZE + 1,
        portfolioId: validPortfolioId,
      };
      const result = uploadFileLimitsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('excede o limite máximo');
      }
    });
  });

  describe('updateImportItemSchema', () => {
    it('deve validar edição de linha com campos corretos', () => {
      const valid = {
        actionType: 'BUY',
        rawTicker: 'petr4',
        tradeDate: '2026-01-15T12:00:00Z',
        quantity: '100',
        unitPrice: '38.50',
        fees: '4.50',
        currency: 'BRL',
        notes: 'Ajuste manual de preço',
        isExcluded: false,
      };

      const result = updateImportItemSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rawTicker).toBe('PETR4');
        expect(result.data.actionType).toBe('BUY');
      }
    });

    it('deve exigir direção explícita para MANUAL_ADJUSTMENT', () => {
      const missingDirection = {
        actionType: 'MANUAL_ADJUSTMENT',
        rawTicker: 'VALE3',
        tradeDate: '2026-01-15T12:00:00Z',
        quantity: '10',
        unitPrice: '60.00',
        fees: '0',
      };

      const res1 = updateImportItemSchema.safeParse(missingDirection);
      expect(res1.success).toBe(false);

      const withDirection = {
        ...missingDirection,
        direction: 'IN',
      };
      const res2 = updateImportItemSchema.safeParse(withDirection);
      expect(res2.success).toBe(true);
    });

    it('deve proibir direção para operações que não sejam MANUAL_ADJUSTMENT', () => {
      const invalid = {
        actionType: 'BUY',
        direction: 'IN',
        rawTicker: 'PETR4',
        tradeDate: '2026-01-15T12:00:00Z',
        quantity: '100',
        unitPrice: '38.50',
        fees: '0',
      };

      const result = updateImportItemSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('confirmImportBatchSchema', () => {
    it('deve validar dados de confirmação de lote', () => {
      const valid = {
        batchId: crypto.randomUUID(),
        targetPortfolioId: crypto.randomUUID(),
        selectedItemIds: [crypto.randomUUID(), crypto.randomUUID()],
      };

      const result = confirmImportBatchSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar confirmação sem nenhum item selecionado', () => {
      const invalid = {
        batchId: crypto.randomUUID(),
        targetPortfolioId: crypto.randomUUID(),
        selectedItemIds: [],
      };

      const result = confirmImportBatchSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('rejectImportBatchSchema', () => {
    it('deve validar id do lote para rejeição', () => {
      const valid = {
        batchId: crypto.randomUUID(),
      };
      expect(rejectImportBatchSchema.safeParse(valid).success).toBe(true);
    });
  });
});
