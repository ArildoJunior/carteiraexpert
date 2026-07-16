import { accountTypeEnum, brokerEnum } from "@/lib/db/enums";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const accountType = pgEnum("account_type", accountTypeEnum);
export const broker = pgEnum("broker", brokerEnum);

export const brokerageAccounts = pgTable("brokerage_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  broker: broker("broker").notNull().default("manual"),
  currency: text("currency").notNull().default("BRL"),
  isActive: text("is_active").notNull().default("true"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrokerageAccount = typeof brokerageAccounts.$inferSelect;
export type NewBrokerageAccount = typeof brokerageAccounts.$inferInsert;
