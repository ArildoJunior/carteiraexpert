import { describe, it, expect } from 'vitest';
import { loginKey, resetByIpKey, resetByEmailKey } from '../../../src/modules/identity/server/rate-limiter';

// ─── Chaves HMAC ──────────────────────────────────────────────────────────────
// Testes de propriedades das chaves HMAC — sem acesso ao banco de dados.
describe('loginKey', () => {
  it('gera uma string hex de 64 caracteres', () => {
    const key = loginKey('127.0.0.1', 'user@test.com');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  it('é determinístico: mesma entrada → mesma chave', () => {
    const k1 = loginKey('192.168.1.1', 'user@test.com');
    const k2 = loginKey('192.168.1.1', 'user@test.com');
    expect(k1).toBe(k2);
  });

  it('gera chaves diferentes para e-mails diferentes', () => {
    const k1 = loginKey('192.168.1.1', 'user@test.com');
    const k2 = loginKey('192.168.1.1', 'outro@test.com');
    expect(k1).not.toBe(k2);
  });

  it('gera chaves diferentes para IPs diferentes', () => {
    const k1 = loginKey('192.168.1.1', 'user@test.com');
    const k2 = loginKey('10.0.0.1', 'user@test.com');
    expect(k1).not.toBe(k2);
  });
});

describe('resetByIpKey', () => {
  it('gera uma string hex de 64 caracteres', () => {
    const key = resetByIpKey('10.0.0.1');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  it('gera chave diferente de loginKey para o mesmo IP', () => {
    // As chaves não devem colidir entre diferentes tipos de operação
    const rk = resetByIpKey('10.0.0.1');
    const lk = loginKey('10.0.0.1', '');
    expect(rk).not.toBe(lk);
  });
});

describe('resetByEmailKey', () => {
  it('gera uma string hex de 64 caracteres', () => {
    const key = resetByEmailKey('user@test.com');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  it('gera chave diferente de loginKey para o mesmo e-mail', () => {
    const rk = resetByEmailKey('user@test.com');
    const lk = loginKey('', 'user@test.com');
    expect(rk).not.toBe(lk);
  });
});
