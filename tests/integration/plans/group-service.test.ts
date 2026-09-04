import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios } from '../../../src/lib/db/schema/portfolio';
import { commercialPlans, userPlans } from '../../../src/lib/db/schema/plans';
import { billingSubscriptions } from '../../../src/lib/db/schema/billing';
import {
  billingGroups,
  billingGroupMembers,
  billingGroupInvitations,
} from '../../../src/lib/db/schema/groups';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import {
  createPortfolio,
  getPortfolioById,
  listPortfolios,
} from '../../../src/modules/portfolio/server/portfolio.service';
import {
  getUserEffectivePlan,
  getPlanQuotaSummary,
} from '../../../src/modules/plans/server/plan.service';
import {
  createBillingGroup,
  inviteGroupMember,
  resendGroupInvitation,
  revokeGroupInvitation,
  acceptGroupInvitation,
  declineGroupInvitation,
  removeGroupMember,
  leaveBillingGroup,
  dissolveBillingGroup,
  getBillingGroupOverview,
  hashInviteToken,
} from '../../../src/modules/plans/server/group.service';
import {
  synchronizeUserPlanFromSubscriptionInTransaction,
} from '../../../src/modules/billing/server/billing.service';
import {
  GroupNotEligibleError,
  GroupCapacityExceededError,
  GroupInvitationNotFoundError,
  GroupInvitationInvalidError,
  GroupInviteRateLimitExceededError,
  GroupOwnerCannotLeaveError,
  UserAlreadyInGroupError,
  EmailMismatchError,
  PlanLimitExceededError,
} from '../../../src/modules/plans/domain/errors';

describe('Integração: Grupos Compartilhados, Assinatura Shared e Isolamento Multitenant (ADR-004)', () => {
  const freeUserId = crypto.randomUUID();
  const proUserId = crypto.randomUUID();
  const sharedOwnerId = crypto.randomUUID();
  const member1Id = crypto.randomUUID();
  const member2Id = crypto.randomUUID();
  const member3Id = crypto.randomUUID();
  const member4Id = crypto.randomUUID();
  const extraMemberId = crypto.randomUUID();

  let freeUser: SafeUser;
  let proUser: SafeUser;
  let sharedOwner: SafeUser;
  let member1: SafeUser;
  let member2: SafeUser;
  let member3: SafeUser;
  let member4: SafeUser;
  let extraMember: SafeUser;

  const createdPortfolioIds: string[] = [];
  let sharedSubscriptionId: string;

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria usuários no banco de testes
    const usersToInsert = [
      { id: freeUserId, email: `free_${Date.now()}@test.com`, name: 'Free User' },
      { id: proUserId, email: `pro_${Date.now()}@test.com`, name: 'Pro User' },
      { id: sharedOwnerId, email: `owner_${Date.now()}@test.com`, name: 'Shared Owner' },
      { id: member1Id, email: `member1_${Date.now()}@test.com`, name: 'Member One' },
      { id: member2Id, email: `member2_${Date.now()}@test.com`, name: 'Member Two' },
      { id: member3Id, email: `member3_${Date.now()}@test.com`, name: 'Member Three' },
      { id: member4Id, email: `member4_${Date.now()}@test.com`, name: 'Member Four' },
      { id: extraMemberId, email: `extra_${Date.now()}@test.com`, name: 'Extra Member' },
    ];

    await db.insert(users).values(
      usersToInsert.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        passwordHash: 'dummy_hash',
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      }))
    );

    freeUser = {
      id: freeUserId,
      email: usersToInsert[0].email,
      name: usersToInsert[0].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    proUser = {
      id: proUserId,
      email: usersToInsert[1].email,
      name: usersToInsert[1].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    sharedOwner = {
      id: sharedOwnerId,
      email: usersToInsert[2].email,
      name: usersToInsert[2].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    member1 = {
      id: member1Id,
      email: usersToInsert[3].email,
      name: usersToInsert[3].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    member2 = {
      id: member2Id,
      email: usersToInsert[4].email,
      name: usersToInsert[4].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    member3 = {
      id: member3Id,
      email: usersToInsert[5].email,
      name: usersToInsert[5].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    member4 = {
      id: member4Id,
      email: usersToInsert[6].email,
      name: usersToInsert[6].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    extraMember = {
      id: extraMemberId,
      email: usersToInsert[7].email,
      name: usersToInsert[7].name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Garante o plano 'shared' em commercial_plans com quota indefinida (null)
    await db
      .insert(commercialPlans)
      .values({
        id: 'shared',
        name: 'Plano Compartilhado',
        description: 'Plano comercial compartilhado para até 5 pessoas',
        maxActivePortfolios: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: commercialPlans.id,
        set: {
          maxActivePortfolios: null,
          updatedAt: now,
        },
      });

    // 3. Cria assinatura Pro para proUser
    await db.insert(billingSubscriptions).values({
      id: crypto.randomUUID(),
      userId: proUserId,
      planId: 'pro',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
      cancelAtPeriodEnd: false,
      provider: 'internal',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Cria assinatura Shared para sharedOwner
    sharedSubscriptionId = crypto.randomUUID();
    await db.insert(billingSubscriptions).values({
      id: sharedSubscriptionId,
      userId: sharedOwnerId,
      planId: 'shared',
      status: 'active',
      billingCycle: 'yearly',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 365 * 86400000),
      cancelAtPeriodEnd: false,
      provider: 'internal',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    const allUserIds = [
      freeUserId,
      proUserId,
      sharedOwnerId,
      member1Id,
      member2Id,
      member3Id,
      member4Id,
      extraMemberId,
    ];

    // Limpeza de tabelas em cascata segura
    await db.delete(billingGroupInvitations).execute();
    await db.delete(billingGroupMembers).execute();
    await db.delete(billingGroups).execute();
    await db.delete(billingSubscriptions).where(inArray(billingSubscriptions.userId, allUserIds));
    await db.delete(userPlans).where(inArray(userPlans.userId, allUserIds));
    if (createdPortfolioIds.length > 0) {
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(users).where(inArray(users.id, allUserIds));
  });

  it('1. impede que usuário Free ou Pro individual crie um grupo compartilhado', async () => {
    // Free user
    await expect(createBillingGroup(freeUser, 'Grupo Free Inválido')).rejects.toThrow(
      GroupNotEligibleError
    );

    // Pro individual user (não possui plano shared)
    await expect(createBillingGroup(proUser, 'Grupo Pro Inválido')).rejects.toThrow(
      GroupNotEligibleError
    );
  });

  let createdGroup: any;

  it('2. permite que titular com plano shared ativo crie o grupo compartilhado e se torne owner', async () => {
    createdGroup = await createBillingGroup(sharedOwner, 'Família Investidora');
    expect(createdGroup).toBeDefined();
    expect(createdGroup.name).toBe('Família Investidora');
    expect(createdGroup.ownerUserId).toBe(sharedOwnerId);
    expect(createdGroup.status).toBe('active');
    expect(createdGroup.maxMembers).toBe(5);

    // Membro owner deve constar na tabela
    const members = await db
      .select()
      .from(billingGroupMembers)
      .where(eq(billingGroupMembers.groupId, createdGroup.id));

    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(sharedOwnerId);
    expect(members[0].role).toBe('owner');
    expect(members[0].status).toBe('active');
  });

  it('3. impede que o mesmo titular crie um segundo grupo simultâneo', async () => {
    await expect(createBillingGroup(sharedOwner, 'Segundo Grupo')).rejects.toThrow(
      UserAlreadyInGroupError
    );
  });

  let invite1Token: string;
  let invite1Id: string;

  it('4. emite convite com token criptográfico de alta entropia e armazena apenas hash SHA-256', async () => {
    const res = await inviteGroupMember(sharedOwner, member1.email);
    expect(res.inviteToken).toBeDefined();
    expect(res.inviteToken.length).toBeGreaterThanOrEqual(32);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());

    invite1Token = res.inviteToken;
    invite1Id = res.inviteId;

    // Verifica que o token no banco está hasheado e NÃO em texto puro
    const [invDb] = await db
      .select()
      .from(billingGroupInvitations)
      .where(eq(billingGroupInvitations.id, res.inviteId));

    expect(invDb).toBeDefined();
    expect(invDb.tokenHash).toBe(hashInviteToken(invite1Token));
    expect(invDb.tokenHash).not.toBe(invite1Token);
    expect(invDb.status).toBe('pending');
  });

  it('5. aplica rate limiting de no máximo 5 convites por hora por titular', async () => {
    // Grupo tem 1 membro (owner) e 1 convite pendente (invite1 para member1).
    // Restam 3 vagas de capacidade no grupo.
    // Emite convite 2, 3 e 4
    const inv2 = await inviteGroupMember(sharedOwner, member2.email);
    const inv3 = await inviteGroupMember(sharedOwner, member3.email);
    const inv4 = await inviteGroupMember(sharedOwner, 'temp4@test.com');

    // Revoga inv4 para liberar uma vaga de capacidade sem zerar a contagem de rate limit
    await revokeGroupInvitation(sharedOwner, inv4.inviteId);

    // Emite o 5º convite na hora (atinge o limite de 5)
    await inviteGroupMember(sharedOwner, 'temp5@test.com');

    // O 6º convite dentro de 1 hora deve falhar com rate limit
    await expect(inviteGroupMember(sharedOwner, 'temp6@test.com')).rejects.toThrow(
      GroupInviteRateLimitExceededError
    );

    // Limpa os convites temporários do teste de rate limit
    await db
      .delete(billingGroupInvitations)
      .where(
        and(
          eq(billingGroupInvitations.groupId, createdGroup.id),
          inArray(billingGroupInvitations.invitedEmail, [
            member2.email,
            member3.email,
            'temp4@test.com',
            'temp5@test.com',
          ])
        )
      );
  });

  it('6. permite reenviar convite invalidando o token anterior e gerando novo', async () => {
    // Reenvia convite 1
    // Para contornar o rate limit de 5/hora criado no teste anterior, ajustamos a data dos convites anteriores para > 1h atrás
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(billingGroupInvitations)
      .set({ createdAt: twoHoursAgo })
      .where(eq(billingGroupInvitations.groupId, createdGroup.id));

    const resendRes = await resendGroupInvitation(sharedOwner, invite1Id);
    expect(resendRes.newInviteToken).toBeDefined();
    expect(resendRes.newInviteToken).not.toBe(invite1Token);

    // O token antigo foi revogado e é rejeitado como inválido
    await expect(acceptGroupInvitation(member1, invite1Token)).rejects.toThrow(
      GroupInvitationInvalidError
    );

    // Atualiza token válido para member1
    invite1Token = resendRes.newInviteToken;
  });

  it('7. rejeita aceite de convite por e-mail divergente do convidado', async () => {
    // extraMember tenta aceitar o convite emitido para member1
    await expect(acceptGroupInvitation(extraMember, invite1Token)).rejects.toThrow(
      EmailMismatchError
    );
  });

  it('8. permite aceite de convite pelo destinatário correto e define status shared com quota indefinida (null)', async () => {
    // member1 aceita o convite
    await acceptGroupInvitation(member1, invite1Token);

    // member1 agora possui plano efetivo shared com quota pendente (null)
    const effectivePlan = await getUserEffectivePlan(member1Id);
    expect(effectivePlan.planId).toBe('shared');
    expect(effectivePlan.source).toBe('group');
    expect(effectivePlan.maxActivePortfolios).toBeNull();

    const quotaSummary = await getPlanQuotaSummary(member1Id);
    expect(quotaSummary.planId).toBe('shared');
    expect(quotaSummary.maxActivePortfolios).toBeNull();
    expect(quotaSummary.availableSlots).toBe(0);
    expect(quotaSummary.canCreateMore).toBe(false);

    // Não concede quota operacional enquanto a quota do plano shared estiver indefinida
    await expect(createPortfolio({ name: 'Carteira Bloqueada' }, member1)).rejects.toThrow(
      PlanLimitExceededError
    );
  });

  it('9. garante isolamento estrito de carteiras entre diferentes usuários (ADR-004)', async () => {
    // Free User cria uma carteira (quota 2)
    const freePort = await createPortfolio({ name: 'Carteira do Free User' }, freeUser);
    createdPortfolioIds.push(freePort.id);

    // Pro User cria uma carteira (quota 10)
    const proPort = await createPortfolio({ name: 'Carteira do Pro User' }, proUser);
    createdPortfolioIds.push(proPort.id);

    // 1. Free User não consegue listar nem acessar a carteira do Pro User
    const freePortfolios = await listPortfolios(freeUser);
    expect(freePortfolios.map((p) => p.id)).toContain(freePort.id);
    expect(freePortfolios.map((p) => p.id)).not.toContain(proPort.id);

    await expect(getPortfolioById(proPort.id, freeUser)).rejects.toThrow();

    // 2. Pro User não consegue listar nem acessar a carteira do Free User
    const proPortfolios = await listPortfolios(proUser);
    expect(proPortfolios.map((p) => p.id)).toContain(proPort.id);
    expect(proPortfolios.map((p) => p.id)).not.toContain(freePort.id);

    await expect(getPortfolioById(freePort.id, proUser)).rejects.toThrow();
  });

  it('10. respeita matriz de precedência: assinatura Pro direta (quota 10) prevalece sobre benefício de grupo', async () => {
    // Adiciona proUser ao grupo de forma direta para testar precedência
    await db.insert(billingGroupMembers).values({
      id: crypto.randomUUID(),
      groupId: createdGroup.id,
      userId: proUserId,
      role: 'member',
      status: 'active',
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // proUser possui assinatura Pro direta ativa E benefício de grupo
    // Precedência 1: Assinatura própria direta PRO (quota 10) deve prevalecer
    const effectivePlan = await getUserEffectivePlan(proUserId);
    expect(effectivePlan.planId).toBe('pro');
    expect(effectivePlan.source).toBe('direct');
    expect(effectivePlan.maxActivePortfolios).toBe(10);
  });

  it('11. impede ultrapassar o limite de 5 vagas totais com lock pessimista', async () => {
    // Limpa convites pendentes antigos
    await db
      .delete(billingGroupInvitations)
      .where(eq(billingGroupInvitations.groupId, createdGroup.id));

    // Ajusta timestamp de criação de convites para liberar rate limit
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(billingGroupInvitations)
      .set({ createdAt: twoHoursAgo })
      .where(eq(billingGroupInvitations.groupId, createdGroup.id));

    // Grupo atualmente tem: sharedOwner (1), member1 (2), proUser (3)
    // Adiciona member2 e member3 para atingir 5 membros ativos (limite máximo)
    await db.insert(billingGroupMembers).values([
      {
        id: crypto.randomUUID(),
        groupId: createdGroup.id,
        userId: member2Id,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        groupId: createdGroup.id,
        userId: member3Id,
        role: 'member',
        status: 'active',
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Tentativa de convidar mais alguém com 5 vagas já preenchidas deve falhar por capacidade
    await expect(inviteGroupMember(sharedOwner, member4.email)).rejects.toThrow(
      GroupCapacityExceededError
    );
  });

  it('12. saída voluntária de membro tem efeito imediato e aplica downgrade para Free', async () => {
    // Cria 3 carteiras diretamente no banco para member1
    const port1Id = crypto.randomUUID();
    const port2Id = crypto.randomUUID();
    const port3Id = crypto.randomUUID();
    const now = new Date();

    await db.insert(portfolios).values([
      { id: port1Id, userId: member1Id, name: 'Carteira 1 do Membro', status: 'active', purpose: 'REAL', createdAt: new Date(now.getTime() - 3000), updatedAt: now },
      { id: port2Id, userId: member1Id, name: 'Carteira 2 do Membro', status: 'active', purpose: 'ESTUDO', createdAt: new Date(now.getTime() - 2000), updatedAt: now },
      { id: port3Id, userId: member1Id, name: 'Carteira 3 do Membro', status: 'active', purpose: 'ANALISE', createdAt: new Date(now.getTime() - 1000), updatedAt: now },
    ]);
    createdPortfolioIds.push(port1Id, port2Id, port3Id);

    const beforeLeave = await getPlanQuotaSummary(member1Id);
    expect(beforeLeave.activePortfoliosCount).toBe(3);
    expect(beforeLeave.frozenPortfoliosCount).toBe(0);

    // Membro 1 deixa o grupo voluntariamente
    await leaveBillingGroup(member1);

    // Efeito imediato: volta para Plano Free (quota 2)
    const afterLeave = await getUserEffectivePlan(member1Id);
    expect(afterLeave.planId).toBe('free');
    expect(afterLeave.source).toBe('fallback');
    expect(afterLeave.maxActivePortfolios).toBe(2);

    // Downgrade automático congelou a 3ª carteira excedente
    const quotaAfterLeave = await getPlanQuotaSummary(member1Id);
    expect(quotaAfterLeave.planId).toBe('free');
    expect(quotaAfterLeave.maxActivePortfolios).toBe(2);
    expect(quotaAfterLeave.activePortfoliosCount).toBe(2);
    expect(quotaAfterLeave.frozenPortfoliosCount).toBe(1);
  });

  it('13. titular remove membro do grupo com efeito imediato e congelamento de quotas', async () => {
    // Titular remove member2 do grupo
    await removeGroupMember(sharedOwner, member2Id);

    const member2Plan = await getUserEffectivePlan(member2Id);
    expect(member2Plan.planId).toBe('free');

    const [m2Record] = await db
      .select()
      .from(billingGroupMembers)
      .where(
        and(
          eq(billingGroupMembers.groupId, createdGroup.id),
          eq(billingGroupMembers.userId, member2Id)
        )
      );

    expect(m2Record.status).toBe('inactive');
    expect(m2Record.leftReason).toBe('removed_by_owner');
    expect(m2Record.leftAt).not.toBeNull();
  });

  it('14. dissolução do grupo pelo titular rebaixa todos os membros e cancela o grupo', async () => {
    await dissolveBillingGroup(sharedOwner);

    // Grupo cancelado
    const [groupDb] = await db
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, createdGroup.id));

    expect(groupDb.status).toBe('cancelled');

    // Todos os membros restantes agora são Free (exceto quem tem Pro próprio como proUser)
    const member3Plan = await getUserEffectivePlan(member3Id);
    expect(member3Plan.planId).toBe('free');

    const proUserPlan = await getUserEffectivePlan(proUserId);
    expect(proUserPlan.planId).toBe('pro'); // Pro próprio preservado!
  });

  it('15. suspensão por inadimplência (unpaid) do titular suspende o grupo e rebaixa membros com reativação manual obrigatória', async () => {
    // 1. Cria um novo grupo para testar unpaid
    const secondOwnerId = crypto.randomUUID();
    const secondMemberId = crypto.randomUUID();
    const now = new Date();

    await db.insert(users).values([
      {
        id: secondOwnerId,
        email: `unpaid_owner_${Date.now()}@test.com`,
        name: 'Unpaid Owner',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: secondMemberId,
        email: `unpaid_member_${Date.now()}@test.com`,
        name: 'Unpaid Member',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const secondOwner: SafeUser = {
      id: secondOwnerId,
      email: `unpaid_owner_${Date.now()}@test.com`,
      name: 'Unpaid Owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const secondSubId = crypto.randomUUID();
    const secondSub = {
      id: secondSubId,
      userId: secondOwnerId,
      planId: 'shared' as const,
      status: 'active' as const,
      billingCycle: 'monthly' as const,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
      cancelAtPeriodEnd: false,
      provider: 'internal' as const,
      providerSubscriptionId: null,
      providerCustomerId: null,
      canceledAt: null,
      endedAt: null,
      gracePeriodEndsAt: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(billingSubscriptions).values(secondSub);

    const secondGroup = await createBillingGroup(secondOwner, 'Grupo Unpaid Test');

    // Adiciona secondMemberId como membro ativo
    await db.insert(billingGroupMembers).values({
      id: crypto.randomUUID(),
      groupId: secondGroup.id,
      userId: secondMemberId,
      role: 'member',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    expect((await getUserEffectivePlan(secondMemberId)).planId).toBe('shared');

    // 2. Simula evento de transição da assinatura para 'unpaid'
    await db.transaction(async (tx) => {
      await synchronizeUserPlanFromSubscriptionInTransaction(
        {
          ...secondSub,
          status: 'unpaid',
        },
        tx
      );
    });

    // 3. Grupo foi suspenso e membro foi rebaixado para Free imediatamente
    const [suspendedGroup] = await db
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, secondGroup.id));

    expect(suspendedGroup.status).toBe('suspended');

    const memberAfterUnpaid = await getUserEffectivePlan(secondMemberId);
    expect(memberAfterUnpaid.planId).toBe('free');

    // Limpeza dos usuários temporários de teste
    await db.delete(billingGroupMembers).where(eq(billingGroupMembers.groupId, secondGroup.id));
    await db.delete(billingGroups).where(eq(billingGroups.id, secondGroup.id));
    await db.delete(billingSubscriptions).where(eq(billingSubscriptions.id, secondSubId));
    await db.delete(userPlans).where(eq(userPlans.userId, secondOwnerId));
    await db.delete(users).where(inArray(users.id, [secondOwnerId, secondMemberId]));
  });

  describe('Matriz de Precedência Formal (Pacote 05.04)', () => {
    const testUserId = crypto.randomUUID();
    const otherOwnerId = crypto.randomUUID();
    let testUser: SafeUser;
    let otherOwner: SafeUser;

    beforeAll(async () => {
      const now = new Date();
      await db.insert(users).values([
        {
          id: testUserId,
          email: `precedence_user_${Date.now()}@test.com`,
          name: 'Precedence User',
          passwordHash: 'dummy',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherOwnerId,
          email: `other_owner_${Date.now()}@test.com`,
          name: 'Other Owner',
          passwordHash: 'dummy',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      testUser = {
        id: testUserId,
        email: `precedence_user_${Date.now()}@test.com`,
        name: 'Precedence User',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      otherOwner = {
        id: otherOwnerId,
        email: `other_owner_${Date.now()}@test.com`,
        name: 'Other Owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
    });

    afterAll(async () => {
      await db.delete(billingGroupInvitations).where(eq(billingGroupInvitations.invitedByUserId, otherOwnerId));
      await db.delete(billingGroupMembers).where(inArray(billingGroupMembers.userId, [testUserId, otherOwnerId]));
      await db.delete(billingGroups).where(eq(billingGroups.ownerUserId, otherOwnerId));
      await db.delete(billingSubscriptions).where(inArray(billingSubscriptions.userId, [testUserId, otherOwnerId]));
      await db.delete(userPlans).where(inArray(userPlans.userId, [testUserId, otherOwnerId]));
      await db.delete(users).where(inArray(users.id, [testUserId, otherOwnerId]));
    });

    it('P1. Pro ativo sem Shared: plano efetivo = Pro, quota = 10', async () => {
      const now = new Date();
      await db.insert(billingSubscriptions).values({
        id: crypto.randomUUID(),
        userId: testUserId,
        planId: 'pro',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
        cancelAtPeriodEnd: false,
        provider: 'internal',
        createdAt: now,
        updatedAt: now,
      });

      const effective = await getUserEffectivePlan(testUserId);
      expect(effective.planId).toBe('pro');
      expect(effective.source).toBe('direct');
      expect(effective.maxActivePortfolios).toBe(10);

      const quota = await getPlanQuotaSummary(testUserId);
      expect(quota.planId).toBe('pro');
      expect(quota.maxActivePortfolios).toBe(10);
      expect(quota.availableSlots).toBe(10);
      expect(quota.canCreateMore).toBe(true);
    });

    it('P2. Pro e Shared ativos simultaneamente: Pro sempre prevalece sobre Shared (source = direct, quota = 10)', async () => {
      const now = new Date();
      // Insere assinatura Shared MAIS RECENTE que a Pro
      await db.insert(billingSubscriptions).values({
        id: crypto.randomUUID(),
        userId: testUserId,
        planId: 'shared',
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 86400000),
        cancelAtPeriodEnd: false,
        provider: 'internal',
        createdAt: new Date(now.getTime() + 1000), // Mais recente!
        updatedAt: now,
      });

      // Mesmo com Shared mais recente, PRO DEVE PREVALECER!
      const effective = await getUserEffectivePlan(testUserId);
      expect(effective.planId).toBe('pro');
      expect(effective.source).toBe('direct');
      expect(effective.maxActivePortfolios).toBe(10);

      const quota = await getPlanQuotaSummary(testUserId);
      expect(quota.planId).toBe('pro');
      expect(quota.maxActivePortfolios).toBe(10);
    });

    it('P3. Pro trialing e Shared ativo: Pro prevalece', async () => {
      const now = new Date();
      // Atualiza Pro para trialing
      await db
        .update(billingSubscriptions)
        .set({ status: 'trialing' })
        .where(
          and(
            eq(billingSubscriptions.userId, testUserId),
            eq(billingSubscriptions.planId, 'pro')
          )
        );

      const effective = await getUserEffectivePlan(testUserId);
      expect(effective.planId).toBe('pro');
      expect(effective.source).toBe('direct');
      expect(effective.maxActivePortfolios).toBe(10);
    });

    it('P4. Pro expirado/cancelado e Shared ativo: plano efetivo passa para Shared com quota null', async () => {
      const now = new Date();
      // Atualiza Pro para canceled / expirado
      await db
        .update(billingSubscriptions)
        .set({
          status: 'canceled',
          currentPeriodEnd: new Date(now.getTime() - 1000),
          gracePeriodEndsAt: null,
        })
        .where(
          and(
            eq(billingSubscriptions.userId, testUserId),
            eq(billingSubscriptions.planId, 'pro')
          )
        );

      const effective = await getUserEffectivePlan(testUserId);
      expect(effective.planId).toBe('shared');
      expect(effective.source).toBe('direct');
      expect(effective.maxActivePortfolios).toBeNull();

      const quota = await getPlanQuotaSummary(testUserId);
      expect(quota.planId).toBe('shared');
      expect(quota.maxActivePortfolios).toBeNull();
      expect(quota.availableSlots).toBe(0);
      expect(quota.canCreateMore).toBe(false);
    });

    it('P5. Titular de um grupo ativo é impedido de aceitar convite para outro grupo', async () => {
      // testUser cria seu grupo (é dono)
      const testGroup = await createBillingGroup(testUser, 'Grupo do TestUser');

      // otherOwner possui assinatura shared e cria seu grupo
      const now = new Date();
      await db.insert(billingSubscriptions).values({
        id: crypto.randomUUID(),
        userId: otherOwnerId,
        planId: 'shared',
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 365 * 86400000),
        cancelAtPeriodEnd: false,
        provider: 'internal',
        createdAt: now,
        updatedAt: now,
      });
      const otherGroup = await createBillingGroup(otherOwner, 'Grupo do OtherOwner');

      // otherOwner convida testUser
      const inv = await inviteGroupMember(otherOwner, testUser.email);

      // testUser (já titular de testGroup) tenta aceitar o convite
      await expect(acceptGroupInvitation(testUser, inv.inviteToken)).rejects.toThrow(
        UserAlreadyInGroupError
      );

      // Limpeza dos grupos de teste de titularidade
      await db.delete(billingGroupInvitations).where(eq(billingGroupInvitations.groupId, otherGroup.id));
      await db.delete(billingGroupMembers).where(inArray(billingGroupMembers.groupId, [testGroup.id, otherGroup.id]));
      await db.delete(billingGroups).where(inArray(billingGroups.id, [testGroup.id, otherGroup.id]));
    });
  });
});
