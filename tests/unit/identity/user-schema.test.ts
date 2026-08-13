import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../../src/modules/identity/domain/user.schema';

// ─── registerSchema ───────────────────────────────────────────────────────────
describe('registerSchema', () => {
  const valid = {
    name: 'João Silva',
    email: 'joao@exemplo.com',
    password: 'Senh@Forte1',
    confirmPassword: 'Senh@Forte1',
  };

  it('aceita dados válidos', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('normaliza o e-mail para minúsculas', () => {
    const result = registerSchema.safeParse({ ...valid, email: 'JOAO@EXEMPLO.COM' });
    expect(result.success && result.data.email).toBe('joao@exemplo.com');
  });

  it('rejeita e-mail inválido', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'invalido' }).success).toBe(false);
  });

  it('rejeita nome com menos de 2 caracteres', () => {
    expect(registerSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
  });

  it('rejeita confirmação de senha divergente', () => {
    expect(
      registerSchema.safeParse({ ...valid, confirmPassword: 'Diferente@1' }).success
    ).toBe(false);
  });

  // ─── Regras de Senha ───────────────────────────────────────────────────────
  describe('regras de senha', () => {
    it('rejeita senha com menos de 8 code points', () => {
      expect(
        registerSchema.safeParse({ ...valid, password: 'Ab@1234', confirmPassword: 'Ab@1234' }).success
      ).toBe(false);
    });

    it('rejeita senha que excede 72 bytes UTF-8', () => {
      // "€" ocupa 3 bytes; 25 "€" = 75 bytes — excede o limite
      const longa = 'A1@' + '€'.repeat(25);
      expect(
        registerSchema.safeParse({ ...valid, password: longa, confirmPassword: longa }).success
      ).toBe(false);
    });

    it('rejeita senha sem letra maiúscula', () => {
      const sem = 'senh@forte1';
      expect(
        registerSchema.safeParse({ ...valid, password: sem, confirmPassword: sem }).success
      ).toBe(false);
    });

    it('rejeita senha sem letra minúscula', () => {
      const sem = 'SENH@FORTE1';
      expect(
        registerSchema.safeParse({ ...valid, password: sem, confirmPassword: sem }).success
      ).toBe(false);
    });

    it('rejeita senha sem número', () => {
      const sem = 'Senh@Forte';
      expect(
        registerSchema.safeParse({ ...valid, password: sem, confirmPassword: sem }).success
      ).toBe(false);
    });

    it('rejeita senha sem caractere especial', () => {
      const sem = 'SenhaForte1';
      expect(
        registerSchema.safeParse({ ...valid, password: sem, confirmPassword: sem }).success
      ).toBe(false);
    });

    it('aceita senha com exatamente 8 code points Unicode', () => {
      const min = 'Aa@12345';
      expect(
        registerSchema.safeParse({ ...valid, password: min, confirmPassword: min }).success
      ).toBe(true);
    });

    it('NÃO faz trim ou toLowerCase na senha', () => {
      const comEspacos = ' Senh@Forte1 ';
      const result = registerSchema.safeParse({
        ...valid,
        password: comEspacos,
        confirmPassword: comEspacos,
      });
      // Deve aceitar (espaço é caractere especial válido)
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.password).toBe(comEspacos);
      }
    });
  });
});

// ─── loginSchema ──────────────────────────────────────────────────────────────
describe('loginSchema', () => {
  it('aceita login válido', () => {
    expect(loginSchema.safeParse({ email: 'user@test.com', password: 'qualquer' }).success).toBe(true);
  });

  it('normaliza e-mail para minúsculas', () => {
    const result = loginSchema.safeParse({ email: 'USER@TEST.COM', password: 'qualquer' });
    expect(result.success && result.data.email).toBe('user@test.com');
  });

  it('rejeita senha vazia', () => {
    expect(loginSchema.safeParse({ email: 'user@test.com', password: '' }).success).toBe(false);
  });
});

// ─── forgotPasswordSchema ────────────────────────────────────────────────────
describe('forgotPasswordSchema', () => {
  it('aceita e-mail válido', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'user@test.com' }).success).toBe(true);
  });

  it('rejeita e-mail inválido', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'invalido' }).success).toBe(false);
  });
});

// ─── resetPasswordSchema ─────────────────────────────────────────────────────
describe('resetPasswordSchema', () => {
  const valid = {
    token: 'token-valido-123',
    password: 'NovaSenh@1',
    confirmPassword: 'NovaSenh@1',
  };

  it('aceita dados válidos', () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejeita confirmação divergente', () => {
    expect(
      resetPasswordSchema.safeParse({ ...valid, confirmPassword: 'Diferente@1' }).success
    ).toBe(false);
  });

  it('rejeita token vazio', () => {
    expect(resetPasswordSchema.safeParse({ ...valid, token: '' }).success).toBe(false);
  });
});
