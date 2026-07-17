import { importJobStatusEnum } from "@/lib/db/enums";
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brokerConnectionsTable } from "./broker-connections";
import { users } from "./users";

export const importJobStatusPgEnum = pgEnum("import_job_status", importJobStatusEnum);

export const importJobsTable = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => brokerConnectionsTable.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by").notNull(),
    sourceFilename: text("source_filename"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: importJobStatusPgEnum("status").notNull(),
    rowsRead: text("rows_read").notNull().default("0"),
    rowsImported: text("rows_imported").notNull().default("0"),
    rowsUpdated: text("rows_updated").notNull().default("0"),
    rowsSkipped: text("rows_skipped").notNull().default("0"),
    rowsQueued: text("rows_queued").notNull().default("0"),
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    durationMs: text("duration_ms"),
  },
  (table) => ({
    idxImportJobsUser: index("idx_import_jobs_user").on(table.userId),
    idxImportJobsConnection: index("idx_import_jobs_connection").on(table.connectionId),
    idxImportJobsRunning: index("idx_import_jobs_running")
      .on(table.userId, table.status)
      .where(sql`${table.status} = 'running'`),
  })
);

export type ImportJob = typeof importJobsTable.$inferSelect;
export type NewImportJob = typeof importJobsTable.$inferInsert;
