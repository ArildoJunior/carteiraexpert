import { randomUUID } from "node:crypto";
import { assets, documents } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { validateDocumentFile, validateDocumentType } from "@/lib/documents/file-validation";
import { env } from "@/lib/env";
import { hashFile } from "@/lib/integrations/file-hash";
import { requirePermission } from "@/lib/rbac";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json(
    {
      message,
      ...(code ? { code } : {}),
    },
    { status }
  );
}

function sanitizeFilename(filename: string): string {
  const base = filename
    .normalize("NFKD")
    .replace(/[^\w.\- ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);

  return base || "documento";
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string; message?: string };

  return candidate.code === "23505" || candidate.message?.toLowerCase().includes("unique") === true;
}

export async function POST(req: Request) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return jsonError(
      "O armazenamento documental está temporariamente indisponível.",
      503,
      "DOCUMENT_STORAGE_UNAVAILABLE"
    );
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return jsonError("Não autenticado.", 401, "UNAUTHORIZED");
  }

  try {
    await requirePermission({ kind: "userId", userId }, "documents.write");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(error.message, 401, error.code);
    }

    if (error instanceof ForbiddenError) {
      return jsonError(error.message, 403, error.code);
    }

    throw error;
  }

  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return jsonError("multipart/form-data inválido.", 400, "INVALID_MULTIPART");
  }

  const file = formData.get("file");
  const documentTypeValue = formData.get("documentType");
  const tickerValue = formData.get("ticker");
  const assetIdValue = formData.get("assetId");

  if (!(file instanceof File)) {
    return jsonError("O campo file é obrigatório.", 400, "FILE_REQUIRED");
  }

  if (documentTypeValue !== null && typeof documentTypeValue !== "string") {
    return jsonError("documentType deve ser texto.", 400, "INVALID_DOCUMENT_TYPE");
  }

  if (tickerValue !== null && typeof tickerValue !== "string") {
    return jsonError("ticker deve ser texto.", 400, "INVALID_TICKER");
  }

  if (assetIdValue !== null && typeof assetIdValue !== "string") {
    return jsonError("assetId deve ser texto.", 400, "INVALID_ASSET_ID");
  }

  const maxSizeBytes = env.DOC_MAX_SIZE_MB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return jsonError(
      `O arquivo excede o limite de ${env.DOC_MAX_SIZE_MB} MB.`,
      413,
      "FILE_TOO_LARGE"
    );
  }

  let documentType: string | null;
  let ticker: string | null;
  let assetId: string | null;

  try {
    documentType = validateDocumentType(documentTypeValue);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "documentType inválido.",
      400,
      "INVALID_DOCUMENT_TYPE"
    );
  }

  ticker = tickerValue?.trim() || null;

  if (ticker && ticker.length > 32) {
    return jsonError("ticker deve possuir no máximo 32 caracteres.", 400, "INVALID_TICKER");
  }

  assetId = assetIdValue?.trim() || null;

  if (assetId && !UUID_REGEX.test(assetId)) {
    return jsonError("assetId inválido.", 400, "INVALID_ASSET_ID");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let validatedFile: ReturnType<typeof validateDocumentFile>;

  try {
    validatedFile = validateDocumentFile(file.name, file.type, buffer);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Formato de arquivo inválido.",
      400,
      "INVALID_FILE"
    );
  }

  if (assetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset) {
      return jsonError("Ativo não encontrado.", 404, "ASSET_NOT_FOUND");
    }
  }

  const contentHash = hashFile(buffer);

  const [existingDocument] = await db
    .select({
      id: documents.id,
      originalName: documents.originalName,
      status: documents.status,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.contentHash, contentHash))
    .limit(1);

  if (existingDocument) {
    return NextResponse.json(
      {
        message: "Este arquivo já foi enviado anteriormente.",
        code: "DOCUMENT_ALREADY_EXISTS",
        document: {
          id: existingDocument.id,
          original_name: existingDocument.originalName,
          status: existingDocument.status,
          created_at: existingDocument.createdAt,
        },
      },
      { status: 409 }
    );
  }

  let blobUrl: string | null = null;

  try {
    const pathname = [
      "documents",
      userId,
      `${contentHash}-${randomUUID()}-${sanitizeFilename(file.name)}`,
    ].join("/");

    const blob = await put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: validatedFile.mimeType,
    });

    blobUrl = blob.url;

    const [createdDocument] = await db
      .insert(documents)
      .values({
        uploadedByUserId: userId,
        originalName: file.name,
        mimeType: validatedFile.mimeType,
        sizeBytes: file.size,
        contentHash,
        blobUrl,
        documentType: documentType as
          | "informe_rendimento"
          | "relatorio_fii"
          | "fato_relevante"
          | "dre"
          | "balanco"
          | "prospecto"
          | "release_resultados"
          | "outros"
          | null,
        ticker,
        assetId,
        status: "uploaded",
        metadata: {
          uploadSource: "api",
          declaredMimeType: file.type || null,
          extension: validatedFile.extension,
        },
      })
      .returning();

    if (!createdDocument) {
      throw new Error("Falha ao criar o registro documental.");
    }

    await logAudit({
      userId,
      action: "document.uploaded",
      resourceType: "document",
      resourceId: createdDocument.id,
      metadata: {
        originalName: file.name,
        mimeType: validatedFile.mimeType,
        sizeBytes: file.size,
        contentHash,
        documentType,
        ticker,
        assetId,
      },
    });

    return NextResponse.json(
      {
        document: {
          id: createdDocument.id,
          original_name: createdDocument.originalName,
          mime_type: createdDocument.mimeType,
          size_bytes: createdDocument.sizeBytes,
          content_hash: createdDocument.contentHash,
          document_type: createdDocument.documentType,
          ticker: createdDocument.ticker,
          asset_id: createdDocument.assetId,
          status: createdDocument.status,
          created_at: createdDocument.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (blobUrl) {
      try {
        await del(blobUrl);
      } catch (cleanupError) {
        console.error("[documents] falha ao remover blob órfão:", cleanupError);
      }
    }

    if (isUniqueViolation(error)) {
      return jsonError(
        "Este arquivo já foi enviado anteriormente.",
        409,
        "DOCUMENT_ALREADY_EXISTS"
      );
    }

    console.error("[documents] falha no upload:", error);

    return jsonError("Não foi possível salvar o documento.", 500, "DOCUMENT_UPLOAD_FAILED");
  }
}
