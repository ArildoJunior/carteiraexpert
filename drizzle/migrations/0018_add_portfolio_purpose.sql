-- Custom SQL migration file, put you code below! --
DO $$
DECLARE
  invalid_purposes text;
  duplicate_real_users text;
  ambiguous_users text;
BEGIN
  -- 1. Cria a coluna purpose se não existir
  ALTER TABLE "portfolios" ADD COLUMN IF NOT EXISTS "purpose" text;

  -- 2. Pré-Validação: Valores inválidos já presentes na coluna
  SELECT string_agg(DISTINCT purpose, ', ') INTO invalid_purposes
  FROM "portfolios"
  WHERE "purpose" IS NOT NULL AND "purpose" NOT IN ('REAL', 'ESTUDO', 'ANALISE');

  IF invalid_purposes IS NOT NULL THEN
    RAISE EXCEPTION 'Migração 0018 interrompida: foram detectados valores inválidos de finalidade na tabela portfolios: %', invalid_purposes;
  END IF;

  -- 3. Pré-Validação: Usuários com mais de uma carteira já marcada como REAL
  SELECT string_agg(user_id::text, ', ') INTO duplicate_real_users
  FROM (
    SELECT user_id FROM "portfolios"
    WHERE "deleted_at" IS NULL AND "purpose" = 'REAL'
    GROUP BY user_id HAVING count(*) > 1
  ) d_real;

  IF duplicate_real_users IS NOT NULL THEN
    RAISE EXCEPTION 'Migração 0018 interrompida: foram detectados usuários com mais de uma carteira ativa já marcada como REAL. Usuários: %', duplicate_real_users;
  END IF;

  -- 4. Pré-Validação: Usuários com ambiguidade (mais de 1 carteira ativa elegível a REAL)
  SELECT string_agg(user_id::text, ', ') INTO ambiguous_users
  FROM (
    SELECT user_id FROM "portfolios"
    WHERE "deleted_at" IS NULL AND ("purpose" IS NULL OR "purpose" = 'REAL')
    GROUP BY user_id HAVING count(*) > 1
  ) amb;

  IF ambiguous_users IS NOT NULL THEN
    RAISE EXCEPTION 'Migração 0018 interrompida: foram detectados usuários com múltiplas carteiras ativas sem finalidade definida. A classificação deve ser resolvida antes de aplicar a restrição de unicidade. Usuários afetados: %', ambiguous_users;
  END IF;

  -- 5. Atribuição segura para carteiras não excluídas sem finalidade (exatamente 1 por usuário)
  UPDATE "portfolios"
  SET "purpose" = 'REAL'
  WHERE "deleted_at" IS NULL AND "purpose" IS NULL;

  -- 6. Atribuição para carteiras logicamente excluídas (preserva default neutro, fora do índice único)
  UPDATE "portfolios"
  SET "purpose" = 'REAL'
  WHERE "deleted_at" IS NOT NULL AND "purpose" IS NULL;

  -- 7. Aplica NOT NULL e DEFAULT 'REAL'
  ALTER TABLE "portfolios" ALTER COLUMN "purpose" SET DEFAULT 'REAL';
  ALTER TABLE "portfolios" ALTER COLUMN "purpose" SET NOT NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portfolios" ADD CONSTRAINT "chk_portfolios_purpose" CHECK ("purpose" IN ('REAL', 'ESTUDO', 'ANALISE'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_user_real_portfolio"
ON "portfolios" ("user_id")
WHERE "purpose" = 'REAL' AND "deleted_at" IS NULL;
