// db/schema/documents.ts
// Cap 9A — Registro do documento bruto enviado pela equipe interna (admin/editor).

import { assets } from "@/db/schema/assets";
import { users } from "@/db/schema/users";
import { documentStatusEnum, documentTypeEnum } from "@/lib/db/enums";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const documentType = pgEnum("document_type", documentTypeEnum);
export const documentStatus = pgEnum("document_status", documentStatusEnum);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Membro da equipe (role editor/admin) responsavel pelo upload.
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),

    // SHA-256 do conteudo real do arquivo. Unico para permitir cache/lookup (DOC_ANALYSIS_TTL_HOURS).
    contentHash: text("content_hash").notNull().unique(),

    blobUrl: text("blob_url").notNull(),

    documentType: documentType("document_type"),
    ticker: text("ticker"),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),

    // Status TECNICO do pipeline de processamento do arquivo bruto (Cap 9B/9C/9D).
    status: documentStatus("status").notNull().default("uploaded"),
    errorMessage: text("error_message"),

    // Texto extraido (pdfjs-dist no 9B, ou Tesseract no 9C). Populado depois do 9A.
    extractedText: text("extracted_text"),

    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("documents_status_idx").on(t.status),
    uploadedByIdx: index("documents_uploaded_by_idx").on(t.uploadedByUserId),
  })
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
