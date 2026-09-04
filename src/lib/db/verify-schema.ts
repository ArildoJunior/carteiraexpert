import type { SQLWrapper } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from './client';

export interface SchemaQueryExecutor {
  execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
    query: SQLWrapper | string
  ): PromiseLike<unknown>;
}

export class SchemaIncompatibilityError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    const formattedMessage = [
      'FATAL: Incompatibilidade detectada entre o schema físico do PostgreSQL e o código da aplicação.',
      'Divergências encontradas:',
      ...errors.map((e) => `  - ${e}`),
      'AÇÃO NECESSÁRIA: Execute as migrações versionadas via "pnpm run db:migrate" em um banco alinhado.',
    ].join('\n');

    super(formattedMessage);
    this.name = 'SchemaIncompatibilityError';
    this.errors = errors;
  }
}

export interface SchemaInspectionResult {
  isValid: boolean;
  errors: string[];
  inspectedTables: string[];
}

export interface ExpectedColumn {
  name: string;
  type: string | string[]; // ex: 'uuid', 'text', 'timestamp with time zone' / 'timestamptz', 'integer' / 'int4', 'jsonb'
  isNullable: boolean;
  hasDefault?: boolean;
}

export interface ExpectedTable {
  name: string;
  columns: ExpectedColumn[];
  primaryKey: string;
  uniqueConstraints?: string[];
  foreignKeys?: {
    column: string;
    foreignTable: string;
    foreignColumn: string;
    deleteRule: string; // 'CASCADE' | 'RESTRICT' | 'NO ACTION'
  }[];
  triggers?: string[];
}

// ─── Matriz Canônica de Definição Esperada do Schema ────────────────────────
export const EXPECTED_SCHEMA_MATRIX: Record<string, ExpectedTable> = {
  audit_logs: {
    name: 'audit_logs',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'table_name', type: 'text', isNullable: false },
      { name: 'record_id', type: 'text', isNullable: false },
      { name: 'action', type: 'text', isNullable: false },
      { name: 'actor_id', type: 'text', isNullable: true },
      { name: 'actor_type', type: 'text', isNullable: true },
      { name: 'correlation_id', type: 'uuid', isNullable: true },
      { name: 'old_value', type: 'jsonb', isNullable: true },
      { name: 'new_value', type: 'jsonb', isNullable: true },
      { name: 'reason', type: 'text', isNullable: true },
      { name: 'source', type: 'text', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  users: {
    name: 'users',
    primaryKey: 'id',
    uniqueConstraints: ['users_email_unique'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'email', type: 'text', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'password_hash', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  sessions: {
    name: 'sessions',
    primaryKey: 'id',
    uniqueConstraints: ['sessions_token_hash_unique'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'token_hash', type: 'text', isNullable: false },
      { name: 'ip_address', type: 'text', isNullable: true },
      { name: 'user_agent', type: 'text', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'expires_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'revoked_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  password_reset_tokens: {
    name: 'password_reset_tokens',
    primaryKey: 'id',
    uniqueConstraints: ['password_reset_tokens_token_hash_unique'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'token_hash', type: 'text', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'expires_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'used_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  auth_rate_limits: {
    name: 'auth_rate_limits',
    primaryKey: 'id',
    uniqueConstraints: ['auth_rate_limits_key_unique'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'key', type: 'text', isNullable: false },
      { name: 'attempts', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'first_attempt_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'blocked_until', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  user_consents: {
    name: 'user_consents',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    triggers: ['enforce_append_only_user_consents'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'consent_type', type: 'text', isNullable: false },
      { name: 'version', type: 'text', isNullable: false },
      { name: 'action', type: 'text', isNullable: false },
      { name: 'ip_address', type: 'text', isNullable: true },
      { name: 'user_agent', type: 'text', isNullable: true },
      { name: 'correlation_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  portfolios: {
    name: 'portfolios',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'description', type: 'text', isNullable: true },
      { name: 'base_currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  assets: {
    name: 'assets',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'ticker', type: 'text', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'asset_type', type: 'text', isNullable: false },
      { name: 'market', type: 'text', isNullable: false, hasDefault: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'is_custom', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'user_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  portfolio_events: {
    name: 'portfolio_events',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'custody_account_id',
        foreignTable: 'custody_accounts',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'asset_id', type: 'uuid', isNullable: false },
      { name: 'type', type: 'text', isNullable: false },
      { name: 'direction', type: 'text', isNullable: true },
      { name: 'trade_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'settlement_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'quantity', type: 'numeric', isNullable: false },
      { name: 'unit_price', type: 'numeric', isNullable: false },
      { name: 'fees', type: 'numeric', isNullable: false, hasDefault: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'source', type: 'text', isNullable: false, hasDefault: true },
      { name: 'custody_account_id', type: 'uuid', isNullable: true },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'cancellation_reason', type: 'text', isNullable: true },
    ],
  },
  subscription_offers: {
    name: 'subscription_offers',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'origin_asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'right_asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'target_asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'origin_asset_id', type: 'uuid', isNullable: false },
      { name: 'right_asset_id', type: 'uuid', isNullable: false },
      { name: 'target_asset_id', type: 'uuid', isNullable: false },
      { name: 'cut_off_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'exercise_start_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'exercise_end_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'exercise_price', type: 'numeric', isNullable: false },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  subscription_rights: {
    name: 'subscription_rights',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'offer_id',
        foreignTable: 'subscription_offers',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'offer_id', type: 'uuid', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'allocated_quantity', type: 'numeric', isNullable: false },
      { name: 'exercised_quantity', type: 'numeric', isNullable: false, hasDefault: true },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'cancellation_reason', type: 'text', isNullable: true },
    ],
  },
  subscription_exercises: {
    name: 'subscription_exercises',
    primaryKey: 'id',
    uniqueConstraints: ['uq_subscription_exercises_idempotency'],
    foreignKeys: [
      {
        column: 'subscription_right_id',
        foreignTable: 'subscription_rights',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'portfolio_event_id',
        foreignTable: 'portfolio_events',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'subscription_right_id', type: 'uuid', isNullable: false },
      { name: 'portfolio_event_id', type: 'uuid', isNullable: false },
      { name: 'idempotency_key', type: 'uuid', isNullable: false },
      { name: 'exercised_quantity', type: 'numeric', isNullable: false },
      { name: 'exercise_price', type: 'numeric', isNullable: false },
      { name: 'fees', type: 'numeric', isNullable: false, hasDefault: true },
      { name: 'total_cost', type: 'numeric', isNullable: false },
      { name: 'exercise_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  market_quotes: {
    name: 'market_quotes',
    primaryKey: 'id',
    uniqueConstraints: ['uq_market_quotes_asset_date'],
    foreignKeys: [
      {
        column: 'asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'asset_id', type: 'uuid', isNullable: false },
      { name: 'price', type: 'numeric', isNullable: false },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'quote_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'source', type: 'text', isNullable: false, hasDefault: true },
      { name: 'delay_status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  exchange_rates: {
    name: 'exchange_rates',
    primaryKey: 'id',
    uniqueConstraints: ['uq_exchange_rates_pair_date'],
    foreignKeys: [
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'from_currency', type: 'text', isNullable: false },
      { name: 'to_currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'rate', type: 'numeric', isNullable: false },
      { name: 'rate_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'source', type: 'text', isNullable: false, hasDefault: true },
      { name: 'delay_status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_by', type: 'uuid', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  commercial_plans: {
    name: 'commercial_plans',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'text', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'description', type: 'text', isNullable: true },
      { name: 'max_active_portfolios', type: ['integer', 'int4'], isNullable: true },
      { name: 'is_active', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  plan_entitlements: {
    name: 'plan_entitlements',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'plan_id',
        foreignTable: 'commercial_plans',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'plan_id', type: 'text', isNullable: false },
      { name: 'feature_code', type: 'text', isNullable: false },
      { name: 'feature_value', type: 'text', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  user_plans: {
    name: 'user_plans',
    primaryKey: 'id',
    uniqueConstraints: ['user_plans_user_id_unique'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'plan_id',
        foreignTable: 'commercial_plans',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'plan_id', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'starts_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'expires_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  billing_subscriptions: {
    name: 'billing_subscriptions',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'plan_id',
        foreignTable: 'commercial_plans',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'plan_id', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'billing_cycle', type: 'text', isNullable: false, hasDefault: true },
      { name: 'current_period_start', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'current_period_end', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'cancel_at_period_end', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'canceled_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'ended_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'grace_period_ends_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'provider', type: 'text', isNullable: false, hasDefault: true },
      { name: 'provider_subscription_id', type: 'text', isNullable: true },
      { name: 'provider_customer_id', type: 'text', isNullable: true },
      { name: 'metadata', type: 'jsonb', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  payment_events: {
    name: 'payment_events',
    primaryKey: 'id',
    uniqueConstraints: ['uq_payment_events_idempotency_key'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'subscription_id',
        foreignTable: 'billing_subscriptions',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'subscription_id', type: 'uuid', isNullable: true },
      { name: 'idempotency_key', type: 'text', isNullable: false },
      { name: 'event_type', type: 'text', isNullable: false },
      { name: 'provider', type: 'text', isNullable: false, hasDefault: true },
      { name: 'provider_event_id', type: 'text', isNullable: true },
      { name: 'amount', type: 'numeric', isNullable: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'payload', type: 'jsonb', isNullable: true },
      { name: 'error_message', type: 'text', isNullable: true },
      { name: 'processed_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  billing_groups: {
    name: 'billing_groups',
    primaryKey: 'id',
    uniqueConstraints: ['uq_billing_groups_owner_user_id'],
    foreignKeys: [
      {
        column: 'owner_user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'subscription_id',
        foreignTable: 'billing_subscriptions',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
      {
        column: 'plan_id',
        foreignTable: 'commercial_plans',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'owner_user_id', type: 'uuid', isNullable: false },
      { name: 'subscription_id', type: 'uuid', isNullable: true },
      { name: 'plan_id', type: 'text', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'max_members', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  billing_group_members: {
    name: 'billing_group_members',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'group_id',
        foreignTable: 'billing_groups',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'group_id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'role', type: 'text', isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'joined_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'left_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'left_reason', type: 'text', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  billing_group_invitations: {
    name: 'billing_group_invitations',
    primaryKey: 'id',
    uniqueConstraints: ['uq_group_invitations_token_hash'],
    foreignKeys: [
      {
        column: 'group_id',
        foreignTable: 'billing_groups',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'invited_by_user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'accepted_by_user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'group_id', type: 'uuid', isNullable: false },
      { name: 'invited_by_user_id', type: 'uuid', isNullable: false },
      { name: 'invited_email', type: 'text', isNullable: false },
      { name: 'token_hash', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'expires_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'accepted_by_user_id', type: 'uuid', isNullable: true },
      { name: 'accepted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'revoked_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  user_chart_preferences: {
    name: 'user_chart_preferences',
    primaryKey: 'id',
    uniqueConstraints: ['uq_user_chart_preferences_user_area'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'chart_area', type: 'text', isNullable: false },
      { name: 'period', type: 'text', isNullable: true },
      { name: 'view_mode', type: 'text', isNullable: true },
      { name: 'grouping_type', type: 'text', isNullable: true },
      { name: 'basis', type: 'text', isNullable: true },
      { name: 'user_tax_preferences', type: 'jsonb', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  import_batches: {
    name: 'import_batches',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'custody_account_id',
        foreignTable: 'custody_accounts',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'file_name', type: 'text', isNullable: false },
      { name: 'file_size', type: ['integer', 'int4'], isNullable: false },
      { name: 'file_format', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'total_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'valid_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'warning_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'error_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'raw_content_hash', type: 'text', isNullable: false },
      { name: 'error_message', type: 'text', isNullable: true },
      { name: 'confirmed_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'custody_account_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  import_batch_items: {
    name: 'import_batch_items',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'batch_id',
        foreignTable: 'import_batches',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'resolved_asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'imported_portfolio_event_id',
        foreignTable: 'portfolio_events',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'batch_id', type: 'uuid', isNullable: false },
      { name: 'line_number', type: ['integer', 'int4'], isNullable: false },
      { name: 'raw_line', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false },
      { name: 'action_type', type: 'text', isNullable: false },
      { name: 'direction', type: 'text', isNullable: true },
      { name: 'raw_ticker', type: 'text', isNullable: false },
      { name: 'resolved_asset_id', type: 'uuid', isNullable: true },
      { name: 'trade_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'settlement_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'quantity', type: 'numeric', isNullable: false },
      { name: 'unit_price', type: 'numeric', isNullable: false },
      { name: 'fees', type: 'numeric', isNullable: false, hasDefault: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'validation_errors', type: 'jsonb', isNullable: false, hasDefault: true },
      { name: 'is_duplicate', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'duplicate_reason', type: 'text', isNullable: true },
      { name: 'is_excluded', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'imported_portfolio_event_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  b3_cotahist_batches: {
    name: 'b3_cotahist_batches',
    primaryKey: 'id',
    uniqueConstraints: ['b3_cotahist_batches_sha256_unique'],
    foreignKeys: [
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'file_name', type: 'text', isNullable: false },
      { name: 'file_type', type: 'text', isNullable: false },
      { name: 'reference_date', type: 'date', isNullable: true },
      { name: 'reference_year', type: ['integer', 'int4'], isNullable: true },
      { name: 'file_size', type: ['integer', 'int4'], isNullable: false },
      { name: 'sha256', type: 'text', isNullable: false },
      { name: 'storage_path', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'parser_name', type: 'text', isNullable: false, hasDefault: true },
      { name: 'parser_version', type: 'text', isNullable: false, hasDefault: true },
      { name: 'received_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'started_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'completed_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'error_message', type: 'text', isNullable: true },
      { name: 'total_lines', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'header_count', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'quote_count', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'trailer_count', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'accepted_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'rejected_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'unknown_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'associated_instruments', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'unassociated_instruments', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'duplicate_records', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'trailer_discrepancy', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'records_read', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'records_accepted', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'records_inserted', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'records_conflicted', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'records_rejected', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'error_count', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'skipped_as_duplicate', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'ingestion_run_id', type: 'uuid', isNullable: true },
      { name: 'created_by', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  b3_historical_quotes: {
    name: 'b3_historical_quotes',
    primaryKey: 'id',
    uniqueConstraints: ['uq_b3_historical_quotes_record_hash'],
    foreignKeys: [
      {
        column: 'batch_id',
        foreignTable: 'b3_cotahist_batches',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'batch_id', type: 'uuid', isNullable: false },
      { name: 'trade_date', type: 'date', isNullable: false },
      { name: 'bdi_code', type: 'text', isNullable: false },
      { name: 'ticker', type: 'text', isNullable: false },
      { name: 'market_type', type: ['integer', 'int4'], isNullable: false },
      { name: 'short_name', type: 'text', isNullable: false },
      { name: 'specification', type: 'text', isNullable: false },
      { name: 'forward_term_days', type: 'text', isNullable: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'open_price', type: 'numeric', isNullable: false },
      { name: 'high_price', type: 'numeric', isNullable: false },
      { name: 'low_price', type: 'numeric', isNullable: false },
      { name: 'average_price', type: 'numeric', isNullable: false },
      { name: 'close_price', type: 'numeric', isNullable: false },
      { name: 'best_bid_price', type: 'numeric', isNullable: true },
      { name: 'best_ask_price', type: 'numeric', isNullable: true },
      { name: 'trade_count', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'quantity', type: 'numeric', isNullable: false },
      { name: 'financial_volume', type: 'numeric', isNullable: false },
      { name: 'strike_price', type: 'numeric', isNullable: true },
      { name: 'correction_indicator', type: ['integer', 'int4'], isNullable: true },
      { name: 'expiration_date', type: 'date', isNullable: true },
      { name: 'quotation_factor', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'strike_points', type: 'numeric', isNullable: true },
      { name: 'isin', type: 'text', isNullable: true },
      { name: 'distribution_number', type: ['integer', 'int4'], isNullable: true },
      { name: 'asset_id', type: 'uuid', isNullable: true },
      { name: 'record_hash', type: 'text', isNullable: false },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  asset_fundamentals: {
    name: 'asset_fundamentals',
    primaryKey: 'id',
    uniqueConstraints: ['uq_asset_fundamentals_versioning'],
    foreignKeys: [
      {
        column: 'asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'created_by',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'asset_id', type: 'uuid', isNullable: false },
      { name: 'reference_period', type: 'text', isNullable: false },
      { name: 'period_type', type: 'text', isNullable: false },
      { name: 'statement_type', type: 'text', isNullable: false, hasDefault: true },
      { name: 'reference_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'filing_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'source', type: 'text', isNullable: false, hasDefault: true },
      { name: 'source_reference', type: 'text', isNullable: true },
      { name: 'version', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'is_restated', type: 'boolean', isNullable: false, hasDefault: true },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'net_revenue', type: 'numeric', isNullable: true },
      { name: 'ebitda', type: 'numeric', isNullable: true },
      { name: 'net_income', type: 'numeric', isNullable: true },
      { name: 'total_equity', type: 'numeric', isNullable: true },
      { name: 'total_assets', type: 'numeric', isNullable: true },
      { name: 'gross_debt', type: 'numeric', isNullable: true },
      { name: 'cash_equivalents', type: 'numeric', isNullable: true },
      { name: 'shares_count', type: 'numeric', isNullable: true },
      { name: 'dividends_declared', type: 'numeric', isNullable: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'created_by', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  cvm_companies: {
    name: 'cvm_companies',
    primaryKey: 'id',
    uniqueConstraints: ['uq_cvm_companies_cvm_code', 'uq_cvm_companies_cnpj'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'cvm_code', type: 'text', isNullable: false },
      { name: 'cnpj', type: 'text', isNullable: false },
      { name: 'legal_name', type: 'text', isNullable: false },
      { name: 'trade_name', type: 'text', isNullable: true },
      { name: 'industry_sector', type: 'text', isNullable: true },
      { name: 'market_type', type: 'text', isNullable: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'registration_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'cancellation_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  cvm_source_files: {
    name: 'cvm_source_files',
    primaryKey: 'id',
    uniqueConstraints: ['uq_cvm_source_files_sha256'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'file_name', type: 'text', isNullable: false },
      { name: 'document_type', type: 'text', isNullable: false },
      { name: 'reference_year', type: ['integer', 'int4'], isNullable: true },
      { name: 'source_url', type: 'text', isNullable: false },
      { name: 'sha256', type: 'text', isNullable: false },
      { name: 'file_size', type: ['integer', 'int4'], isNullable: false },
      { name: 'storage_path', type: 'text', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'http_etag', type: 'text', isNullable: true },
      { name: 'http_last_modified', type: 'text', isNullable: true },
      { name: 'downloaded_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  cvm_ingestion_runs: {
    name: 'cvm_ingestion_runs',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'file_id',
        foreignTable: 'cvm_source_files',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'file_id', type: 'uuid', isNullable: false },
      { name: 'worker_id', type: 'uuid', isNullable: false },
      { name: 'parser_version', type: 'text', isNullable: false, hasDefault: true },
      { name: 'execution_mode', type: 'text', isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'heartbeat_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'lock_expires_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'started_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'completed_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
      { name: 'companies_read', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'statements_inserted', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'statements_updated', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'statements_skipped', type: ['integer', 'int4'], isNullable: false, hasDefault: true },
      { name: 'error_message', type: 'text', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  cvm_company_assets: {
    name: 'cvm_company_assets',
    primaryKey: 'id',
    uniqueConstraints: ['uq_cvm_company_assets_pair'],
    foreignKeys: [
      {
        column: 'company_id',
        foreignTable: 'cvm_companies',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'company_id', type: 'uuid', isNullable: false },
      { name: 'asset_id', type: 'uuid', isNullable: false },
      { name: 'share_class', type: 'text', isNullable: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'match_method', type: 'text', isNullable: false, hasDefault: true },
      { name: 'justification', type: 'text', isNullable: true },
      { name: 'source', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  cash_accounts: {
    name: 'cash_accounts',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'custody_account_id',
        foreignTable: 'custody_accounts',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'currency', type: 'text', isNullable: false, hasDefault: true },
      { name: 'custody_account_id', type: 'uuid', isNullable: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  cash_transactions: {
    name: 'cash_transactions',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'cash_account_id',
        foreignTable: 'cash_accounts',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'portfolio_event_id',
        foreignTable: 'portfolio_events',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'cash_account_id', type: 'uuid', isNullable: false },
      { name: 'type', type: 'text', isNullable: false },
      { name: 'amount', type: 'numeric', isNullable: false },
      { name: 'transaction_date', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
      { name: 'description', type: 'text', isNullable: true },
      { name: 'portfolio_event_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  custody_institutions: {
    name: 'custody_institutions',
    primaryKey: 'id',
    uniqueConstraints: ['custody_institutions_code_unique'],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'code', type: 'text', isNullable: true },
      { name: 'country', type: 'text', isNullable: false, hasDefault: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  custody_accounts: {
    name: 'custody_accounts',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'institution_id',
        foreignTable: 'custody_institutions',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'institution_id', type: 'uuid', isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'account_number', type: 'text', isNullable: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  options_contracts: {
    name: 'options_contracts',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'underlying_asset_id',
        foreignTable: 'assets',
        foreignColumn: 'id',
        deleteRule: 'RESTRICT',
      },
      {
        column: 'custody_account_id',
        foreignTable: 'custody_accounts',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: false },
      { name: 'underlying_asset_id', type: 'uuid', isNullable: false },
      { name: 'custody_account_id', type: 'uuid', isNullable: true },
      { name: 'ticker', type: 'text', isNullable: false },
      { name: 'option_type', type: 'text', isNullable: false },
      { name: 'option_style', type: 'text', isNullable: false, hasDefault: true },
      { name: 'direction', type: 'text', isNullable: false },
      { name: 'strike_price', type: 'numeric', isNullable: false },
      { name: 'premium_paid_received', type: 'numeric', isNullable: false },
      { name: 'quantity', type: 'numeric', isNullable: false },
      { name: 'expiration_date', type: 'date', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'notes', type: 'text', isNullable: true },
      { name: 'created_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'updated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
      { name: 'deleted_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: true },
    ],
  },
  tax_calculation_runs: {
    name: 'tax_calculation_runs',
    primaryKey: 'id',
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'SET NULL',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: true },
      { name: 'reference_year', type: ['integer', 'int4'], isNullable: false },
      { name: 'reference_month', type: ['integer', 'int4'], isNullable: true },
      { name: 'status', type: 'text', isNullable: false, hasDefault: true },
      { name: 'error_message', type: 'text', isNullable: true },
      { name: 'generated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  tax_monthly_summaries: {
    name: 'tax_monthly_summaries',
    primaryKey: 'id',
    uniqueConstraints: ['uq_tax_monthly_summaries_portfolio'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
      {
        column: 'portfolio_id',
        foreignTable: 'portfolios',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'portfolio_id', type: 'uuid', isNullable: true },
      { name: 'year', type: ['integer', 'int4'], isNullable: false },
      { name: 'month', type: ['integer', 'int4'], isNullable: false },
      { name: 'total_sales', type: 'numeric', isNullable: false },
      { name: 'total_proceeds', type: 'numeric', isNullable: false },
      { name: 'total_cost', type: 'numeric', isNullable: false },
      { name: 'net_gain_loss', type: 'numeric', isNullable: false },
      { name: 'exempt_threshold_status', type: 'text', isNullable: false },
      { name: 'applicable_rate', type: 'numeric', isNullable: false },
      { name: 'estimated_tax', type: 'numeric', isNullable: false },
      { name: 'accumulated_loss_compensated', type: 'numeric', isNullable: false, hasDefault: true },
      { name: 'generated_at', type: ['timestamp with time zone', 'timestamptz'], isNullable: false, hasDefault: true },
    ],
  },
  tax_loss_credits: {
    name: 'tax_loss_credits',
    primaryKey: 'id',
    uniqueConstraints: ['uq_tax_loss_credits_origin'],
    foreignKeys: [
      {
        column: 'user_id',
        foreignTable: 'users',
        foreignColumn: 'id',
        deleteRule: 'CASCADE',
      },
    ],
    columns: [
      { name: 'id', type: 'uuid', isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'year', type: ['integer', 'int4'], isNullable: false },
      { name: 'month_origin', type: ['integer', 'int4'], isNullable: false },
      { name: 'asset_symbol', type: 'text', isNullable: false },
      { name: 'original_loss_amount', type: 'numeric', isNullable: false },
      { name: 'remaining_amount', type: 'numeric', isNullable: false },
      { name: 'expires_on', type: ['timestamp with time zone', 'timestamptz'], isNullable: false },
    ],
  },
};


/**
 * Inspeciona o catálogo físico do PostgreSQL e valida integralmente os elementos da Matriz Formal:
 * - Existência das tabelas
 * - Colunas, tipos e nulabilidade
 * - Defaults declarados como obrigatórios
 * - Chaves primárias
 * - Constraints de unicidade (UNIQUE)
 * - Chaves estrangeiras (FOREIGN KEY e ON DELETE)
 * - Triggers obrigatórios
 * - Histórico de migrações versionadas
 */
export async function inspectPhysicalSchema(
  queryExecutor: SchemaQueryExecutor = db,
  options: { targetSchema?: string; checkMigrations?: boolean } = {}
): Promise<SchemaInspectionResult> {
  const targetSchema = options.targetSchema || 'public';
  const checkMigrations = options.checkMigrations !== false;
  const errors: string[] = [];
  const inspectedTables: string[] = [];

  // 1. Inspecionar tabelas existentes no schema
  const tablesQuery = await queryExecutor.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${targetSchema} AND table_type = 'BASE TABLE';
  `);

  const existingTableNames = new Set(
    (tablesQuery as unknown as Array<{ table_name: string }>).map((r) => r.table_name)
  );

  // 2. Validar cada tabela esperada
  for (const [expectedTableName, expectedTable] of Object.entries(EXPECTED_SCHEMA_MATRIX)) {
    inspectedTables.push(expectedTableName);

    if (!existingTableNames.has(expectedTableName)) {
      errors.push(`Tabela ausente: "${targetSchema}.${expectedTableName}".`);
      continue;
    }

    // A. Inspecionar e validar Chave Primária
    const pkQuery = await queryExecutor.execute(sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${targetSchema}
        AND tc.table_name = ${expectedTableName};
    `);

    const actualPkColumns = (pkQuery as unknown as Array<{ column_name: string }>).map((r) => r.column_name);
    if (!actualPkColumns.includes(expectedTable.primaryKey)) {
      errors.push(
        `Chave primária ausente ou incorreta na tabela "${expectedTableName}": esperado coluna "${expectedTable.primaryKey}", encontrado [${actualPkColumns.join(', ') || 'nenhuma'}].`
      );
    }

    // B. Inspecionar e validar Constraints Únicas
    if (expectedTable.uniqueConstraints && expectedTable.uniqueConstraints.length > 0) {
      const uniqueQuery = await queryExecutor.execute(sql`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints AS tc
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = ${targetSchema}
          AND tc.table_name = ${expectedTableName};
      `);

      const actualUniqueConstraints = new Set(
        (uniqueQuery as unknown as Array<{ constraint_name: string }>).map((r) => r.constraint_name)
      );

      for (const expectedConstraint of expectedTable.uniqueConstraints) {
        if (!actualUniqueConstraints.has(expectedConstraint)) {
          errors.push(
            `Constraint única ausente: "${expectedConstraint}" na tabela "${expectedTableName}".`
          );
        }
      }
    }

    // C. Inspecionar colunas, tipos, nulabilidade e defaults
    const columnsQuery = await queryExecutor.execute(sql`
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = ${targetSchema} AND table_name = ${expectedTableName};
    `);

    const existingColumns = new Map<string, {
      dataType: string;
      udtName: string;
      isNullable: boolean;
      hasDefault: boolean;
    }>();

    for (const col of columnsQuery as unknown as Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>) {
      existingColumns.set(col.column_name, {
        dataType: col.data_type.toLowerCase(),
        udtName: col.udt_name.toLowerCase(),
        isNullable: col.is_nullable === 'YES',
        hasDefault: col.column_default !== null,
      });
    }

    for (const expectedCol of expectedTable.columns) {
      const actualCol = existingColumns.get(expectedCol.name);
      if (!actualCol) {
        errors.push(
          `Coluna ausente: "${expectedTableName}.${expectedCol.name}" na tabela "${expectedTableName}".`
        );
        continue;
      }

      // Validar tipos suportados (ex: uuid, text, timestamptz, jsonb, integer)
      const allowedTypes = Array.isArray(expectedCol.type)
        ? expectedCol.type.map((t) => t.toLowerCase())
        : [expectedCol.type.toLowerCase()];

      const typeMatches =
        allowedTypes.includes(actualCol.dataType) ||
        allowedTypes.includes(actualCol.udtName) ||
        (allowedTypes.includes('uuid') && actualCol.udtName === 'uuid') ||
        (allowedTypes.includes('jsonb') && (actualCol.dataType === 'jsonb' || actualCol.udtName === 'jsonb')) ||
        (allowedTypes.includes('integer') && (actualCol.dataType === 'integer' || actualCol.udtName === 'int4')) ||
        (allowedTypes.includes('timestamptz') && (actualCol.dataType.includes('time zone') || actualCol.udtName === 'timestamptz'));

      if (!typeMatches) {
        errors.push(
          `Tipo incorreto na coluna "${expectedTableName}.${expectedCol.name}": esperado ${allowedTypes.join(' | ')}, encontrado ${actualCol.dataType} (udt: ${actualCol.udtName}).`
        );
      }

      // Validar nulabilidade
      if (actualCol.isNullable !== expectedCol.isNullable) {
        errors.push(
          `Nulabilidade incorreta na coluna "${expectedTableName}.${expectedCol.name}": esperado ${expectedCol.isNullable ? 'NULL' : 'NOT NULL'}, encontrado ${actualCol.isNullable ? 'NULL' : 'NOT NULL'}.`
        );
      }

      // Validar default obrigatório
      if (expectedCol.hasDefault === true && !actualCol.hasDefault) {
        errors.push(
          `Valor default ausente na coluna "${expectedTableName}.${expectedCol.name}": esperado valor default configurado no PostgreSQL.`
        );
      }
    }

    // D. Inspecionar Foreign Keys
    if (expectedTable.foreignKeys && expectedTable.foreignKeys.length > 0) {
      const fkQuery = await queryExecutor.execute(sql`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = ${targetSchema}
          AND tc.table_name = ${expectedTableName};
      `);

      const actualFks = (fkQuery as unknown as Array<{
        column_name: string;
        foreign_table_name: string;
        foreign_column_name: string;
        delete_rule: string;
      }>);

      for (const expectedFk of expectedTable.foreignKeys) {
        const matchingFk = actualFks.find(
          (fk) =>
            fk.column_name === expectedFk.column &&
            fk.foreign_table_name === expectedFk.foreignTable &&
            fk.foreign_column_name === expectedFk.foreignColumn
        );

        if (!matchingFk) {
          errors.push(
            `Foreign key ausente: "${expectedTableName}.${expectedFk.column} -> ${expectedFk.foreignTable}.${expectedFk.foreignColumn}".`
          );
        } else if (matchingFk.delete_rule.toUpperCase() !== expectedFk.deleteRule.toUpperCase()) {
          errors.push(
            `Ação referencial ON DELETE incorreta em "${expectedTableName}.${expectedFk.column}": esperado ${expectedFk.deleteRule}, encontrado ${matchingFk.delete_rule}.`
          );
        }
      }
    }

    // E. Inspecionar Triggers
    if (expectedTable.triggers && expectedTable.triggers.length > 0) {
      const triggerQuery = await queryExecutor.execute(sql`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = ${targetSchema}
          AND event_object_table = ${expectedTableName};
      `);

      const actualTriggers = new Set(
        (triggerQuery as unknown as Array<{ trigger_name: string }>).map((t) => t.trigger_name)
      );

      for (const expectedTrigger of expectedTable.triggers) {
        if (!actualTriggers.has(expectedTrigger)) {
          errors.push(
            `Trigger ausente: "${expectedTrigger}" na tabela "${expectedTableName}".`
          );
        }
      }
    }
  }

  // 3. Validar histórico de migrações (__drizzle_migrations)
  if (checkMigrations) {
    try {
      const migrationsTableCheck = await queryExecutor.execute(sql`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_name = '__drizzle_migrations';
      `);

      const migrationsTableList = migrationsTableCheck as unknown as Array<{ table_name: string; table_schema: string }>;
      if (migrationsTableList.length === 0) {
        errors.push('Tabela de histórico de migrações "__drizzle_migrations" não foi encontrada.');
      } else {
        const schemaName = migrationsTableList[0].table_schema;
        const migrationRowsQuery = await queryExecutor.execute(
          sql.raw(`SELECT id, hash, created_at FROM "${schemaName}"."__drizzle_migrations" ORDER BY id ASC;`)
        );

        const rows = migrationRowsQuery as unknown as Array<{ id: number; hash: string; created_at: string | number }>;
        if (rows.length < 4) {
          errors.push(
            `Histórico de migrações incompleto: esperado no mínimo 4 migrações registradas, encontrado ${rows.length}.`
          );
        }
      }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : 'UnknownError';
      errors.push(`Falha ao inspecionar histórico de migrações (${errName}).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    inspectedTables,
  };
}

// ─── Singleton Controlado por Processo (Startup Schema Guard) ────────────────
let schemaCheckPromise: Promise<void> | null = null;
let isSchemaVerified = false;

/**
 * Reseta o estado em memória (utilizado exclusivamente em testes unitários e de integração).
 */
export function resetSchemaVerification(): void {
  schemaCheckPromise = null;
  isSchemaVerified = false;
}

/**
 * Executa a validação no máximo UMA vez por ciclo de vida do processo Node.js.
 * Não reexecuta consultas no caminho quente após a verificação inicial.
 * Em caso de falha de infraestrutura, lança erro sanitizado sem detalhes sensíveis.
 */
export async function assertSchemaCompatible(queryExecutor: SchemaQueryExecutor = db): Promise<void> {
  // Bypass controlado para CLI de migração ou testes unitários sem banco
  if (process.env.SKIP_SCHEMA_CHECK === 'true') {
    return;
  }

  const isVitest = process.env.VITEST === 'true';
  if (isVitest && !process.env.DATABASE_URL_TEST) {
    return;
  }

  // Se já foi validado com sucesso neste processo, retorna imediatamente (zero overhead)
  if (isSchemaVerified) {
    return;
  }

  // Evita condições de corrida entre requisições paralelas durante a inicialização
  if (schemaCheckPromise) {
    return schemaCheckPromise;
  }

  schemaCheckPromise = (async () => {
    try {
      const result = await inspectPhysicalSchema(queryExecutor);
      if (!result.isValid) {
        throw new SchemaIncompatibilityError(result.errors);
      }
      isSchemaVerified = true;
    } catch (err) {
      schemaCheckPromise = null;
      if (err instanceof SchemaIncompatibilityError) {
        throw err;
      }
      throw new SchemaIncompatibilityError([
        'Falha de infraestrutura ou comunicação durante a inspeção de conformidade do banco de dados.',
      ]);
    }
  })();

  return schemaCheckPromise;
}
