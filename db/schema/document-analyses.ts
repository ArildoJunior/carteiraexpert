// db/schema/document-analyses.ts
// Cap 9A — Resultado da analise por IA. Relacao 1:N com documents (versionamento).
// O status EDITORIAL (draft/review/approved/published/rejected) vive aqui,
// pois cada versao de analise percorre seu proprio pipeline de revisao.

import { documentType, documents } from "@/db/schema/documents";
import { users } from "@/db/schema/users";
import { aiProviderEnum, editorialStatusEnum, sentimentEnum } from "@/lib/db/enums";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const editorialStatus = pgEnum("editorial_status", editorialStatusEnum);
export const sentiment = pgEnum("sentiment", sentimentEnum);
export const aiProvider = pgEnum("ai_provider", aiProviderEnum);

export const documentAnalyses = pgTable(
  "document_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),

    // Reutiliza o mesmo enum de documents.documentType.
    detectedType: documentType("detected_type"),
    keyMetrics: jsonb("key_metrics"),
    summary: text("summary"),
    attentionPoints: jsonb("attention_points"),
    sentiment: sentiment("sentiment"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),

    provider: aiProvider("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),

    // Pipeline EDITORIAL, por versao.
    editorialStatus: editorialStatus("editorial_status").notNull().default("draft"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqDocVersion: uniqueIndex("document_analyses_document_version_idx").on(
      t.documentId,
      t.version
    ),
    editorialStatusIdx: index("document_analyses_editorial_status_idx").on(t.editorialStatus),
  })
);

export type DocumentAnalysis = typeof documentAnalyses.$inferSelect;
export type NewDocumentAnalysis = typeof documentAnalyses.$inferInsert;
