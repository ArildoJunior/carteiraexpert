ALTER TABLE "portfolio_events" ADD COLUMN "direction" text;
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "chk_portfolio_events_direction" CHECK (("type" = 'MANUAL_ADJUSTMENT' AND "direction" IS NOT NULL AND "direction" IN ('IN', 'OUT')) OR ("type" <> 'MANUAL_ADJUSTMENT' AND "direction" IS NULL));
