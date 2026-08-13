import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

// ─── users ───────────────────────────────────────────────────────────────────
// Armazena dados cadastrais do usuário. O e-mail é normalizado para minúsculas
// antes da persistência e possui constraint de unicidade.
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  // Nunca armazenar senha em texto puro. Sempre hash Argon2id.
  passwordHash: text('password_hash').notNull(),
  // 'active' | 'suspended' | 'pending_verification'
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── sessions ────────────────────────────────────────────────────────────────
// Persiste sessões autenticadas. O token de sessão é armazenado apenas como
// hash SHA-256 (token_hash). O texto puro fica exclusivamente no cookie HttpOnly.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 do token de sessão gerado por crypto.randomBytes(32)
  tokenHash: text('token_hash').notNull().unique(),
  // IP anonimizado antes de salvar (IPv4: zera último octeto; IPv6: /48)
  ipAddress: text('ip_address'),
  // Truncado em 255 chars antes de salvar
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // TTL fixo de 7 dias. Sem renovação deslizante.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Preenchido no logout, no reset de senha ou quando status 'suspended' é detectado
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// ─── password_reset_tokens ───────────────────────────────────────────────────
// Tokens de curta duração para redefinição de senha. Apenas o hash SHA-256
// do token é armazenado. Expiração de 15 minutos.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 do token de reset (texto puro nunca armazenado)
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Preenchido no consumo atômico via UPDATE ... RETURNING
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// ─── auth_rate_limits ─────────────────────────────────────────────────────────
// Controle stateless de tentativas de autenticação via PostgreSQL.
// Permite escalonamento horizontal sem estado em memória por instância.
// Chave gerada via HMAC-SHA256(AUTH_RATE_LIMIT_SECRET, "action:ip:email").
export const authRateLimits = pgTable('auth_rate_limits', {
  id: uuid('id').primaryKey(),
  // HMAC-SHA256 do segredo + tipo de operação + IP + e-mail normalizados
  key: text('key').notNull().unique(),
  attempts: integer('attempts').notNull().default(1),
  firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  // Preenchido após a 5ª falha consecutiva dentro da janela de 15 minutos
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
});
