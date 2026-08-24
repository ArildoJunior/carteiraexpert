CREATE TABLE "billing_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"provider" text DEFAULT 'internal' NOT NULL,
	"provider_subscription_id" text,
	"provider_customer_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_billing_subscriptions_status" CHECK ("status" IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
	CONSTRAINT "chk_billing_subscriptions_cycle" CHECK ("billing_cycle" IN ('monthly', 'yearly', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"idempotency_key" text NOT NULL,
	"event_type" text NOT NULL,
	"provider" text DEFAULT 'internal' NOT NULL,
	"provider_event_id" text,
	"amount" numeric(18, 4),
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payment_events_idempotency_key" UNIQUE("idempotency_key"),
	CONSTRAINT "chk_payment_events_status" CHECK ("status" IN ('received', 'processed', 'failed', 'ignored'))
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_billing_subscriptions_user_id" ON "billing_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_billing_subscriptions_provider_sub_id" ON "billing_subscriptions" USING btree ("provider_subscription_id");
--> statement-breakpoint
CREATE INDEX "idx_payment_events_user_id" ON "payment_events" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_payment_events_sub_id" ON "payment_events" USING btree ("subscription_id");
