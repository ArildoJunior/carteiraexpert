import { userPlanEnum, userRoleEnum } from "@/lib/db/enums";
import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", userRoleEnum);

/**
 * Cap. 9B.1 — RBAC: enum de plano comercial.
 * Apenas dois valores no 9B.1; extensivel no Cap. 15 (Billing).
 * A coluna `users.plan` e default 'free' para retrocompatibilidade.
 */
export const userPlan = pgEnum("user_plan", userPlanEnum);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  // Cap. 9A — Papel do usuario: equipe interna (editor/admin) ou usuario final (user).
  // DEPRECATED em 9B.1: a checagem deve passar a usar `user_roles` + `can()`.
  // Mantido por compatibilidade ate o Cap. 15 (Billing).
  role: userRole("role").notNull().default("user"),
  // Cap. 9B.1 — Plano comercial. Usado pelo helper para conceder
  // automaticamente o papel `premium` (definido em 9B.1.d). A cobranca
  // em si entra no Cap. 15; aqui apenas modelamos a coluna.
  plan: userPlan("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
