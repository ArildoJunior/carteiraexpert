'use server';

import { requireAuth } from '../../identity/server/current-user';
import {
  createBillingGroup,
  getBillingGroupOverview,
  inviteGroupMember,
  resendGroupInvitation,
  revokeGroupInvitation,
  acceptGroupInvitation,
  declineGroupInvitation,
  removeGroupMember,
  leaveBillingGroup,
  dissolveBillingGroup,
} from './group.service';
import {
  createBillingGroupSchema,
  inviteGroupMemberSchema,
  resendGroupInvitationSchema,
  revokeGroupInvitationSchema,
  acceptGroupInvitationSchema,
  declineGroupInvitationSchema,
  removeGroupMemberSchema,
  type CreateBillingGroupInput,
  type InviteGroupMemberInput,
  type ResendGroupInvitationInput,
  type RevokeGroupInvitationInput,
  type AcceptGroupInvitationInput,
  type DeclineGroupInvitationInput,
  type RemoveGroupMemberInput,
} from '../domain/group.schema';
import type { BillingGroupOverview, BillingGroup } from '../domain/group.types';

export interface GroupActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Consulta a visão consolidada do grupo para o usuário autenticado.
 */
export async function getBillingGroupOverviewAction(): Promise<
  GroupActionResult<BillingGroupOverview>
> {
  try {
    const user = await requireAuth();
    const overview = await getBillingGroupOverview(user.id, user.email);
    return { success: true, data: overview };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao consultar informações do grupo.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Cria um grupo compartilhado para o usuário titular autenticado.
 */
export async function createBillingGroupAction(
  input: CreateBillingGroupInput
): Promise<GroupActionResult<BillingGroup>> {
  try {
    const user = await requireAuth();
    const validated = createBillingGroupSchema.parse(input);
    const group = await createBillingGroup(user, validated.name);
    return { success: true, data: group };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao criar grupo compartilhado.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Emite um convite de grupo para um e-mail.
 */
export async function inviteGroupMemberAction(
  input: InviteGroupMemberInput
): Promise<
  GroupActionResult<{ inviteId: string; inviteToken: string; expiresAt: Date }>
> {
  try {
    const user = await requireAuth();
    const validated = inviteGroupMemberSchema.parse(input);
    const result = await inviteGroupMember(user, validated.email);
    return { success: true, data: result };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao emitir convite para o grupo.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Reenvia um convite expirado ou pendente.
 */
export async function resendGroupInvitationAction(
  input: ResendGroupInvitationInput
): Promise<
  GroupActionResult<{ inviteId: string; newInviteToken: string; expiresAt: Date }>
> {
  try {
    const user = await requireAuth();
    const validated = resendGroupInvitationSchema.parse(input);
    const result = await resendGroupInvitation(user, validated.invitationId);
    return { success: true, data: result };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao reenviar convite.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Revoga um convite pendente.
 */
export async function revokeGroupInvitationAction(
  input: RevokeGroupInvitationInput
): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    const validated = revokeGroupInvitationSchema.parse(input);
    await revokeGroupInvitation(user, validated.invitationId);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao revogar convite.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Aceita um convite de grupo.
 */
export async function acceptGroupInvitationAction(
  input: AcceptGroupInvitationInput
): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    const validated = acceptGroupInvitationSchema.parse(input);
    await acceptGroupInvitation(user, validated.token);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao aceitar convite de grupo.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Recusa um convite de grupo.
 */
export async function declineGroupInvitationAction(
  input: DeclineGroupInvitationInput
): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    const validated = declineGroupInvitationSchema.parse(input);
    await declineGroupInvitation(user, validated.token);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao recusar convite de grupo.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Remove um membro do grupo.
 */
export async function removeGroupMemberAction(
  input: RemoveGroupMemberInput
): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    const validated = removeGroupMemberSchema.parse(input);
    await removeGroupMember(user, validated.memberUserId);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao remover membro do grupo.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Saída voluntária do grupo pelo membro.
 */
export async function leaveBillingGroupAction(): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    await leaveBillingGroup(user);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao deixar grupo compartilhado.';
    return { success: false, error: errorMsg };
  }
}

/**
 * Dissolve o grupo compartilhado pelo titular.
 */
export async function dissolveBillingGroupAction(): Promise<GroupActionResult<void>> {
  try {
    const user = await requireAuth();
    await dissolveBillingGroup(user);
    return { success: true };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Falha ao dissolver grupo compartilhado.';
    return { success: false, error: errorMsg };
  }
}
