import { createHash } from "node:crypto";
import { z } from "zod";

export const evidenceTypeEnum = [
  "fact",
  "metric",
  "interpretation",
  "risk",
  "attention_point",
] as const;

export const sourceKindEnum = [
  "extracted_text",
  "document_metadata",
  "table",
  "page",
  "section",
] as const;

export const documentEvidenceSchema = z
  .object({
    documentId: z.string().uuid(),
    analysisId: z.string().uuid().nullable().optional(),

    evidenceType: z.enum(evidenceTypeEnum),
    sourceKind: z.enum(sourceKindEnum),
    fieldName: z.string().trim().min(1).max(120),
    claim: z.string().trim().min(1).max(2000),
    sourceText: z.string().trim().min(1).max(10000),

    documentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    sourceTextHash: z.string().regex(/^[a-f0-9]{64}$/i),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/i),

    pageNumber: z.number().int().positive().nullable().optional(),
    section: z.string().trim().min(1).max(500).nullable().optional(),
    startOffset: z.number().int().nonnegative().nullable().optional(),
    endOffset: z.number().int().nonnegative().nullable().optional(),
    sequence: z.number().int().nonnegative().default(0),

    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.startOffset !== null &&
      value.startOffset !== undefined &&
      value.endOffset !== null &&
      value.endOffset !== undefined &&
      value.endOffset < value.startOffset
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endOffset"],
        message: "endOffset deve ser maior ou igual a startOffset.",
      });
    }
  });

export type DocumentEvidenceInput = z.input<typeof documentEvidenceSchema>;
export type DocumentEvidencePayload = z.output<typeof documentEvidenceSchema>;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildEvidenceHashes(params: {
  documentHash: string;
  sourceText: string;
  claim: string;
  fieldName: string;
  sequence?: number;
}) {
  const sourceTextHash = sha256(params.sourceText);
  const evidenceHash = sha256(
    [
      params.documentHash,
      sourceTextHash,
      params.claim,
      params.fieldName,
      params.sequence ?? 0,
    ].join("|")
  );

  return {
    documentHash: params.documentHash,
    sourceTextHash,
    evidenceHash,
  };
}
