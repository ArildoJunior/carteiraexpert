import { brokerConnectionsTable, brokersTable, importJobsTable } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import { getConnectorBySlug } from "@/lib/brokers/provider-registry";
import type { ImportPreview } from "@/lib/brokers/types";
import { BrokerError } from "@/lib/brokers/types";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { hashFile } from "@/lib/integrations/file-hash";
import { tryAdvisoryLock } from "@/lib/integrations/lock";
import { persistImportPreview } from "@/lib/integrations/persist";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".txt"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  // 1. Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ message: "multipart/form-data invalido" }, { status: 400 });
  }

  const file = formData.get("file");
  const brokerSlug = formData.get("brokerSlug");
  const connectionId = formData.get("connectionId");

  if (
    !(file instanceof File) ||
    typeof brokerSlug !== "string" ||
    typeof connectionId !== "string"
  ) {
    return NextResponse.json(
      { message: "Campos obrigatorios: file, brokerSlug, connectionId" },
      { status: 400 }
    );
  }

  // 2. Validar extensao
  const filename = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
    return NextResponse.json(
      { message: `Extensao nao suportada. Aceitas: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // 3. Validar tamanho
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { message: `Arquivo excede ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 4. Validar corretora e connection pertecem ao user
  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.slug, brokerSlug))
    .limit(1);
  if (!broker) {
    return NextResponse.json({ message: "Corretora nao encontrada" }, { status: 404 });
  }

  const [connection] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(
      and(
        eq(brokerConnectionsTable.id, connectionId),
        eq(brokerConnectionsTable.userId, userId),
        eq(brokerConnectionsTable.brokerId, broker.id)
      )
    )
    .limit(1);
  if (!connection) {
    return NextResponse.json({ message: "Conexao nao encontrada" }, { status: 404 });
  }

  // 5. Idempotencia no nivel de arquivo (SHA-256)
  const fileHash = hashFile(buffer);
  const [existingJob] = await db
    .select({ id: importJobsTable.id, createdAt: importJobsTable.startedAt })
    .from(importJobsTable)
    .where(and(eq(importJobsTable.userId, userId), eq(importJobsTable.fileHash, fileHash)))
    .limit(1);
  if (existingJob) {
    return NextResponse.json(
      {
        message: "Arquivo ja importado anteriormente",
        existingJobId: existingJob.id,
        importedAt: existingJob.createdAt,
      },
      { status: 409 }
    );
  }

  // 6. Parse do arquivo (pode lancar BrokerError)
  let preview: ImportPreview;
  try {
    const connector = getConnectorBySlug(brokerSlug);
    preview = await connector.parseFile(buffer, file.name);
  } catch (err) {
    if (err instanceof BrokerError) {
      return NextResponse.json({ message: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  // 7. Transacao atomica: lock + job + persist + audit
  let jobId: string;
  let persistResult: { queued: number; duplicates: number; errors: number; totalRows: number };
  try {
    const result = await db.transaction(async (tx) => {
      // Tenta adquirir advisory lock para este user
      const lockKey = `import:${userId}` as const;
      const acquired = await tryAdvisoryLock(lockKey);
      if (!acquired) {
        throw new BrokerError("rate_limited", "Ja existe um import em andamento para este usuario");
      }

      // Cria o job
      const [job] = await tx
        .insert(importJobsTable)
        .values({
          userId,
          connectionId,
          triggeredBy: "manual",
          sourceFilename: file.name,
          fileHash,
          status: "running",
        })
        .returning();
      if (!job) throw new Error("Falha ao criar job");
      const newJobId = job.id;

      // Persiste preview dentro da mesma transacao
      const persistRes = await persistImportPreview(
        userId,
        preview,
        newJobId,
        broker.id,
        connectionId
      );
      return { jobId: newJobId, persistRes };
    });
    jobId = result.jobId;
    persistResult = result.persistRes;
  } catch (err) {
    if (err instanceof BrokerError) {
      return NextResponse.json({ message: err.message, code: err.code }, { status: 429 });
    }
    throw err;
  }

  // 8. Audit (fora da transacao, nao precisa de lock)
  await logAudit({
    userId,
    action: "import.completed",
    resourceType: "import_job",
    resourceId: jobId,
    metadata: {
      broker: brokerSlug,
      filename: file.name,
      fileHash,
      ...persistResult,
    },
  });

  // 9. Dispara evento assincrono para o Inngest (audit log + extensao futura).
  // Gated: so dispara se INNGEST_EVENT_KEY estiver setada. Stub nao deve falhar
  // em dev/test quando Inngest nao esta configurado. Cap 17 habilita em prod.
  if (process.env.INNGEST_EVENT_KEY) {
    try {
      await inngest.send({
        name: "broker/import.requested",
        data: { userId, brokerSlug, importJobId: jobId },
      });
    } catch (err) {
      // Falha no dispatch nao bloqueia o import - log e segue
      console.error("[integrations/import] inngest.send falhou:", err);
    }
  }
  return NextResponse.json(
    {
      jobId,
      ...persistResult,
      warnings: preview.warnings,
    },
    { status: 201 }
  );
}
