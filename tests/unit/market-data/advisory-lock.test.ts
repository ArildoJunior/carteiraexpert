import { describe, it, expect } from 'vitest';
import { ADVISORY_LOCK_KEYS } from '@/lib/db/advisory-lock';

describe('Constantes e Definições de Advisory Lock (PostgreSQL)', () => {
  it('garante que as chaves de advisory lock são números inteiros estáveis e imutáveis', () => {
    expect(ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER).toBe(42100);
    expect(ADVISORY_LOCK_KEYS.B3_COTAHIST_INGESTION).toBe(42101);
    expect(ADVISORY_LOCK_KEYS.CVM_DFP_INGESTION).toBe(42102);
  });

  it('garante que cada chave de lock é estritamente distinta', () => {
    const values = Object.values(ADVISORY_LOCK_KEYS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});
