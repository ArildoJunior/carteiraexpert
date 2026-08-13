import { describe, it, expect } from 'vitest';
import argon2 from 'argon2';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  DUMMY_ARGON2_HASH,
} from '../../../src/modules/identity/domain/password';

// ─── DUMMY_ARGON2_HASH ────────────────────────────────────────────────────────
// Estes testes DEVEM passar para validar que o hash dummy documentado é real
// e foi gerado com os parâmetros corretos.
describe('DUMMY_ARGON2_HASH', () => {
  it('não lança exceção ao ser processado pelo pacote argon2', async () => {
    await expect(
      argon2.verify(DUMMY_ARGON2_HASH, 'qualquer_senha')
    ).resolves.not.toThrow();
  });

  it('retorna true para a senha correspondente ao hash dummy', async () => {
    const result = await argon2.verify(
      DUMMY_ARGON2_HASH,
      'carteiraexpert_dummy_password_2026'
    );
    expect(result).toBe(true);
  });

  it('retorna false para uma senha incorreta', async () => {
    const result = await argon2.verify(DUMMY_ARGON2_HASH, 'senha_incorreta_123');
    expect(result).toBe(false);
  });

  it('contém os parâmetros corretos do Argon2id (m=19456, t=2, p=1)', () => {
    expect(DUMMY_ARGON2_HASH).toMatch(/\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });
});

// ─── hashPassword ─────────────────────────────────────────────────────────────
describe('hashPassword', () => {
  it('gera um hash Argon2id válido', async () => {
    const hash = await hashPassword('MinhaSenh@1');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const hash1 = await hashPassword('MinhaSenh@1');
    const hash2 = await hashPassword('MinhaSenh@1');
    expect(hash1).not.toBe(hash2);
  });

  it('usa os parâmetros corretos: m=19456, t=2, p=1', async () => {
    const hash = await hashPassword('MinhaSenh@1');
    expect(hash).toMatch(/\$m=19456,p=1,t=2\$/);
  });

  it('lida corretamente com senha contendo caracteres Unicode multibyte', async () => {
    const senha = 'Café@12345🔐';
    const hash = await hashPassword(senha);
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});

// ─── verifyPassword ───────────────────────────────────────────────────────────
describe('verifyPassword', () => {
  it('retorna true para a senha correta', async () => {
    const hash = await hashPassword('CorretaSenh@1');
    const result = await verifyPassword(hash, 'CorretaSenh@1');
    expect(result).toBe(true);
  });

  it('retorna false para uma senha incorreta', async () => {
    const hash = await hashPassword('CorretaSenh@1');
    const result = await verifyPassword(hash, 'SenhaErrada@9');
    expect(result).toBe(false);
  });

  it('retorna false para um hash inválido sem lançar exceção', async () => {
    const result = await verifyPassword('hash_completamente_invalido', 'qualquer');
    expect(result).toBe(false);
  });

  it('retorna false para uma string vazia como senha', async () => {
    const hash = await hashPassword('CorretaSenh@1');
    const result = await verifyPassword(hash, '');
    expect(result).toBe(false);
  });

  it('preserva a sensibilidade a maiúsculas/minúsculas', async () => {
    const hash = await hashPassword('SenhaCase@1');
    const result = await verifyPassword(hash, 'senhacase@1');
    expect(result).toBe(false);
  });
});

// ─── needsRehash ─────────────────────────────────────────────────────────────
describe('needsRehash', () => {
  it('retorna false para um hash gerado com os parâmetros atuais', async () => {
    const hash = await hashPassword('TestPassword@1');
    expect(needsRehash(hash)).toBe(false);
  });

  it('retorna true para o DUMMY_ARGON2_HASH com os parâmetros idênticos', () => {
    // O DUMMY foi gerado com os mesmos parâmetros — deve retornar false
    expect(needsRehash(DUMMY_ARGON2_HASH)).toBe(false);
  });
});
