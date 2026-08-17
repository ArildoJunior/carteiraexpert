CREATE TABLE "subscription_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"origin_asset_id" uuid NOT NULL,
	"right_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"cut_off_date" timestamp with time zone NOT NULL,
	"exercise_start_date" timestamp with time zone NOT NULL,
	"exercise_end_date" timestamp with time zone NOT NULL,
	"exercise_price" numeric(20, 8) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_subscription_offers_origin_asset_id" ON "subscription_offers" ("origin_asset_id");
--> statement-breakpoint
CREATE INDEX "idx_subscription_offers_right_asset_id" ON "subscription_offers" ("right_asset_id");
--> statement-breakpoint
CREATE INDEX "idx_subscription_offers_target_asset_id" ON "subscription_offers" ("target_asset_id");
--> statement-breakpoint
CREATE INDEX "idx_subscription_offers_exercise_end_date" ON "subscription_offers" ("exercise_end_date");
--> statement-breakpoint
CREATE TABLE "subscription_rights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"allocated_quantity" numeric(28, 10) NOT NULL,
	"exercised_quantity" numeric(28, 10) DEFAULT '0.0000000000' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"cancellation_reason" text
);
--> statement-breakpoint
CREATE INDEX "idx_subscription_rights_portfolio_status" ON "subscription_rights" ("portfolio_id", "status");
--> statement-breakpoint
CREATE INDEX "idx_subscription_rights_offer_id" ON "subscription_rights" ("offer_id");
--> statement-breakpoint
CREATE TABLE "subscription_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_right_id" uuid NOT NULL,
	"portfolio_event_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"exercised_quantity" numeric(28, 10) NOT NULL,
	"exercise_price" numeric(20, 8) NOT NULL,
	"fees" numeric(20, 8) DEFAULT '0.00000000' NOT NULL,
	"total_cost" numeric(20, 8) NOT NULL,
	"exercise_date" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_subscription_exercises_subscription_right_id" ON "subscription_exercises" ("subscription_right_id");
--> statement-breakpoint
CREATE INDEX "idx_subscription_exercises_portfolio_event_id" ON "subscription_exercises" ("portfolio_event_id");
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "subscription_offers_origin_asset_id_assets_id_fk" FOREIGN KEY ("origin_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "subscription_offers_right_asset_id_assets_id_fk" FOREIGN KEY ("right_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "subscription_offers_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "subscription_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "subscription_rights_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "subscription_rights_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "subscription_rights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "subscription_exercises_subscription_right_id_subscription_rights_id_fk" FOREIGN KEY ("subscription_right_id") REFERENCES "public"."subscription_rights"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "subscription_exercises_portfolio_event_id_portfolio_events_id_fk" FOREIGN KEY ("portfolio_event_id") REFERENCES "public"."portfolio_events"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "subscription_exercises_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "chk_subscription_offers_dates" CHECK ("exercise_start_date" <= "exercise_end_date");
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD CONSTRAINT "chk_subscription_offers_price" CHECK ("exercise_price" >= 0);
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "chk_subscription_rights_status" CHECK ("status" IN ('ACTIVE', 'PARTIALLY_EXERCISED', 'FULLY_EXERCISED', 'EXPIRED', 'CANCELLED'));
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "chk_subscription_rights_allocated_quantity" CHECK ("allocated_quantity" > 0);
--> statement-breakpoint
ALTER TABLE "subscription_rights" ADD CONSTRAINT "chk_subscription_rights_exercised_quantity" CHECK ("exercised_quantity" >= 0 AND "exercised_quantity" <= "allocated_quantity");
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "uq_subscription_exercises_idempotency" UNIQUE ("subscription_right_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "chk_subscription_exercises_quantity" CHECK ("exercised_quantity" > 0);
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "chk_subscription_exercises_price" CHECK ("exercise_price" >= 0);
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "chk_subscription_exercises_fees" CHECK ("fees" >= 0);
--> statement-breakpoint
ALTER TABLE "subscription_exercises" ADD CONSTRAINT "chk_subscription_exercises_total_cost" CHECK ("total_cost" >= 0);
