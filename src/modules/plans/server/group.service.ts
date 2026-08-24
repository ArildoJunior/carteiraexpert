import crypto from 'node:crypto';
import { eq, and, desc, sql, count, gte, inArray, isNull } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { users } from '../../../lib/db/schema/identity';
import { commercialPlans } from '../../../lib/db/schema/plans';
import { billingSubscriptions } from '../../../lib/db/schema/billing';
import { billingGroups, billingGroupMembers, billingGroupInvitations } from '../../../lib/db/schema/groups';
import { insertAuditLog } from '../../../lib/db/audit';
import { applyPlanDowngradeInTransaction } from './plan.service';
import type { SafeUser } from '../../identity/domain/user.types';
import type {
  BillingGroup,
  BillingGroupMember,
  BillingGroupInvitation,
  BillingGroupOverview,
  GroupRole,
  GroupStatus,
  GroupMemberStatus,
  GroupInvitationStatus,
} from '../domain/group.types';
import {
  GroupCapacityExceededError,
  GroupNotEligibleError,
  GroupNotFoundError,
  GroupInvitationNotFoundError,
  GroupInvitationExpiredError,
  GroupInvitationInvalidError,
  GroupInviteRateLimitExceededError,
  UserAlreadyInGroupError,
  EmailMismatchError,
  UnauthorizedGroupOperationError,
} from '../domain/errors';

/**
 * Calcula o hash SHA-256 de um token em texto puro.
 */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mapeia linha de billing_groups para entidade de domínio.
 */
function mapBillingGroupRow(row: typeof billingGroups.$inferSelect): BillingGroup {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    subscriptionId: row.subscriptionId,
    planId: row.planId as 'shared' | 'free' | 'pro',
    name: row.name,
    maxMembers: row.maxMembers,
    status: row.status as GroupStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Cria um grupo compartilhado para um usuário titular com assinatura ativa do plano compartilhado.
 */
export async function createBillingGroup(
  ownerUser: SafeUser,
  groupName: string,
  database: Database = db
): Promise<BillingGroup> {
  const normalizedName = groupName.trim();

  return await database.transaction(async (tx) => {
    // 1. Lock pessimista no usuário titular
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ownerUser.id))
      .for('update');

    // 2. Valida elegibilidade: deve possuir assinatura ativa ou trialing do plano 'shared'
    const [activeSharedSub] = await tx
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, ownerUser.id),
          eq(billingSubscriptions.planId, 'shared'),
          inArray(billingSubscriptions.status, ['active', 'trialing'])
        )
      )
      .limit(1);

    if (!activeSharedSub) {
      throw new GroupNotEligibleError(
        'Apenas usuários com assinatura ativa do Plano Compartilhado podem criar e administrar grupos.'
      );
    }

    // 3. Verifica se já é dono de grupo ativo
    const [existingOwnerGroup] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (existingOwnerGroup) {
      throw new UserAlreadyInGroupError('Você já possui um grupo compartilhado ativo.');
    }

    // 4. Verifica se já é membro ativo em outro grupo
    const [existingMember] = await tx
      .select()
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.userId, ownerUser.id), eq(billingGroupMembers.status, 'active')))
      .limit(1);

    if (existingMember) {
      throw new UserAlreadyInGroupError('Você já possui vínculo ativo com outro grupo compartilhado.');
    }

    // 5. Cria o grupo
    const groupId = crypto.randomUUID();
    const now = new Date();

    const [groupRow] = await tx
      .insert(billingGroups)
      .values({
        id: groupId,
        ownerUserId: ownerUser.id,
        subscriptionId: activeSharedSub.id,
        planId: 'shared',
        name: normalizedName,
        maxMembers: 5,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // 6. Adiciona o titular como membro com papel 'owner'
    const memberId = crypto.randomUUID();
    await tx.insert(billingGroupMembers).values({
      id: memberId,
      groupId,
      userId: ownerUser.id,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_groups',
        recordId: groupId,
        action: 'INSERT',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_creation',
      },
      {
        newValue: {
          id: groupId,
          ownerUserId: ownerUser.id,
          name: normalizedName,
          maxMembers: 5,
        },
      },
      {
        allowlist: ['id', 'ownerUserId', 'name', 'maxMembers'],
        allowedNumbers: ['maxMembers'],
      },
      tx
    );

    return mapBillingGroupRow(groupRow);
  });
}

/**
 * Consulta a visão administrativa consolidada do grupo para exibição em /plans.
 */
export async function getBillingGroupOverview(
  userId: string,
  userEmail: string,
  executor: DbExecutor = db
): Promise<BillingGroupOverview> {
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  // 1. Verifica se o usuário é elegível para criar grupo (tem assinatura do plano compartilhado)
  const [activeSharedSub] = await executor
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.planId, 'shared'),
        inArray(billingSubscriptions.status, ['active', 'trialing'])
      )
    )
    .limit(1);

  // 2. Busca grupo onde o usuário é membro ativo ou titular
  const [membershipRow] = await executor
    .select({
      memberId: billingGroupMembers.id,
      memberRole: billingGroupMembers.role,
      memberStatus: billingGroupMembers.status,
      groupId: billingGroups.id,
      groupName: billingGroups.name,
      groupOwnerUserId: billingGroups.ownerUserId,
      groupStatus: billingGroups.status,
      groupMaxMembers: billingGroups.maxMembers,
      groupPlanId: billingGroups.planId,
    })
    .from(billingGroupMembers)
    .innerJoin(billingGroups, eq(billingGroupMembers.groupId, billingGroups.id))
    .where(
      and(
        eq(billingGroupMembers.userId, userId),
        eq(billingGroupMembers.status, 'active'),
        eq(billingGroups.status, 'active')
      )
    )
    .limit(1);

  // 3. Verifica se existe convite pendente emitido para o e-mail do usuário
  const [pendingInvite] = await executor
    .select({
      id: billingGroupInvitations.id,
      groupId: billingGroupInvitations.groupId,
      groupName: billingGroups.name,
      ownerUserId: billingGroups.ownerUserId,
      invitedEmail: billingGroupInvitations.invitedEmail,
      expiresAt: billingGroupInvitations.expiresAt,
    })
    .from(billingGroupInvitations)
    .innerJoin(billingGroups, eq(billingGroupInvitations.groupId, billingGroups.id))
    .where(
      and(
        eq(billingGroupInvitations.invitedEmail, normalizedUserEmail),
        eq(billingGroupInvitations.status, 'pending'),
        gte(billingGroupInvitations.expiresAt, new Date()),
        eq(billingGroups.status, 'active')
      )
    )
    .orderBy(desc(billingGroupInvitations.createdAt))
    .limit(1);

  let pendingInviteOverview: BillingGroupOverview['pendingInvitationForUser'] = null;
  if (pendingInvite) {
    const [inviterUser] = await executor
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, pendingInvite.ownerUserId))
      .limit(1);

    pendingInviteOverview = {
      id: pendingInvite.id,
      groupId: pendingInvite.groupId,
      groupName: pendingInvite.groupName,
      ownerName: inviterUser?.name ?? 'Titular',
      invitedEmail: pendingInvite.invitedEmail,
      expiresAt: pendingInvite.expiresAt,
    };
  }

  // Se não possui grupo ativo
  if (!membershipRow) {
    return {
      hasGroup: false,
      group: null,
      userRole: null,
      isOwner: false,
      isMember: false,
      isEligibleToCreate: Boolean(activeSharedSub),
      ownerName: null,
      ownerEmail: null,
      members: [],
      invitations: [],
      pendingInvitationForUser: pendingInviteOverview,
    };
  }

  const isOwner = membershipRow.memberRole === 'owner';
  const isMember = membershipRow.memberRole === 'member';

  // Busca dados do titular
  const [ownerUserRow] = await executor
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, membershipRow.groupOwnerUserId))
    .limit(1);

  // Busca membros do grupo
  const memberRows = await executor
    .select({
      id: billingGroupMembers.id,
      userId: billingGroupMembers.userId,
      name: users.name,
      email: users.email,
      role: billingGroupMembers.role,
      status: billingGroupMembers.status,
      joinedAt: billingGroupMembers.joinedAt,
      leftAt: billingGroupMembers.leftAt,
    })
    .from(billingGroupMembers)
    .innerJoin(users, eq(billingGroupMembers.userId, users.id))
    .where(eq(billingGroupMembers.groupId, membershipRow.groupId))
    .orderBy(billingGroupMembers.joinedAt);

  // Busca convites do grupo (apenas visíveis pelo titular)
  let invitationRows: Array<{
    id: string;
    invitedEmail: string;
    status: GroupInvitationStatus;
    expiresAt: Date;
    createdAt: Date;
  }> = [];

  if (isOwner) {
    const invites = await executor
      .select({
        id: billingGroupInvitations.id,
        invitedEmail: billingGroupInvitations.invitedEmail,
        status: billingGroupInvitations.status,
        expiresAt: billingGroupInvitations.expiresAt,
        createdAt: billingGroupInvitations.createdAt,
      })
      .from(billingGroupInvitations)
      .where(eq(billingGroupInvitations.groupId, membershipRow.groupId))
      .orderBy(desc(billingGroupInvitations.createdAt));

    invitationRows = invites.map((inv) => ({
      id: inv.id,
      invitedEmail: inv.invitedEmail,
      status: inv.status as GroupInvitationStatus,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  const activeMembersCount = memberRows.filter((m) => m.status === 'active').length;
  const pendingInvitesCount = invitationRows.filter(
    (inv) => inv.status === 'pending' && inv.expiresAt >= new Date()
  ).length;

  const availableSlots = Math.max(0, membershipRow.groupMaxMembers - activeMembersCount);

  return {
    hasGroup: true,
    group: {
      id: membershipRow.groupId,
      name: membershipRow.groupName,
      ownerUserId: membershipRow.groupOwnerUserId,
      status: membershipRow.groupStatus as GroupStatus,
      maxMembers: membershipRow.groupMaxMembers,
      activeMembersCount,
      pendingInvitesCount,
      availableSlots,
    },
    userRole: membershipRow.memberRole as GroupRole,
    isOwner,
    isMember,
    isEligibleToCreate: Boolean(activeSharedSub),
    ownerName: ownerUserRow?.name ?? null,
    ownerEmail: ownerUserRow?.email ?? null,
    members: memberRows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role as GroupRole,
      status: m.status as GroupMemberStatus,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    })),
    invitations: invitationRows,
    pendingInvitationForUser: pendingInviteOverview,
  };
}

/**
 * Cria e emite um convite de grupo com token de alta entropia.
 * Rate limit: máximo de 5 convites/reenvios por hora por titular.
 */
export async function inviteGroupMember(
  ownerUser: SafeUser,
  email: string,
  database: Database = db
): Promise<{ inviteId: string; inviteToken: string; expiresAt: Date }> {
  const normalizedEmail = email.trim().toLowerCase();

  return await database.transaction(async (tx) => {
    // 1. Lock pessimista no usuário titular
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, ownerUser.id))
      .for('update');

    // 2. Busca grupo ativo do titular
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (!group) {
      throw new GroupNotFoundError('Você não possui um grupo compartilhado ativo.');
    }

    // 3. Rate limit: máx 5 convites por hora criados por este titular
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentInvitesCountRow] = await tx
      .select({ total: count() })
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.invitedByUserId, ownerUser.id),
          gte(billingGroupInvitations.createdAt, oneHourAgo)
        )
      );

    const recentInvites = Number(recentInvitesCountRow?.total ?? 0);
    if (recentInvites >= 5) {
      throw new GroupInviteRateLimitExceededError();
    }

    // 4. Lock pessimista no grupo
    await tx
      .select({ id: billingGroups.id })
      .from(billingGroups)
      .where(eq(billingGroups.id, group.id))
      .for('update');

    // 5. Validação de capacidade
    const [activeMembersCountRow] = await tx
      .select({ total: count() })
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.groupId, group.id), eq(billingGroupMembers.status, 'active')));

    const activeMembersCount = Number(activeMembersCountRow?.total ?? 0);

    const [pendingInvitesCountRow] = await tx
      .select({ total: count() })
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.groupId, group.id),
          eq(billingGroupInvitations.status, 'pending'),
          gte(billingGroupInvitations.expiresAt, new Date())
        )
      );

    const pendingInvitesCount = Number(pendingInvitesCountRow?.total ?? 0);

    if (activeMembersCount + pendingInvitesCount >= group.maxMembers) {
      throw new GroupCapacityExceededError();
    }

    // 6. Verifica se o e-mail já possui convite pendente neste grupo
    const [existingPendingInvite] = await tx
      .select()
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.groupId, group.id),
          eq(billingGroupInvitations.invitedEmail, normalizedEmail),
          eq(billingGroupInvitations.status, 'pending'),
          gte(billingGroupInvitations.expiresAt, new Date())
        )
      )
      .limit(1);

    if (existingPendingInvite) {
      throw new GroupInvitationInvalidError('Já existe um convite pendente para este endereço de e-mail.');
    }

    // 7. Gera token criptográfico de alta entropia (256 bits)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const inviteId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    await tx.insert(billingGroupInvitations).values({
      id: inviteId,
      groupId: group.id,
      invitedByUserId: ownerUser.id,
      invitedEmail: normalizedEmail,
      tokenHash,
      status: 'pending',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // 8. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_group_invitations',
        recordId: inviteId,
        action: 'INSERT',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_invite_created',
      },
      {
        newValue: {
          id: inviteId,
          groupId: group.id,
          invitedEmail: normalizedEmail,
          expiresAt,
        },
      },
      { allowlist: ['id', 'groupId', 'invitedEmail', 'expiresAt'] },
      tx
    );

    return {
      inviteId,
      inviteToken: rawToken,
      expiresAt,
    };
  });
}

/**
 * Reenvia um convite expirado ou pendente, invalidando o token anterior e gerando um novo.
 */
export async function resendGroupInvitation(
  ownerUser: SafeUser,
  invitationId: string,
  database: Database = db
): Promise<{ inviteId: string; newInviteToken: string; expiresAt: Date }> {
  return await database.transaction(async (tx) => {
    // 1. Rate limit (máx 5 por hora)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentInvitesCountRow] = await tx
      .select({ total: count() })
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.invitedByUserId, ownerUser.id),
          gte(billingGroupInvitations.createdAt, oneHourAgo)
        )
      );

    const recentInvites = Number(recentInvitesCountRow?.total ?? 0);
    if (recentInvites >= 5) {
      throw new GroupInviteRateLimitExceededError();
    }

    // 2. Busca grupo do titular
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (!group) {
      throw new GroupNotFoundError('Você não possui um grupo compartilhado ativo.');
    }

    // 3. Busca o convite original
    const [invitation] = await tx
      .select()
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.id, invitationId),
          eq(billingGroupInvitations.groupId, group.id)
        )
      )
      .limit(1);

    if (!invitation) {
      throw new GroupInvitationNotFoundError();
    }

    // Só permite reenvio de convites pendentes ou expirados
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      throw new GroupInvitationInvalidError('Apenas convites pendentes ou expirados podem ser reenviados.');
    }

    const now = new Date();

    // 4. Invalida o convite anterior
    await tx
      .update(billingGroupInvitations)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(billingGroupInvitations.id, invitation.id));

    // 5. Cria novo convite
    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = hashInviteToken(newRawToken);
    const newInviteId = crypto.randomUUID();
    const newExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await tx.insert(billingGroupInvitations).values({
      id: newInviteId,
      groupId: group.id,
      invitedByUserId: ownerUser.id,
      invitedEmail: invitation.invitedEmail,
      tokenHash: newTokenHash,
      status: 'pending',
      expiresAt: newExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_group_invitations',
        recordId: newInviteId,
        action: 'INSERT',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_invite_resent',
      },
      {
        oldValue: { previousInviteId: invitation.id, previousStatus: invitation.status },
        newValue: { id: newInviteId, invitedEmail: invitation.invitedEmail, expiresAt: newExpiresAt },
      },
      { allowlist: ['id', 'invitedEmail', 'expiresAt', 'previousInviteId', 'previousStatus'] },
      tx
    );

    return {
      inviteId: newInviteId,
      newInviteToken: newRawToken,
      expiresAt: newExpiresAt,
    };
  });
}

/**
 * Revoga um convite pendente.
 */
export async function revokeGroupInvitation(
  ownerUser: SafeUser,
  invitationId: string,
  database: Database = db
): Promise<void> {
  await database.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (!group) {
      throw new GroupNotFoundError('Você não possui um grupo compartilhado ativo.');
    }

    const [invitation] = await tx
      .select()
      .from(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.id, invitationId),
          eq(billingGroupInvitations.groupId, group.id)
        )
      )
      .limit(1);

    if (!invitation) {
      throw new GroupInvitationNotFoundError();
    }

    if (invitation.status !== 'pending') {
      throw new GroupInvitationInvalidError('Apenas convites pendentes podem ser revogados.');
    }

    const now = new Date();
    await tx
      .update(billingGroupInvitations)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(billingGroupInvitations.id, invitation.id));

    await insertAuditLog(
      {
        tableName: 'billing_group_invitations',
        recordId: invitation.id,
        action: 'UPDATE',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_invite_revoked',
      },
      {
        oldValue: { status: 'pending' },
        newValue: { status: 'revoked' },
      },
      { allowlist: ['status'] },
      tx
    );
  });
}

/**
 * Aceita um convite de grupo de forma atômica e com lock pessimista.
 */
export async function acceptGroupInvitation(
  authenticatedUser: SafeUser,
  token: string,
  database: Database = db
): Promise<void> {
  if (!token || typeof token !== 'string') {
    throw new GroupInvitationNotFoundError();
  }

  const tokenHash = hashInviteToken(token.trim());

  await database.transaction(async (tx) => {
    // 1. Lock pessimista no usuário autenticado
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, authenticatedUser.id))
      .for('update');

    // 2. Busca o convite com lock
    const [invitation] = await tx
      .select()
      .from(billingGroupInvitations)
      .where(eq(billingGroupInvitations.tokenHash, tokenHash))
      .for('update');

    if (!invitation) {
      throw new GroupInvitationNotFoundError();
    }

    if (invitation.status !== 'pending') {
      throw new GroupInvitationInvalidError();
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      await tx
        .update(billingGroupInvitations)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(billingGroupInvitations.id, invitation.id));
      throw new GroupInvitationExpiredError();
    }

    // 3. Validação estrita de e-mail (ADR-004)
    if (authenticatedUser.email.trim().toLowerCase() !== invitation.invitedEmail.trim().toLowerCase()) {
      throw new EmailMismatchError();
    }

    // 4. Valida se o usuário já possui vínculo ativo com algum grupo
    const [existingMembership] = await tx
      .select()
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.userId, authenticatedUser.id), eq(billingGroupMembers.status, 'active')))
      .limit(1);

    if (existingMembership) {
      throw new UserAlreadyInGroupError();
    }

    // 5. Lock pessimista no grupo
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.id, invitation.groupId), eq(billingGroups.status, 'active')))
      .for('update');

    if (!group) {
      throw new GroupNotFoundError('O grupo compartilhado associado a este convite não está mais ativo.');
    }

    // 6. Validação de capacidade sob lock
    const [activeMembersCountRow] = await tx
      .select({ total: count() })
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.groupId, group.id), eq(billingGroupMembers.status, 'active')));

    const activeMembersCount = Number(activeMembersCountRow?.total ?? 0);
    if (activeMembersCount >= group.maxMembers) {
      throw new GroupCapacityExceededError();
    }

    // 7. Atualiza convite para accepted
    await tx
      .update(billingGroupInvitations)
      .set({
        status: 'accepted',
        acceptedByUserId: authenticatedUser.id,
        acceptedAt: now,
        updatedAt: now,
      })
      .where(eq(billingGroupInvitations.id, invitation.id));

    // 8. Cria registro de membro
    const memberId = crypto.randomUUID();
    await tx.insert(billingGroupMembers).values({
      id: memberId,
      groupId: group.id,
      userId: authenticatedUser.id,
      role: 'member',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 9. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_group_invitations',
        recordId: invitation.id,
        action: 'UPDATE',
        actorId: authenticatedUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_invite_accepted',
      },
      {
        oldValue: { status: 'pending' },
        newValue: { status: 'accepted', acceptedByUserId: authenticatedUser.id },
      },
      { allowlist: ['status', 'acceptedByUserId'] },
      tx
    );
  });
}

/**
 * Recusa um convite de grupo.
 */
export async function declineGroupInvitation(
  authenticatedUser: SafeUser,
  token: string,
  database: Database = db
): Promise<void> {
  if (!token || typeof token !== 'string') {
    throw new GroupInvitationNotFoundError();
  }

  const tokenHash = hashInviteToken(token.trim());

  await database.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(billingGroupInvitations)
      .where(eq(billingGroupInvitations.tokenHash, tokenHash))
      .for('update');

    if (!invitation) {
      throw new GroupInvitationNotFoundError();
    }

    if (invitation.status !== 'pending') {
      throw new GroupInvitationInvalidError();
    }

    if (authenticatedUser.email.trim().toLowerCase() !== invitation.invitedEmail.trim().toLowerCase()) {
      throw new EmailMismatchError();
    }

    const now = new Date();
    await tx
      .update(billingGroupInvitations)
      .set({
        status: 'declined',
        updatedAt: now,
      })
      .where(eq(billingGroupInvitations.id, invitation.id));

    await insertAuditLog(
      {
        tableName: 'billing_group_invitations',
        recordId: invitation.id,
        action: 'UPDATE',
        actorId: authenticatedUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_invite_declined',
      },
      {
        oldValue: { status: 'pending' },
        newValue: { status: 'declined' },
      },
      { allowlist: ['status'] },
      tx
    );
  });
}

/**
 * Remove um membro do grupo pelo titular.
 * Dispara rebaixamento transacional ao Free e congelamento de carteiras se o membro não possuir Pro próprio.
 */
export async function removeGroupMember(
  ownerUser: SafeUser,
  memberUserId: string,
  database: Database = db
): Promise<void> {
  if (ownerUser.id === memberUserId) {
    throw new UnauthorizedGroupOperationError('O titular não pode remover a si mesmo do grupo. Para sair, dissolva o grupo.');
  }

  await database.transaction(async (tx) => {
    // 1. Busca grupo do titular
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (!group) {
      throw new GroupNotFoundError('Você não possui um grupo compartilhado ativo.');
    }

    // 2. Busca membro ativo no grupo
    const [member] = await tx
      .select()
      .from(billingGroupMembers)
      .where(
        and(
          eq(billingGroupMembers.groupId, group.id),
          eq(billingGroupMembers.userId, memberUserId),
          eq(billingGroupMembers.status, 'active')
        )
      )
      .limit(1);

    if (!member) {
      throw new UnauthorizedGroupOperationError('Membro não encontrado no grupo.');
    }

    const now = new Date();

    // 3. Atualiza vínculo para inativo
    await tx
      .update(billingGroupMembers)
      .set({
        status: 'inactive',
        leftAt: now,
        leftReason: 'removed_by_owner',
        updatedAt: now,
      })
      .where(eq(billingGroupMembers.id, member.id));

    // 4. Precedência: verifica se o membro possui assinatura Pro própria
    const [memberProSub] = await tx
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, memberUserId),
          eq(billingSubscriptions.planId, 'pro'),
          inArray(billingSubscriptions.status, ['active', 'trialing'])
        )
      )
      .limit(1);

    // Se não possui Pro próprio, rebaixa para o Free e congela excedentes
    if (!memberProSub) {
      await applyPlanDowngradeInTransaction(memberUserId, undefined, tx);
    }

    // 5. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_group_members',
        recordId: member.id,
        action: 'UPDATE',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_member_removed',
      },
      {
        oldValue: { status: 'active' },
        newValue: { status: 'inactive', leftReason: 'removed_by_owner' },
      },
      { allowlist: ['status', 'leftReason'] },
      tx
    );
  });
}

/**
 * Saída voluntária de um membro do grupo.
 * Dispara rebaixamento imediato e congelamento de excedentes se não possuir Pro próprio.
 */
export async function leaveBillingGroup(
  memberUser: SafeUser,
  database: Database = db
): Promise<void> {
  await database.transaction(async (tx) => {
    // 1. Busca associação ativa de membro
    const [member] = await tx
      .select()
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.userId, memberUser.id), eq(billingGroupMembers.status, 'active')))
      .limit(1);

    if (!member) {
      throw new UnauthorizedGroupOperationError('Você não pertence a nenhum grupo compartilhado ativo.');
    }

    if (member.role === 'owner') {
      throw new UnauthorizedGroupOperationError(
        'O titular não pode sair do grupo. Para encerrar o grupo, utilize a opção Dissolver Grupo.'
      );
    }

    const now = new Date();

    // 2. Marca como inativo
    await tx
      .update(billingGroupMembers)
      .set({
        status: 'inactive',
        leftAt: now,
        leftReason: 'voluntary',
        updatedAt: now,
      })
      .where(eq(billingGroupMembers.id, member.id));

    // 3. Precedência: verifica se possui Pro próprio
    const [memberProSub] = await tx
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, memberUser.id),
          eq(billingSubscriptions.planId, 'pro'),
          inArray(billingSubscriptions.status, ['active', 'trialing'])
        )
      )
      .limit(1);

    if (!memberProSub) {
      await applyPlanDowngradeInTransaction(memberUser.id, undefined, tx);
    }

    // 4. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_group_members',
        recordId: member.id,
        action: 'UPDATE',
        actorId: memberUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_member_left',
      },
      {
        oldValue: { status: 'active' },
        newValue: { status: 'inactive', leftReason: 'voluntary' },
      },
      { allowlist: ['status', 'leftReason'] },
      tx
    );
  });
}

/**
 * Dissolve o grupo compartilhado pelo titular.
 * Aplica downgrade em cascata e congelamento de excedentes para todos os membros sem Pro próprio.
 */
export async function dissolveBillingGroup(
  ownerUser: SafeUser,
  database: Database = db
): Promise<void> {
  await database.transaction(async (tx) => {
    // 1. Busca grupo do titular
    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, ownerUser.id), eq(billingGroups.status, 'active')))
      .limit(1);

    if (!group) {
      throw new GroupNotFoundError('Você não possui um grupo compartilhado ativo para dissolver.');
    }

    const now = new Date();

    // 2. Marca grupo como cancelado/dissolvido
    await tx
      .update(billingGroups)
      .set({
        status: 'cancelled',
        updatedAt: now,
      })
      .where(eq(billingGroups.id, group.id));

    // 3. Busca todos os membros ativos
    const activeMembers = await tx
      .select()
      .from(billingGroupMembers)
      .where(and(eq(billingGroupMembers.groupId, group.id), eq(billingGroupMembers.status, 'active')));

    // 4. Marca todos os membros como inativos
    await tx
      .update(billingGroupMembers)
      .set({
        status: 'inactive',
        leftAt: now,
        leftReason: 'group_dissolved',
        updatedAt: now,
      })
      .where(and(eq(billingGroupMembers.groupId, group.id), eq(billingGroupMembers.status, 'active')));

    // 5. Revoga convites pendentes
    await tx
      .update(billingGroupInvitations)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(and(eq(billingGroupInvitations.groupId, group.id), eq(billingGroupInvitations.status, 'pending')));

    // 6. Downgrade em cascata para membros (exceto titular que possui a assinatura)
    for (const m of activeMembers) {
      if (m.userId === ownerUser.id) continue;

      const [memberProSub] = await tx
        .select()
        .from(billingSubscriptions)
        .where(
          and(
            eq(billingSubscriptions.userId, m.userId),
            eq(billingSubscriptions.planId, 'pro'),
            inArray(billingSubscriptions.status, ['active', 'trialing'])
          )
        )
        .limit(1);

      if (!memberProSub) {
        await applyPlanDowngradeInTransaction(m.userId, undefined, tx);
      }
    }

    // 7. Auditoria
    await insertAuditLog(
      {
        tableName: 'billing_groups',
        recordId: group.id,
        action: 'UPDATE',
        actorId: ownerUser.id,
        actorType: 'user',
        source: 'manual',
        reason: 'group_dissolved',
      },
      {
        oldValue: { status: 'active' },
        newValue: { status: 'cancelled' },
      },
      { allowlist: ['status'] },
      tx
    );
  });
}

/**
 * Rotina transacional de suspensão de grupo por inadimplência ou cancelamento da assinatura do titular.
 */
export async function applyGroupSuspensionInTransaction(
  groupId: string,
  reason: string,
  tx: DatabaseTransaction
): Promise<void> {
  const [group] = await tx
    .select()
    .from(billingGroups)
    .where(eq(billingGroups.id, groupId))
    .limit(1);

  if (!group || group.status === 'suspended' || group.status === 'cancelled') {
    return;
  }

  const now = new Date();

  // 1. Suspende o grupo
  await tx
    .update(billingGroups)
    .set({
      status: 'suspended',
      updatedAt: now,
    })
    .where(eq(billingGroups.id, groupId));

  // 2. Busca membros ativos
  const activeMembers = await tx
    .select()
    .from(billingGroupMembers)
    .where(and(eq(billingGroupMembers.groupId, groupId), eq(billingGroupMembers.status, 'active')));

  // 3. Marca membros como inativos por suspensão
  await tx
    .update(billingGroupMembers)
    .set({
      status: 'inactive',
      leftAt: now,
      leftReason: 'group_suspended',
      updatedAt: now,
    })
    .where(and(eq(billingGroupMembers.groupId, groupId), eq(billingGroupMembers.status, 'active')));

  // 4. Revoga convites pendentes
  await tx
    .update(billingGroupInvitations)
    .set({
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    })
    .where(and(eq(billingGroupInvitations.groupId, groupId), eq(billingGroupInvitations.status, 'pending')));

  // 5. Downgrade dos membros
  for (const m of activeMembers) {
    const [memberProSub] = await tx
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, m.userId),
          eq(billingSubscriptions.planId, 'pro'),
          inArray(billingSubscriptions.status, ['active', 'trialing'])
        )
      )
      .limit(1);

    if (!memberProSub) {
      await applyPlanDowngradeInTransaction(m.userId, undefined, tx);
    }
  }

  // 6. Auditoria
  await insertAuditLog(
    {
      tableName: 'billing_groups',
      recordId: groupId,
      action: 'UPDATE',
      actorId: group.ownerUserId,
      actorType: 'system',
      source: 'manual',
      reason,
    },
    {
      oldValue: { status: group.status },
      newValue: { status: 'suspended', reason },
    },
    { allowlist: ['status', 'reason'] },
    tx
  );
}
