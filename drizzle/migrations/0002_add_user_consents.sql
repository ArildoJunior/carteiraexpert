CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"version" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_user_consents_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'A tabela user_consents é estritamente append-only. Modificações e exclusões não são permitidas.';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint

CREATE TRIGGER enforce_append_only_user_consents
BEFORE UPDATE OR DELETE ON user_consents
FOR EACH ROW
EXECUTE FUNCTION prevent_user_consents_modification();