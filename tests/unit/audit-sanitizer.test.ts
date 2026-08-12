import { describe, it, expect } from 'vitest';
import { sanitizePayload } from '../../src/lib/db/audit';
import { Decimal } from '../../src/lib/decimal';

describe('Audit Sanitizer Unit Tests', () => {
  it('deve exigir allowlist ou preMinimized configurado', () => {
    expect(() => sanitizePayload({ a: 1 }, {})).toThrow(
      'O sanitizador de auditoria exige uma allowlist por padrão, exceto se preMinimized estiver configurado.'
    );
  });

  it('deve filtrar campos de primeiro nível usando allowlist por padrão', () => {
    const payload = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    };
    const result = sanitizePayload(payload, {
      allowlist: ['name'],
      allowedNumbers: ['age']
    });
    expect(result).toEqual({ name: 'John Doe' });
    expect(result.email).toBeUndefined();
  });

  it('deve remover campos proibidos em qualquer nível (allowlist e preMinimized)', () => {
    const payload = {
      name: 'John Doe',
      password: 'secret_password',
      nested: {
        api_key: 'key123',
        safe_field: 'ok'
      }
    };

    // Teste com allowlist
    const resultAllow = sanitizePayload(payload, {
      allowlist: ['name', 'password', 'nested'],
    });
    expect(resultAllow).toEqual({
      name: 'John Doe',
      nested: { safe_field: 'ok' }
    });
    expect(resultAllow.password).toBeUndefined();
    expect(resultAllow.nested.api_key).toBeUndefined();

    // Teste com preMinimized
    const resultPre = sanitizePayload(payload, {
      preMinimized: true
    });
    expect(resultPre).toEqual({
      name: 'John Doe',
      nested: { safe_field: 'ok' }
    });
    expect(resultPre.password).toBeUndefined();
    expect(resultPre.nested.api_key).toBeUndefined();
  });

  it('deve rejeitar numbers por padrão fora do allowedNumbers', () => {
    const payload = {
      price: 10.5,
      qty: 2
    };

    expect(() => sanitizePayload(payload, { allowlist: ['price'], allowedNumbers: [] })).toThrow(
      'Uso incorreto de tipo number no campo "price". Valores financeiros devem ser representados como string ou Decimal. Números não-financeiros devem estar em allowedNumbers.'
    );

    // Deve aceitar se em allowedNumbers
    const payloadOk = {
      price: '10.5', // agora string para não lançar erro em price
      qty: 2
    };
    const okResult = sanitizePayload(payloadOk, {
      allowlist: ['price', 'qty'],
      allowedNumbers: ['qty']
    });
    expect(okResult.qty).toBe(2);
    expect(okResult.price).toBe('10.5');
  });

  it('deve aceitar e converter instâncias de Decimal para string', () => {
    const payload = {
      balance: new Decimal('125.50')
    };
    const result = sanitizePayload(payload, {
      allowlist: ['balance']
    });
    expect(result.balance).toBe('125.5');
  });

  it('deve aceitar e converter instâncias de Date para string ISO 8601', () => {
    const date = new Date('2026-08-12T12:00:00.000Z');
    const payload = {
      createdAt: date
    };
    const result = sanitizePayload(payload, {
      allowlist: ['createdAt']
    });
    expect(result.createdAt).toBe('2026-08-12T12:00:00.000Z');
  });

  it('deve rejeitar NaN, Infinity e bigint com erros descritivos', () => {
    const payloadNaN = { val: Number.NaN };
    expect(() => sanitizePayload(payloadNaN, { preMinimized: true, allowedNumbers: ['val'] })).toThrow(
      'Valor NaN detectado'
    );

    const payloadInf = { val: Number.POSITIVE_INFINITY };
    expect(() => sanitizePayload(payloadInf, { preMinimized: true, allowedNumbers: ['val'] })).toThrow(
      'Valor infinito detectado'
    );

    const payloadBigInt = { val: BigInt(10) };
    expect(() => sanitizePayload(payloadBigInt, { preMinimized: true })).toThrow(
      'Tipo bigint detectado'
    );
  });

  it('deve rejeitar payloads binários (Buffer ou Uint8Array)', () => {
    const payloadBuffer = { data: Buffer.from('hello') };
    expect(() => sanitizePayload(payloadBuffer, { preMinimized: true })).toThrow(
      'Payload binário (Buffer/Uint8Array) detectado'
    );

    const payloadArray = { data: new Uint8Array([1, 2]) };
    expect(() => sanitizePayload(payloadArray, { preMinimized: true })).toThrow(
      'Payload binário (Buffer/Uint8Array) detectado'
    );
  });

  it('deve rejeitar referências cíclicas com erro explícito', () => {
    const payload: any = { name: 'cycle' };
    payload.self = payload;
    expect(() => sanitizePayload(payload, { preMinimized: true })).toThrow(
      'Referência cíclica detectada'
    );
  });

  it('deve rejeitar strings com comprimento maior que 1000 caracteres', () => {
    const longString = 'a'.repeat(1001);
    const payload = { content: longString };
    expect(() => sanitizePayload(payload, { allowlist: ['content'] })).toThrow(
      'String excessivamente longa no campo "content"'
    );
  });

  it('deve rejeitar payloads serializados que excedam 64 KB', () => {
    // Array com 5000 strings permitidas de 100 bytes cada, totalizando > 500 KB
    const dataArray = Array.from({ length: 5000 }, (_, i) => `item-${i}-${'a'.repeat(90)}`);
    const payload = { list: dataArray };

    expect(() => sanitizePayload(payload, { allowlist: ['list'] })).toThrow(
      'Payload de auditoria excessivamente grande'
    );
  });

  it('deve remover undefined e converter objetos sem campos permitidos em objeto vazio', () => {
    const payload = {
      val: undefined,
      secretObj: {
        password: '123'
      }
    };
    const result = sanitizePayload(payload, {
      preMinimized: true
    });
    expect(result).toEqual({ secretObj: {} });
    expect(result.val).toBeUndefined();
  });
});
