CREATE INDEX IF NOT EXISTS "document_analyses_editorial_status_idx" ON "document_analyses" USING btree ("editorial_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_uploaded_by_idx" ON "documents" USING btree ("uploaded_by_user_id");