import { documents } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { extractDocument } from "@/lib/documents/extractor";
import { get } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};

type DocumentEvent = {
  data: {
    documentId: string;
  };
};

function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Falha desconhecida durante a extração.";
  }

  const message = error.message.trim();

  return message ? message.slice(0, 500) : "Falha desconhecida durante a extração.";
}

async function downloadBlob(url: string): Promise<Buffer> {
  const blob = await get(url, {
    access: "public",
    useCache: false,
  });

  if (!blob || blob.statusCode !== 200) {
    throw new Error("Não foi possível baixar o documento armazenado.");
  }

  const arrayBuffer = await new Response(blob.stream).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

export const extractDocumentFunction = inngest.createFunction(
  {
    id: "extract-document",
    name: "Extract document text",
    triggers: [{ event: "document/extract.requested" }],
  },
  async ({ event, step }: { event: DocumentEvent; step: Step }) => {
    const { documentId } = event.data;

    const [document] = await step.run("load-document", async () => {
      return db
        .select({
          id: documents.id,
          uploadedByUserId: documents.uploadedByUserId,
          originalName: documents.originalName,
          mimeType: documents.mimeType,
          blobUrl: documents.blobUrl,
          status: documents.status,
          metadata: documents.metadata,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
    });

    if (!document) {
      return {
        documentId,
        skipped: true,
        reason: "document_not_found",
      };
    }

    const transitioned = await step.run("mark-extracting", async () => {
      return db
        .update(documents)
        .set({
          status: "extracting",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(documents.id, documentId), inArray(documents.status, ["uploaded", "error"])))
        .returning({ id: documents.id });
    });

    if (transitioned.length === 0) {
      return {
        documentId,
        skipped: true,
        reason: "already_processed_or_in_progress",
      };
    }

    try {
      const buffer = await step.run("download-blob", async () => {
        return downloadBlob(document.blobUrl);
      });

      const extracted = await step.run("extract-text", async () => {
        return extractDocument(document.originalName, buffer);
      });

      const previousMetadata =
        document.metadata &&
        typeof document.metadata === "object" &&
        !Array.isArray(document.metadata)
          ? (document.metadata as Record<string, unknown>)
          : {};

      await step.run("persist-extracted-text", async () => {
        await db
          .update(documents)
          .set({
            extractedText: extracted.text,
            metadata: {
              ...previousMetadata,
              extraction: {
                ...extracted.metadata,
                extractedAt: new Date().toISOString(),
                extractedBytes: buffer.length,
              },
            },
            status: "extracted",
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      });

      await step.run("audit-extracted", async () => {
        await logAudit({
          userId: document.uploadedByUserId,
          action: "document.extracted",
          resourceType: "document",
          resourceId: documentId,
          metadata: {
            mimeType: document.mimeType,
            originalName: document.originalName,
            extractedBytes: buffer.length,
            extractionMetadata: extracted.metadata,
          },
        });
      });

      return {
        documentId,
        extracted: true,
        characters: extracted.text.length,
      };
    } catch (error) {
      const errorMessage = sanitizeError(error);

      await step.run("persist-extraction-error", async () => {
        await db
          .update(documents)
          .set({
            status: "error",
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      });

      await step.run("audit-extraction-error", async () => {
        await logAudit({
          userId: document.uploadedByUserId,
          action: "document.extraction_failed",
          resourceType: "document",
          resourceId: documentId,
          metadata: {
            mimeType: document.mimeType,
            originalName: document.originalName,
            errorCode: "DOCUMENT_EXTRACTION_FAILED",
          },
        });
      });

      return {
        documentId,
        extracted: false,
        error: errorMessage,
      };
    }
  }
);
