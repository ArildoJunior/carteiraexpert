import { documents } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { analyzeDocument, persistDocumentAnalysis } from "@/lib/ai/document-analysis";
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
    return "Falha desconhecida durante o processamento documental.";
  }

  const message = error.message.trim();

  return message ? message.slice(0, 500) : "Falha desconhecida durante o processamento documental.";
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
    name: "Extract and analyze document",
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
          documentType: documents.documentType,
          ticker: documents.ticker,
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

    let processingPhase: "extraction" | "analysis" = "extraction";

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

      processingPhase = "analysis";

      const analysis = await step.run("analyze-document", async () => {
        await logAudit({
          userId: document.uploadedByUserId,
          action: "document.analysis_started",
          resourceType: "document",
          resourceId: documentId,
          metadata: {
            originalName: document.originalName,
          },
        });

        return analyzeDocument({
          text: extracted.text,
          filename: document.originalName,
          documentType: document.documentType,
          ticker: document.ticker,
        });
      });

      if (!analysis) {
        return {
          documentId,
          extracted: true,
          analyzed: false,
          reason: "ai_provider_not_configured",
          characters: extracted.text.length,
        };
      }

      const persisted = await step.run("persist-analysis", async () => {
        return persistDocumentAnalysis({
          documentId,
          userId: document.uploadedByUserId,
          analysis,
        });
      });

      await step.run("audit-analysis", async () => {
        await logAudit({
          userId: document.uploadedByUserId,
          action:
            analysis.provider === "anthropic"
              ? "document.analysis_fallback"
              : "document.analysis_completed",
          resourceType: "document",
          resourceId: documentId,
          metadata: {
            analysisId: persisted.analysisId,
            version: persisted.version,
            provider: analysis.provider,
            model: analysis.model,
            inputTokens: analysis.inputTokens,
            outputTokens: analysis.outputTokens,
            costUsd: analysis.costUsd,
          },
        });
      });

      return {
        documentId,
        extracted: true,
        analyzed: true,
        analysisId: persisted.analysisId,
        analysisVersion: persisted.version,
        provider: analysis.provider,
        characters: extracted.text.length,
      };
    } catch (error) {
      const errorMessage = sanitizeError(error);

      await step.run("persist-processing-error", async () => {
        await db
          .update(documents)
          .set({
            status: "error",
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
      });

      await step.run("audit-processing-error", async () => {
        const analysisFailed = processingPhase === "analysis";

        await logAudit({
          userId: document.uploadedByUserId,
          action: analysisFailed ? "document.analysis_failed" : "document.extraction_failed",
          resourceType: "document",
          resourceId: documentId,
          metadata: {
            mimeType: document.mimeType,
            originalName: document.originalName,
            errorCode: analysisFailed ? "DOCUMENT_PROCESSING_FAILED" : "DOCUMENT_EXTRACTION_FAILED",
            ...(analysisFailed ? { errorMessage } : {}),
          },
        });
      });

      return {
        documentId,
        extracted: false,
        analyzed: false,
        error: errorMessage,
      };
    }
  }
);
