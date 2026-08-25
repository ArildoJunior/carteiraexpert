-- Migração 0010: Adicionar Preferências de Exibição de Gráficos por Usuário e Área (Fase 06)

CREATE TABLE "user_chart_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chart_area" text NOT NULL,
	"period" text,
	"view_mode" text,
	"grouping_type" text,
	"basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_chart_preferences_user_area" UNIQUE("user_id","chart_area"),
	CONSTRAINT "chk_user_chart_preferences_area" CHECK ("chart_area" IN ('portfolio_evolution', 'dashboard_allocation', 'portfolio_allocation')),
	CONSTRAINT "chk_user_chart_preferences_period" CHECK ("period" IS NULL OR "period" IN ('1M', '3M', '6M', '1Y', 'YTD', 'ALL')),
	CONSTRAINT "chk_user_chart_preferences_view_mode" CHECK ("view_mode" IS NULL OR "view_mode" IN ('comparison', 'market_value', 'cost_basis', 'pnl')),
	CONSTRAINT "chk_user_chart_preferences_grouping_type" CHECK ("grouping_type" IS NULL OR "grouping_type" IN ('asset', 'asset_type', 'portfolio', 'currency')),
	CONSTRAINT "chk_user_chart_preferences_basis" CHECK ("basis" IS NULL OR "basis" IN ('market_value', 'cost_basis'))
);
--> statement-breakpoint
ALTER TABLE "user_chart_preferences" ADD CONSTRAINT "user_chart_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_user_chart_preferences_user_id" ON "user_chart_preferences" USING btree ("user_id");
