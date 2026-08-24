-- Migração 0009: Adicionar Plano Compartilhado, Grupos, Membros e Convites (Pacote 05.04)

ALTER TABLE "commercial_plans" ALTER COLUMN "max_active_portfolios" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_plans" DROP CONSTRAINT IF EXISTS "chk_commercial_plans_max_portfolios";
--> statement-breakpoint
ALTER TABLE "commercial_plans" ADD CONSTRAINT "chk_commercial_plans_max_portfolios" CHECK ("max_active_portfolios" IS NULL OR "max_active_portfolios" > 0);
--> statement-breakpoint
INSERT INTO "commercial_plans" ("id", "name", "description", "max_active_portfolios", "is_active")
VALUES ('shared', 'Plano Compartilhado', 'Assinatura comercial compartilhada para até 5 pessoas (1 titular + até 4 membros).', NULL, true)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "max_active_portfolios" = EXCLUDED."max_active_portfolios",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = NOW();
--> statement-breakpoint
CREATE TABLE "billing_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"plan_id" text NOT NULL,
	"name" text NOT NULL,
	"max_members" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_billing_groups_owner_user_id" UNIQUE("owner_user_id"),
	CONSTRAINT "chk_billing_groups_max_members" CHECK ("max_members" = 5),
	CONSTRAINT "chk_billing_groups_status" CHECK ("status" IN ('active', 'suspended', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "billing_group_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"left_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_group_members_role" CHECK ("role" IN ('owner', 'member')),
	CONSTRAINT "chk_group_members_status" CHECK ("status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "billing_group_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_group_invitations_token_hash" UNIQUE("token_hash"),
	CONSTRAINT "chk_group_invitations_status" CHECK ("status" IN ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "billing_groups" ADD CONSTRAINT "billing_groups_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_groups" ADD CONSTRAINT "billing_groups_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_groups" ADD CONSTRAINT "billing_groups_plan_id_commercial_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_group_members" ADD CONSTRAINT "billing_group_members_group_id_billing_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."billing_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_group_members" ADD CONSTRAINT "billing_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_group_invitations" ADD CONSTRAINT "billing_group_invitations_group_id_billing_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."billing_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_group_invitations" ADD CONSTRAINT "billing_group_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_group_invitations" ADD CONSTRAINT "billing_group_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_billing_groups_owner_user_id" ON "billing_groups" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "idx_billing_groups_subscription_id" ON "billing_groups" USING btree ("subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_user_group_membership" ON "billing_group_members" USING btree ("user_id") WHERE status = 'active';
--> statement-breakpoint
CREATE INDEX "idx_group_members_group_id" ON "billing_group_members" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "idx_group_members_user_id" ON "billing_group_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pending_group_invite_email" ON "billing_group_invitations" USING btree ("group_id","invited_email") WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX "idx_group_invitations_group_id" ON "billing_group_invitations" USING btree ("group_id");
--> statement-breakpoint
CREATE INDEX "idx_group_invitations_invited_email" ON "billing_group_invitations" USING btree ("invited_email");
--> statement-breakpoint
CREATE INDEX "idx_group_invitations_token_hash" ON "billing_group_invitations" USING btree ("token_hash");
