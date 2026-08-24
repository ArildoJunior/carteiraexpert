import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  check,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { commercialPlans } from './plans';
import { billingSubscriptions } from './billing';

// ─── 1. billing_groups ────────────────────────────────────────────────────────
// Entidade raiz do grupo compartilhado vinculado exclusivamente à assinatura do titular pagante.
export const billingGroups = pgTable(
  'billing_groups',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .unique('uq_billing_groups_owner_user_id')
      .references(() => users.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id')
      .references(() => billingSubscriptions.id, { onDelete: 'set null' }),
    planId: text('plan_id')
      .notNull()
      .references(() => commercialPlans.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    maxMembers: integer('max_members').notNull().default(5),
    // 'active' | 'suspended' | 'cancelled'
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('chk_billing_groups_max_members', sql`${table.maxMembers} = 5`),
    check('chk_billing_groups_status', sql`${table.status} IN ('active', 'suspended', 'cancelled')`),
    index('idx_billing_groups_owner_user_id').on(table.ownerUserId),
    index('idx_billing_groups_subscription_id').on(table.subscriptionId),
  ]
);

// ─── 2. billing_group_members ──────────────────────────────────────────────────
// Membros ativos e históricos associados ao grupo compartilhado.
export const billingGroupMembers = pgTable(
  'billing_group_members',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => billingGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // 'owner' | 'member'
    role: text('role').notNull().default('member'),
    // 'active' | 'inactive'
    status: text('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    // 'voluntary' | 'removed_by_owner' | 'group_suspended' | 'owner_downgraded' | 'group_dissolved'
    leftReason: text('left_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('chk_group_members_role', sql`${table.role} IN ('owner', 'member')`),
    check('chk_group_members_status', sql`${table.status} IN ('active', 'inactive')`),
    // Impede que um mesmo usuário pertença a mais de um grupo ativo simultaneamente
    uniqueIndex('uq_active_user_group_membership')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index('idx_group_members_group_id').on(table.groupId),
    index('idx_group_members_user_id').on(table.userId),
  ]
);

// ─── 3. billing_group_invitations ──────────────────────────────────────────────
// Ciclo de vida efêmero e rastreável de convites emitidos para e-mails.
export const billingGroupInvitations = pgTable(
  'billing_group_invitations',
  {
    id: uuid('id').primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => billingGroups.id, { onDelete: 'cascade' }),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    invitedEmail: text('invited_email').notNull(),
    // Armazena exclusivamente o hash SHA-256 do token
    tokenHash: text('token_hash').notNull().unique('uq_group_invitations_token_hash'),
    // 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedByUserId: uuid('accepted_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('chk_group_invitations_status', sql`${table.status} IN ('pending', 'accepted', 'declined', 'revoked', 'expired')`),
    // Garante que não haja múltiplos convites pendentes para o mesmo e-mail no mesmo grupo
    uniqueIndex('uq_pending_group_invite_email')
      .on(table.groupId, table.invitedEmail)
      .where(sql`${table.status} = 'pending'`),
    index('idx_group_invitations_group_id').on(table.groupId),
    index('idx_group_invitations_invited_email').on(table.invitedEmail),
    index('idx_group_invitations_token_hash').on(table.tokenHash),
  ]
);
