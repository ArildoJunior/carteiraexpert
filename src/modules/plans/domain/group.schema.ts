import { z } from 'zod';

export const createBillingGroupSchema = z.object({
  name: z
    .string({ message: 'Nome do grupo é obrigatório.' })
    .trim()
    .min(2, { message: 'O nome do grupo deve ter pelo menos 2 caracteres.' })
    .max(100, { message: 'O nome do grupo deve ter no máximo 100 caracteres.' }),
});

export const inviteGroupMemberSchema = z.object({
  email: z
    .string({ message: 'E-mail é obrigatório.' })
    .trim()
    .toLowerCase()
    .email({ message: 'E-mail inválido.' }),
});

export const resendGroupInvitationSchema = z.object({
  invitationId: z
    .string({ message: 'ID do convite é obrigatório.' })
    .uuid({ message: 'ID do convite inválido.' }),
});

export const revokeGroupInvitationSchema = z.object({
  invitationId: z
    .string({ message: 'ID do convite é obrigatório.' })
    .uuid({ message: 'ID do convite inválido.' }),
});

export const acceptGroupInvitationSchema = z.object({
  token: z
    .string({ message: 'Token do convite é obrigatório.' })
    .min(10, { message: 'Token de convite inválido.' }),
});

export const declineGroupInvitationSchema = z.object({
  token: z
    .string({ message: 'Token do convite é obrigatório.' })
    .min(10, { message: 'Token de convite inválido.' }),
});

export const removeGroupMemberSchema = z.object({
  memberUserId: z
    .string({ message: 'ID do membro é obrigatório.' })
    .uuid({ message: 'ID do membro inválido.' }),
});

export type CreateBillingGroupInput = z.infer<typeof createBillingGroupSchema>;
export type InviteGroupMemberInput = z.infer<typeof inviteGroupMemberSchema>;
export type ResendGroupInvitationInput = z.infer<typeof resendGroupInvitationSchema>;
export type RevokeGroupInvitationInput = z.infer<typeof revokeGroupInvitationSchema>;
export type AcceptGroupInvitationInput = z.infer<typeof acceptGroupInvitationSchema>;
export type DeclineGroupInvitationInput = z.infer<typeof declineGroupInvitationSchema>;
export type RemoveGroupMemberInput = z.infer<typeof removeGroupMemberSchema>;
