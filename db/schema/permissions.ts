import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Cap. 9B.1 — RBAC: catalogo de permissoes.
 * Cada permissao e uma string `acao:recurso` (ex.: `users.read`,
 * `quotes.refresh`). A chave e o que o helper `can()` recebe.
 * A fonte da verdade para a lista de chaves e o enum
 * `userPermissionEnum` em `src/lib/db/enums.ts`; esta tabela
 * espelha o enum para auditoria e gestao via admin.
 */
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
