import { describe, it, expect } from 'vitest';
import {
  createCustodyAccountSchema,
  updateCustodyAccountSchema,
  archiveCustodyAccountSchema,
} from '../../../src/modules/portfolio/domain/custody.schema';
import {
  serializeCustodyInstitution,
  serializeCustodyAccount,
} from '../../../src/modules/portfolio/server/custody.service';
import {
  CustodyInstitutionNotFoundError,
  CustodyAccountNotFoundError,
  CustodyAccountArchivedError,
  InvalidCustodyAccountError,
} from '../../../src/modules/portfolio/domain/errors';
import type {
  CustodyInstitution,
  CustodyAccountWithInstitution,
} from '../../../src/modules/portfolio/domain/custody.types';
import crypto from 'node:crypto';

describe('Unitário: Domínio de Instituições de Custódia e Corretoras', () => {
  describe('Zod: createCustodyAccountSchema', () => {
    it('deve validar com sucesso uma conta de custódia válida', () => {
      const portfolioId = crypto.randomUUID();
      const institutionId = crypto.randomUUID();

      const parsed = createCustodyAccountSchema.parse({
        portfolioId,
        institutionId,
        name: '  XP Investimentos Principal  ',
        accountNumber: '  123456-7  ',
      });

      expect(parsed.portfolioId).toBe(portfolioId);
      expect(parsed.institutionId).toBe(institutionId);
      expect(parsed.name).toBe('XP Investimentos Principal');
      expect(parsed.accountNumber).toBe('123456-7');
    });

    it('deve aceitar accountNumber opcional ou nulo/indefinido', () => {
      const portfolioId = crypto.randomUUID();
      const institutionId = crypto.randomUUID();

      const parsedWithoutAccount = createCustodyAccountSchema.parse({
        portfolioId,
        institutionId,
        name: 'BTG Pactual',
      });

      expect(parsedWithoutAccount.accountNumber).toBeUndefined();
    });

    it('deve rejeitar portfolioId inválido (não UUID)', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: 'not-a-uuid',
          institutionId: crypto.randomUUID(),
          name: 'Clear Corretora',
        })
      ).toThrow();
    });

    it('deve rejeitar institutionId inválido (não UUID)', () => {
      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: crypto.randomUUID(),
          institutionId: '123-abc',
          name: 'Clear Corretora',
        })
      ).toThrow();
    });

    it('deve rejeitar nome em branco ou vazio', () => {
      const pId = crypto.randomUUID();
      const iId = crypto.randomUUID();

      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: pId,
          institutionId: iId,
          name: '   ',
        })
      ).toThrow();
    });

    it('deve rejeitar nome excessivamente longo (> 100 caracteres)', () => {
      const pId = crypto.randomUUID();
      const iId = crypto.randomUUID();

      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: pId,
          institutionId: iId,
          name: 'a'.repeat(101),
        })
      ).toThrow();
    });

    it('deve rejeitar accountNumber excessivamente longo (> 50 caracteres)', () => {
      const pId = crypto.randomUUID();
      const iId = crypto.randomUUID();

      expect(() =>
        createCustodyAccountSchema.parse({
          portfolioId: pId,
          institutionId: iId,
          name: 'Avenue Securities',
          accountNumber: 'x'.repeat(51),
        })
      ).toThrow();
    });
  });

  describe('Zod: updateCustodyAccountSchema', () => {
    it('deve validar atualização de status e nome', () => {
      const id = crypto.randomUUID();
      const portfolioId = crypto.randomUUID();

      const parsed = updateCustodyAccountSchema.parse({
        id,
        portfolioId,
        name: 'Nova Descrição Conta',
        status: 'archived',
      });

      expect(parsed.id).toBe(id);
      expect(parsed.name).toBe('Nova Descrição Conta');
      expect(parsed.status).toBe('archived');
    });

    it('deve rejeitar status inválido', () => {
      expect(() =>
        updateCustodyAccountSchema.parse({
          id: crypto.randomUUID(),
          portfolioId: crypto.randomUUID(),
          status: 'deleted' as any,
        })
      ).toThrow();
    });
  });

  describe('Zod: archiveCustodyAccountSchema', () => {
    it('deve validar com sucesso identificadores UUID', () => {
      const id = crypto.randomUUID();
      const portfolioId = crypto.randomUUID();

      const parsed = archiveCustodyAccountSchema.parse({ id, portfolioId });
      expect(parsed.id).toBe(id);
      expect(parsed.portfolioId).toBe(portfolioId);
    });

    it('deve rejeitar formato inválido', () => {
      expect(() =>
        archiveCustodyAccountSchema.parse({
          id: 'invalid',
          portfolioId: crypto.randomUUID(),
        })
      ).toThrow();
    });
  });

  describe('Serializadores de Domínio', () => {
    it('serializeCustodyInstitution deve formatar datas para ISO', () => {
      const now = new Date('2026-09-04T10:00:00.000Z');
      const inst: CustodyInstitution = {
        id: crypto.randomUUID(),
        name: 'XP Investimentos',
        code: 'XP',
        country: 'BRA',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const serialized = serializeCustodyInstitution(inst);
      expect(serialized.id).toBe(inst.id);
      expect(serialized.name).toBe('XP Investimentos');
      expect(serialized.code).toBe('XP');
      expect(serialized.country).toBe('BRA');
      expect(serialized.status).toBe('active');
      expect(serialized.createdAt).toBe('2026-09-04T10:00:00.000Z');
      expect(serialized.updatedAt).toBe('2026-09-04T10:00:00.000Z');
    });

    it('serializeCustodyAccount deve formatar datas e aninhar instituição serializada', () => {
      const now = new Date('2026-09-04T11:00:00.000Z');
      const account: CustodyAccountWithInstitution = {
        id: crypto.randomUUID(),
        portfolioId: crypto.randomUUID(),
        institutionId: crypto.randomUUID(),
        name: 'Conta BTG Principal',
        accountNumber: '998877',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        institution: {
          id: crypto.randomUUID(),
          name: 'BTG Pactual',
          code: 'BTG',
          country: 'BRA',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      };

      const serialized = serializeCustodyAccount(account);
      expect(serialized.id).toBe(account.id);
      expect(serialized.name).toBe('Conta BTG Principal');
      expect(serialized.accountNumber).toBe('998877');
      expect(serialized.status).toBe('active');
      expect(serialized.deletedAt).toBeNull();
      expect(serialized.createdAt).toBe('2026-09-04T11:00:00.000Z');
      expect(serialized.institution?.name).toBe('BTG Pactual');
      expect(serialized.institution?.code).toBe('BTG');
    });

    it('serializeCustodyAccount deve converter deletedAt quando presente', () => {
      const now = new Date('2026-09-04T11:00:00.000Z');
      const deletedDate = new Date('2026-09-04T12:00:00.000Z');
      const account: CustodyAccountWithInstitution = {
        id: crypto.randomUUID(),
        portfolioId: crypto.randomUUID(),
        institutionId: crypto.randomUUID(),
        name: 'Conta Arquivada',
        accountNumber: null,
        status: 'archived',
        createdAt: now,
        updatedAt: now,
        deletedAt: deletedDate,
        institution: {
          id: crypto.randomUUID(),
          name: 'Inter DTVM',
          code: 'INTER',
          country: 'BRA',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      };

      const serialized = serializeCustodyAccount(account);
      expect(serialized.deletedAt).toBe('2026-09-04T12:00:00.000Z');
      expect(serialized.status).toBe('archived');
    });
  });

  describe('Erros de Domínio de Custódia', () => {
    it('CustodyInstitutionNotFoundError deve possuir name e mensagem apropriados', () => {
      const err = new CustodyInstitutionNotFoundError();
      expect(err.name).toBe('CustodyInstitutionNotFoundError');
      expect(err.message).toContain('Instituição de custódia');
    });

    it('CustodyAccountNotFoundError deve possuir name e mensagem apropriados', () => {
      const err = new CustodyAccountNotFoundError();
      expect(err.name).toBe('CustodyAccountNotFoundError');
      expect(err.message).toContain('Conta de custódia');
    });

    it('CustodyAccountArchivedError deve possuir name e mensagem apropriados', () => {
      const err = new CustodyAccountArchivedError();
      expect(err.name).toBe('CustodyAccountArchivedError');
      expect(err.message).toContain('arquivada');
    });

    it('InvalidCustodyAccountError deve aceitar mensagem customizada', () => {
      const err = new InvalidCustodyAccountError('Mensagem específica de validação');
      expect(err.name).toBe('InvalidCustodyAccountError');
      expect(err.message).toBe('Mensagem específica de validação');
    });
  });
});
