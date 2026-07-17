import { reviewStatusEnum } from "@/lib/db/enums";
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brokerConnectionsTable } from "./broker-connections";
import { brokersTable } from "./brokers";
import { positions } from "./positions";
import { transactions } from "./transactions";
import { users } from "./users";

export const reviewStatusPgEnum = pgEnum("review_status", reviewStatusEnum);

export const importQueueTable = pgTable(
  "import_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => brokerConnectionsTable.id, { onDelete: "cascade" }),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokersTable.id, { onDelete: "restrict" }),
    payload: text("payload").notNull(),
    canonicalHash: text("canonical_hash").notNull(),
    reviewStatus: reviewStatusPgEnum("review_status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    resultingPositionId: uuid("resulting_position_id").references(() => positions.id, {
      onDelete: "set null",
    }),
    resultingTransactionId: uuid("resulting_transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idxImportQueueUser: index("idx_import_queue_user").on(table.userId),
    idxImportQueueConnection: index("idx_import_queue_connection").on(table.connectionId),
    idxImportQueuePending: index("idx_import_queue_pending")
      .on(table.userId, table.reviewStatus)
      .where(sql`${table.reviewStatus} = 'pending'`),
    uniqImportQueueHash: uniqueIndex("idx_import_queue_hash").on(table.userId, table.canonicalHash),
  })
);

export type ImportQueueItem = typeof importQueueTable.$inferSelect;
export type NewImportQueueItem = typeof importQueueTable.$inferInsert;
