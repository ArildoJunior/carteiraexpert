import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { brokerageAccounts } from "./brokerage-accounts";
import { users } from "./users";

export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => brokerageAccounts.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  averageCost: numeric("average_cost", { precision: 20, scale: 8 }).notNull(),
  costCurrency: text("cost_currency").notNull().default("BRL"),
  isOpen: text("is_open").notNull().default("true"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
