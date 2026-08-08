import { documentAnalyses } from "@/db/schema/document-analyses";
import { documents } from "@/db/schema/documents";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const documentEvidence = pgTable(
  "document_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    analysisId: uuid("analysis_id").references(() => documentAnalyses.id, {
      onDelete: "cascade",
    }),

    evidenceType: text("evidence_type").notNull(),
    sourceKind: text("source_kind").notNull(),
    fieldName: text("field_name").notNull(),
    claim: text("claim").notNull(),
    sourceText: text("source_text").notNull(),

    documentHash: text("document_hash").notNull(),
    sourceTextHash: text("source_text_hash").notNull(),
    evidenceHash: text("evidence_hash").notNull(),

    pageNumber: integer("page_number"),
    section: text("section"),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    sequence: integer("sequence").notNull().default(0),

    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index("document_evidence_document_idx").on(table.documentId),
    analysisIdx: index("document_evidence_analysis_idx").on(table.analysisId),
    typeIdx: index("document_evidence_type_idx").on(table.evidenceType),
    hashIdx: index("document_evidence_hash_idx").on(table.evidenceHash),
  })
);

export type DocumentEvidence = typeof documentEvidence.$inferSelect;
export type NewDocumentEvidence = typeof documentEvidence.$inferInsert;
