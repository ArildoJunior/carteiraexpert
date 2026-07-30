import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Cap. 9B.1 — RBAC: catalogo de papeis (roles) do sistema.
 * O slug deve coincidir com os valores do enum `user_role` (Cap. 9A)
 * usado na coluna legada `users.role`. A coluna legada sera
 * descontinuada no Cap. 15 (Billing) quando o modelo de roles
 * passar a ser unico via esta tabela + `user_roles`.
 */
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
