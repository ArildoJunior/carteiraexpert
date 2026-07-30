import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { users } from "./users";

/**
 * Cap. 9B.1 — RBAC: papeis atribuidos a um usuario (N:N).
 * Permite multiplos papeis simultaneos (ex.: user + premium).
 * Substitui gradualmente a coluna legada `users.role` (Cap. 9A).
 * A descontinuacao completa da coluna legada fica para o Cap. 15.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  })
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
