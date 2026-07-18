import { type ImportJob, ImportJobCard } from "@/components/portfolio/import-job-card";
import { Button } from "@/components/ui/button";
import { brokerConnectionsTable, brokersTable, importJobsTable } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ImportacoesPage() {
  const userId = await getUserIdOrRedirect();

  // Caminho real: import_jobs -> connection_id -> broker_connections -> broker_id -> brokers
  const rows = await db
    .select({
      id: importJobsTable.id,
      sourceFilename: importJobsTable.sourceFilename,
      status: importJobsTable.status,
      startedAt: importJobsTable.startedAt,
      finishedAt: importJobsTable.finishedAt,
      rowsRead: importJobsTable.rowsRead,
      rowsImported: importJobsTable.rowsImported,
      rowsSkipped: importJobsTable.rowsSkipped,
      rowsQueued: importJobsTable.rowsQueued,
      errorMessage: importJobsTable.errorMessage,
      durationMs: importJobsTable.durationMs,
      brokerName: brokersTable.name,
    })
    .from(importJobsTable)
    .innerJoin(brokerConnectionsTable, eq(importJobsTable.connectionId, brokerConnectionsTable.id))
    .innerJoin(brokersTable, eq(brokerConnectionsTable.brokerId, brokersTable.id))
    .where(eq(importJobsTable.userId, userId))
    .orderBy(desc(importJobsTable.startedAt));

  const jobs: ImportJob[] = rows.map((r) => ({
    id: r.id,
    sourceFilename: r.sourceFilename ?? "arquivo sem nome",
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    rowsRead: Number(r.rowsRead ?? 0),
    rowsImported: Number(r.rowsImported ?? 0),
    rowsSkipped: Number(r.rowsSkipped ?? 0),
    rowsQueued: Number(r.rowsQueued ?? 0),
    errorMessage: r.errorMessage,
    durationMs: r.durationMs !== null ? Number(r.durationMs) : null,
    brokerName: r.brokerName,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importações</h1>
          <p className="text-muted-foreground">Histórico de arquivos importados das corretoras.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/app/imports/pendentes">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Ver pendentes
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/posicoes/nova">
              <Upload className="mr-2 h-4 w-4" />
              Nova importação
            </Link>
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Nenhuma importação ainda</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Faça upload de um arquivo CSV/XLSX da sua corretora para começar.
          </p>
          <Button asChild className="mt-4">
            <Link href="/app/posicoes/nova">
              <Upload className="mr-2 h-4 w-4" />
              Fazer primeira importação
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <ImportJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
