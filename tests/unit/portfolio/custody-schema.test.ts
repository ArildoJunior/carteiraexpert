import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  createCustodyAccountSchema,
  updateCustodyAccountSchema,
  archiveCustodyAccountSchema,
} from '../../../src/modules/portfolio/domain/custody.schema';

describe('custody.schema (Unit)', () => {
  const validPortfolioId = crypto.randomUUID();
  const validInstitutionId = crypto.randomUUID();
  const validAccountId = crypto.randomUUID();

  describe('createCustodyAccountSchema', () => {
    it('valida com sucesso a criação de uma conta com dados completos e corretos', () => {
      const input = {
        portfolioId: validPortfolioId,
        institutionId: validInstitutionId,
        name: 'Conta Corretagem Principal',
        accountNumber: '123456-7',
      };

      const result = createCustodyAccountSchema.parse(input);

      expect(result.portfolioId).toBe(validPortfolioId);
      expect(result.institutionId).toBe(validInstitutionId);
      expect(result.name).toBe('Conta Corretagem Principal');
      expect(result.accountNumber).toBe('123456-7');
    });

    it('valida com sucesso a criação sem accountNumber (opcional)', () => {
      const input = {
        portfolioId: validPortfolioId,
        institutionId: validInstitutionId,
        name: 'Conta Sem Número',
      };

      const result = createCustodyAccountSchema.parse(input);

      expect(result.portfolioId).toBe(validPortfolioId);
      expect(result.institutionId).toBe(validInstitutionId);
      expect(result.name).toBe('Conta Sem Número');
      expect(result.accountNumber).toBeUndefined();
    });

    it('permite accountNumber nulo', () => {
      const input = {
        portfolioId: validPortfolioId,
        institutionId: validInstitutionId,
        name: 'Conta Nula',
        accountNumber: null,
      };

      const result = createCustodyAccountSchema.parse(input);
      expect(result.accountNumber).toBeNull();
    });

    it('sanitiza e remove espaços em branco (trim) de name e accountNumber', () => {
      const input = {
        portfolioId: validPortfolioId,
        institutionId: validInstitutionId,
        name: '   XP Investimentos Trader   ',
        accountNumber: '   998877   ',
      };

      const result = createCustodyAccountSchema.parse(input);

      expect(result.name).toBe('XP Investimentos Trader');
      expect(result.accountNumber).toBe('998877');
    });

    it('exige nome obrigatório (rejeita string vazia ou apenas espaços)', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          institutionId: validInstitutionId,
          name: '',
        })
      ).toThrow('O nome da conta de custódia não pode estar vazio.');

      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          institutionId: validInstitutionId,
          name: '   ',
        })
      ).toThrow('O nome da conta de custódia não pode estar vazio.');
    });

    it('rejeita nome excedendo 100 caracteres', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          institutionId: validInstitutionId,
          name: 'A'.repeat(101),
        })
      ).toThrow('O nome da conta de custódia não pode exceder 100 caracteres.');
    });

    it('rejeita accountNumber excedendo 50 caracteres', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          institutionId: validInstitutionId,
          name: 'Conta Válida',
          accountNumber: '1'.repeat(51),
        })
      ).toThrow('O identificador da conta não pode exceder 50 caracteres.');
    });

    it('rejeita UUID inválido para portfolioId', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: 'invalid-uuid-123',
          institutionId: validInstitutionId,
          name: 'Conta Válida',
        })
      ).toThrow('ID da carteira deve ser um UUID válido.');
    });

    it('exige instituição obrigatória e rejeita UUID inválido para institutionId', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          institutionId: 'not-a-uuid',
          name: 'Conta Válida',
        })
      ).toThrow('ID da instituição de custódia deve ser um UUID válido.');

      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: validPortfolioId,
          name: 'Conta Válida',
        } as unknown as { portfolioId: string; institutionId: string; name: string })
      ).toThrow();
    });
  });

  describe('updateCustodyAccountSchema', () => {
    it('valida atualização parcial apenas com nome', () => {
      const input = {
        id: validAccountId,
        portfolioId: validPortfolioId,
        name: '   Novo Nome Atualizado   ',
      };

      const result = updateCustodyAccountSchema.parse(input);

      expect(result.id).toBe(validAccountId);
      expect(result.portfolioId).toBe(validPortfolioId);
      expect(result.name).toBe('Novo Nome Atualizado');
      expect(result.accountNumber).toBeUndefined();
      expect(result.status).toBeUndefined();
    });

    it('valida atualização parcial apenas com accountNumber', () => {
      const input = {
        id: validAccountId,
        portfolioId: validPortfolioId,
        accountNumber: '   ACC-9988   ',
      };

      const result = updateCustodyAccountSchema.parse(input);

      expect(result.accountNumber).toBe('ACC-9988');
      expect(result.name).toBeUndefined();
    });

    it('valida atualização parcial com status active ou archived', () => {
      const activeResult = updateCustodyAccountSchema.parse({
        id: validAccountId,
        portfolioId: validPortfolioId,
        status: 'active',
      });
      expect(activeResult.status).toBe('active');

      const archivedResult = updateCustodyAccountSchema.parse({
        id: validAccountId,
        portfolioId: validPortfolioId,
        status: 'archived',
      });
      expect(archivedResult.status).toBe('archived');
    });

    it('rejeita status inválido', () => {
      expect(() =>
        updateCustodyAccountSchema.parse({
          id: validAccountId,
          portfolioId: validPortfolioId,
          status: 'deleted' as unknown as 'active',
        })
      ).toThrow();
    });

    it('rejeita nome vazio na atualização quando fornecido', () => {
      expect(() =>
        updateCustodyAccountSchema.parse({
          id: validAccountId,
          portfolioId: validPortfolioId,
          name: '   ',
        })
      ).toThrow('O nome da conta de custódia não pode estar vazio.');
    });

    it('rejeita UUIDs inválidos em updateCustodyAccountSchema', () => {
      expect(() =>
        updateCustodyAccountSchema.parse({
          id: 'invalid-id',
          portfolioId: validPortfolioId,
        })
      ).toThrow('ID da conta de custódia deve ser um UUID válido.');

      expect(() =>
        updateCustodyAccountSchema.parse({
          id: validAccountId,
          portfolioId: 'invalid-portfolio-id',
        })
      ).toThrow('ID da carteira deve ser um UUID válido.');
    });
  });

  describe('archiveCustodyAccountSchema', () => {
    it('valida com sucesso os parâmetros para arquivamento', () => {
      const input = {
        id: validAccountId,
        portfolioId: validPortfolioId,
      };

      const result = archiveCustodyAccountSchema.parse(input);

      expect(result.id).toBe(validAccountId);
      expect(result.portfolioId).toBe(validPortfolioId);
    });

    it('rejeita UUIDs inválidos no arquivamento', () => {
      expect(() =>
        archiveCustodyAccountSchema.parse({
          id: 'invalid-uuid',
          portfolioId: validPortfolioId,
        })
      ).toThrow('ID da conta de custódia deve ser um UUID válido.');

      expect(() =>
        archiveCustodyAccountSchema.parse({
          id: validAccountId,
          portfolioId: 'invalid-portfolio',
        })
      ).toThrow('ID da carteira deve ser um UUID válido.');
    });
  });
});
