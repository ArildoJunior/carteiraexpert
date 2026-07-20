import { sql } from "drizzle-orm";
import { date, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * portfolio_snapshots
 *
 * Snapshot diário consolidado do portfolio do usuário (Cap 8).
 * Uma linha por (user_id, date) — soma todas as posições abertas do usuário.
 *
 * Alimentada pelo job Inngest `calculate-portfolio-snapshots` (Cap 8C, 22:30 BRT).
 */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalValue: numeric("total_value", { precision: 20, scale: 2 }).notNull(),
    totalCost: numeric("total_cost", { precision: 20, scale: 2 }).notNull(),
    unrealizedPnl: numeric("unrealized_pnl", { precision: 20, scale: 2 }).notNull(),
    realizedPnl: numeric("realized_pnl", { precision: 20, scale: 2 }).notNull(),
    twrDaily: numeric("twr_daily", { precision: 20, scale: 8 }).notNull(),
    twrCumulative: numeric("twr_cumulative", { precision: 20, scale: 8 }).notNull(),
    allocationByClass: text("allocation_by_class").notNull().default("{}"),
    positionsCount: numeric("positions_count", { precision: 10, scale: 0 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    unqUserDate: unique("unq_portfolio_snapshots_user_date").on(table.userId, table.date),
    idxUserDate: index("idx_portfolio_snapshots_user_date").on(table.userId, table.date),
  })
);

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;
