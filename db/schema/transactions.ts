import { transactionTypeEnum } from "@/lib/db/enums";
import { date, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { brokerageAccounts } from "./brokerage-accounts";
import { positions } from "./positions";
import { users } from "./users";

export const transactionType = pgEnum("transaction_type", transactionTypeEnum);

export const transactions = pgTable("transactions", {
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
  positionId: uuid("position_id").references(() => positions.id, {
    onDelete: "set null",
  }),
  type: transactionType("type").notNull(),
  transactionDate: date("transaction_date").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 20, scale: 8 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 20, scale: 8 }).notNull(),
  fees: numeric("fees", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("BRL"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
