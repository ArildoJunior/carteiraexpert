import { brokerKindEnum, brokerProviderEnum } from "@/lib/db/enums";
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const brokerProviderPgEnum = pgEnum("broker_provider", brokerProviderEnum);
export const brokerKindPgEnum = pgEnum("broker_kind", brokerKindEnum);

export const brokersTable = pgTable("brokers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: brokerKindPgEnum("kind").notNull(),
  provider: brokerProviderPgEnum("provider").notNull(),
  logoUrl: text("logo_url"),
  templateUrl: text("template_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Broker = typeof brokersTable.$inferSelect;
export type NewBroker = typeof brokersTable.$inferInsert;
