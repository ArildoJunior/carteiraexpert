// db/schema/ai-costs.ts
// Cap 9A — Agregacao mensal de custo de IA por membro da equipe/provider/modelo.

import { aiProvider } from "@/db/schema/document-analyses";
import { users } from "@/db/schema/users";
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const aiCosts = pgTable(
  "ai_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Formato "YYYY-MM", ex: "2026-07".
    yearMonth: text("year_month").notNull(),
    provider: aiProvider("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    documentsCount: integer("documents_count").notNull().default(0),
    providerBreakdown: jsonb("provider_breakdown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqUserMonthProviderModel: uniqueIndex("ai_costs_user_month_provider_model_idx").on(
      t.userId,
      t.yearMonth,
      t.provider,
      t.model
    ),
  })
);

export type AiCost = typeof aiCosts.$inferSelect;
export type NewAiCost = typeof aiCosts.$inferInsert;
