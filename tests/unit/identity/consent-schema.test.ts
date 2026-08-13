import { describe, it, expect } from 'vitest';
import { termsAcceptanceSchema } from '../../../src/modules/identity/domain/consent.schema';

describe('termsAcceptanceSchema', () => {
  it('deve aceitar quando os termos obrigatórios são marcados como true', () => {
    const result = termsAcceptanceSchema.safeParse({
      termsOfService: true,
      privacyPolicy: true,
      marketingCommunications: false,
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar se termsOfService for falso', () => {
    const result = termsAcceptanceSchema.safeParse({
      termsOfService: false,
      privacyPolicy: true,
      marketingCommunications: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.termsOfService).toBeDefined();
    }
  });

  it('deve rejeitar se privacyPolicy for falso', () => {
    const result = termsAcceptanceSchema.safeParse({
      termsOfService: true,
      privacyPolicy: false,
      marketingCommunications: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.privacyPolicy).toBeDefined();
    }
  });

  it('deve usar default false para marketingCommunications se omitido', () => {
    const result = termsAcceptanceSchema.safeParse({
      termsOfService: true,
      privacyPolicy: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.marketingCommunications).toBe(false);
    }
  });
});
