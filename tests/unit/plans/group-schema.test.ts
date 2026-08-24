import { describe, it, expect } from 'vitest';
import {
  createBillingGroupSchema,
  inviteGroupMemberSchema,
  resendGroupInvitationSchema,
  revokeGroupInvitationSchema,
  acceptGroupInvitationSchema,
  declineGroupInvitationSchema,
  removeGroupMemberSchema,
} from '@/modules/plans/domain/group.schema';
import { hashInviteToken } from '@/modules/plans/server/group.service';

describe('Unit: Group Domain Schemas and Crypto Hashing', () => {
  it('1. valida createBillingGroupSchema com sucesso para nomes válidos', () => {
    const valid = createBillingGroupSchema.safeParse({ name: 'Família Silva' });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.name).toBe('Família Silva');
    }
  });

  it('2. rejeita createBillingGroupSchema com nome vazio ou menor que 2 caracteres', () => {
    const invalidShort = createBillingGroupSchema.safeParse({ name: 'A' });
    expect(invalidShort.success).toBe(false);

    const invalidEmpty = createBillingGroupSchema.safeParse({ name: '   ' });
    expect(invalidEmpty.success).toBe(false);
  });

  it('3. valida inviteGroupMemberSchema com e-mail válido normalizado', () => {
    const valid = inviteGroupMemberSchema.safeParse({ email: '  Member.Test@Example.COM ' });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('member.test@example.com');
    }
  });

  it('4. rejeita inviteGroupMemberSchema com e-mail inválido', () => {
    const invalid = inviteGroupMemberSchema.safeParse({ email: 'not-an-email' });
    expect(invalid.success).toBe(false);
  });

  it('5. valida schemas de UUID para resend, revoke e remove', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(resendGroupInvitationSchema.safeParse({ invitationId: validUuid }).success).toBe(true);
    expect(revokeGroupInvitationSchema.safeParse({ invitationId: validUuid }).success).toBe(true);
    expect(removeGroupMemberSchema.safeParse({ memberUserId: validUuid }).success).toBe(true);

    expect(resendGroupInvitationSchema.safeParse({ invitationId: 'invalid-id' }).success).toBe(false);
    expect(removeGroupMemberSchema.safeParse({ memberUserId: 'invalid-id' }).success).toBe(false);
  });

  it('6. valida schemas de token para accept e decline', () => {
    expect(acceptGroupInvitationSchema.safeParse({ token: 'abc123token456' }).success).toBe(true);
    expect(declineGroupInvitationSchema.safeParse({ token: 'abc123token456' }).success).toBe(true);

    expect(acceptGroupInvitationSchema.safeParse({ token: 'short' }).success).toBe(false);
  });

  it('7. gera hash SHA-256 determinístico para tokens de convite', () => {
    const token = 'my-secret-random-token-12345';
    const hash1 = hashInviteToken(token);
    const hash2 = hashInviteToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
    expect(hash1).not.toBe(token);
  });
});
