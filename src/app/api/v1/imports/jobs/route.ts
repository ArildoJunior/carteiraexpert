import { brokerConnectionsTable, brokersTable, importJobsTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/v1/imports/jobs
 * Lista os ultimos 50 import_jobs do user autenticado.
 * Inclui join com broker_connections e brokers para retornar nome/slug.
 * Retorna 200 com { jobs: [{ id, broker_slug, broker_name, source_filename, status, started_at, finished_at, ... }] }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const rows = await db
    .select({
      id: importJobsTable.id,
      connectionId: importJobsTable.connectionId,
      sourceFilename: importJobsTable.sourceFilename,
      triggeredBy: importJobsTable.triggeredBy,
      status: importJobsTable.status,
      startedAt: importJobsTable.startedAt,
      finishedAt: importJobsTable.finishedAt,
      rowsRead: importJobsTable.rowsRead,
      rowsImported: importJobsTable.rowsImported,
      rowsUpdated: importJobsTable.rowsUpdated,
      rowsSkipped: importJobsTable.rowsSkipped,
      rowsQueued: importJobsTable.rowsQueued,
      errorMessage: importJobsTable.errorMessage,
      durationMs: importJobsTable.durationMs,
      brokerSlug: brokersTable.slug,
      brokerName: brokersTable.name,
    })
    .from(importJobsTable)
    .innerJoin(brokerConnectionsTable, eq(brokerConnectionsTable.id, importJobsTable.connectionId))
    .innerJoin(brokersTable, eq(brokersTable.id, brokerConnectionsTable.brokerId))
    .where(eq(importJobsTable.userId, userId))
    .orderBy(desc(importJobsTable.startedAt))
    .limit(50);

  return NextResponse.json(
    {
      jobs: rows.map((r) => ({
        id: r.id,
        connection_id: r.connectionId,
        broker_slug: r.brokerSlug,
        broker_name: r.brokerName,
        source_filename: r.sourceFilename,
        triggered_by: r.triggeredBy,
        status: r.status,
        started_at: r.startedAt,
        finished_at: r.finishedAt,
        rows_read: Number(r.rowsRead ?? "0"),
        rows_imported: Number(r.rowsImported ?? "0"),
        rows_updated: Number(r.rowsUpdated ?? "0"),
        rows_skipped: Number(r.rowsSkipped ?? "0"),
        rows_queued: Number(r.rowsQueued ?? "0"),
        error_message: r.errorMessage,
        duration_ms: r.durationMs !== null ? Number(r.durationMs) : null,
      })),
    },
    { status: 200 }
  );
}
