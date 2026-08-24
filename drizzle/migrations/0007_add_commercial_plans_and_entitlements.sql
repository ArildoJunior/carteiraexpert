CREATE TABLE "commercial_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_active_portfolios" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_commercial_plans_max_portfolios" CHECK ("max_active_portfolios" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_entitlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"feature_code" text NOT NULL,
	"feature_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_plans_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "chk_user_plans_status" CHECK ("status" IN ('active', 'cancelled', 'past_due'))
);
--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "chk_portfolios_status" CHECK ("status" IN ('active', 'archived', 'frozen'));
--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_plans" ADD CONSTRAINT "user_plans_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_entitlements_plan_feature" ON "plan_entitlements" USING btree ("plan_id","feature_code");
--> statement-breakpoint
INSERT INTO "commercial_plans" ("id", "name", "description", "max_active_portfolios", "is_active")
VALUES 
  ('free', 'Plano Free', 'Gestão individual essencial com até 2 carteiras ativas.', 2, true),
  ('pro', 'Plano Pro', 'Capacidade expandida com até 10 carteiras ativas.', 10, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "max_active_portfolios" = EXCLUDED."max_active_portfolios",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = NOW();
