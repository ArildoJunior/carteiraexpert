import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brokersTable } from "./brokers";
import { users } from "./users";

export const brokerConnectionsTable = pgTable(
  "broker_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokersTable.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    externalItemId: text("external_item_id"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    metadata: text("metadata"),
    lastImportAt: timestamp("last_import_at", { withTimezone: true }),
    lastImportError: text("last_import_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxBrokerConnUser: index("idx_broker_conn_user").on(table.userId),
    uniqBrokerConnUserBroker: uniqueIndex("idx_broker_conn_user_broker").on(
      table.userId,
      table.brokerId
    ),
  })
);

export type BrokerConnection = typeof brokerConnectionsTable.$inferSelect;
export type NewBrokerConnection = typeof brokerConnectionsTable.$inferInsert;
