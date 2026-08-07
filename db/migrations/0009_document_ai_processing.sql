-- Processamento documental com análise por IA.
-- A tabela e os campos principais já existem na migration 0006.
-- Esta migration apenas adiciona índices auxiliares para consultas do pipeline.

CREATE INDEX IF NOT EXISTS "document_analyses_document_created_idx"
  ON "document_analyses" USING btree ("document_id", "created_at");

CREATE INDEX IF NOT EXISTS "ai_costs_year_month_idx"
  ON "ai_costs" USING btree ("year_month");

CREATE INDEX IF NOT EXISTS "ai_costs_provider_idx"
  ON "ai_costs" USING btree ("provider");