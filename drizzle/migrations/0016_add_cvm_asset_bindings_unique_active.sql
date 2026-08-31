-- Migration 0016: Adiciona índice único parcial determinístico para unicidade ativa de vínculos CVM/B3
-- Garante que um asset_id não possa possuir mais de um vínculo com status 'APPROVED' simultâneo.

DO $$
DECLARE
  v_table_oid oid;
  v_conflict_count integer;
  v_wrong_table_count integer;
  v_index_oid oid;
  v_is_unique boolean;
  v_indnatts smallint;
  v_attname text;
  v_is_expression boolean;
  v_predicate text;
  v_dep_count integer;
  v_status_dep_count integer;
  v_asset_id_dep_count integer;
  v_foreign_deps_count integer;
BEGIN
  -- 1. Serialização de execução concorrente via advisory transaction lock
  PERFORM pg_advisory_xact_lock(hashtextextended('public.cvm_company_assets.uq_cvm_company_assets_single_active_approved', 0));

  -- 2. Resolução determinística do OID da tabela public.cvm_company_assets
  SELECT t.oid INTO v_table_oid
  FROM pg_class t
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'cvm_company_assets'
    AND t.relkind IN ('r', 'p');

  IF NOT FOUND OR v_table_oid IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_0016_ABORTED: A tabela public.cvm_company_assets nao existe no schema public.';
  END IF;

  -- 3. Verificação de integridade de dados: nenhum conflito de vínculos APPROVED duplicados pode existir
  SELECT COUNT(*) INTO v_conflict_count
  FROM (
    SELECT asset_id
    FROM public.cvm_company_assets
    WHERE status = 'APPROVED'
    GROUP BY asset_id
    HAVING COUNT(*) > 1
  ) conflicts;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_0016_ABORTED: Encontrados % asset_ids com multiplos vinculos APPROVED conflitantes na tabela public.cvm_company_assets.', v_conflict_count;
  END IF;

  -- 4. Verificação de objetos anômalos no schema public associados a outra tabela
  SELECT COUNT(*) INTO v_wrong_table_count
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'uq_cvm_company_assets_single_active_approved'
    AND i.indrelid <> v_table_oid;

  IF v_wrong_table_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved no schema public esta associado a outra tabela (esperado: public.cvm_company_assets).';
  END IF;

  -- 5. Consulta estrutural estrita nos catálogos relacionais do PostgreSQL para o índice em public.cvm_company_assets
  SELECT
    c.oid,
    i.indisunique,
    i.indnatts,
    a.attname,
    (i.indexprs IS NOT NULL),
    pg_get_expr(i.indpred, i.indrelid)
  INTO
    v_index_oid,
    v_is_unique,
    v_indnatts,
    v_attname,
    v_is_expression,
    v_predicate
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid = v_table_oid AND a.attnum = i.indkey[0]
  WHERE n.nspname = 'public'
    AND c.relname = 'uq_cvm_company_assets_single_active_approved'
    AND i.indrelid = v_table_oid;

  IF FOUND THEN
    -- Validação estrutural de cada elemento do índice existente:
    
    -- a) Unicidade
    IF v_is_unique IS NOT TRUE THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved existe mas nao e UNIQUE.';
    END IF;

    -- b) Contagem de colunas indexadas
    IF v_indnatts <> 1 THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved indexa % colunas, esperava exatamente 1.', v_indnatts;
    END IF;

    -- c) Coluna indexada (asset_id pertencente a public.cvm_company_assets)
    IF v_attname <> 'asset_id' THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved indexa a coluna %, esperava asset_id.', v_attname;
    END IF;

    -- d) Não é expressão
    IF v_is_expression IS TRUE THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved e baseado em expressao indevida.';
    END IF;

    -- e) Predicado parcial existente
    IF v_predicate IS NULL THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice uq_cvm_company_assets_single_active_approved nao possui predicado parcial WHERE.';
    END IF;

    -- f) Validação estrutural das dependências de colunas no pg_depend
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE a.attname = 'asset_id'),
      COUNT(*) FILTER (WHERE a.attname = 'status'),
      COUNT(*) FILTER (WHERE a.attname NOT IN ('asset_id', 'status') OR d.refobjid <> v_table_oid)
    INTO
      v_dep_count,
      v_asset_id_dep_count,
      v_status_dep_count,
      v_foreign_deps_count
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.objid = v_index_oid AND d.deptype = 'a';

    IF v_asset_id_dep_count <> 1 THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice nao possui dependencia valida com a coluna asset_id da tabela public.cvm_company_assets.';
    END IF;

    IF v_status_dep_count <> 1 THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O predicado do indice nao referencia a coluna status da tabela public.cvm_company_assets.';
    END IF;

    IF v_foreign_deps_count > 0 OR v_dep_count <> 2 THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O indice contem dependencias de colunas adicionais nao autorizadas no predicado ou definicao (total_deps=%, foreign_deps=%).',
        v_dep_count, v_foreign_deps_count;
    END IF;

    -- g) Validação da representação textual normalizada do predicado
    IF regexp_replace(v_predicate, '\s+', ' ', 'g') NOT IN ('(status = ''APPROVED''::text)', '(status = ''APPROVED''::character varying)', '(status = ''APPROVED'')') THEN
      RAISE EXCEPTION 'MIGRATION_0016_ABORTED: O predicado do indice existente e divergente: % (esperado: (status = ''APPROVED''::text)).', v_predicate;
    END IF;

  ELSE
    -- 6. Criação determinística do índice único parcial no schema public
    CREATE UNIQUE INDEX uq_cvm_company_assets_single_active_approved
    ON public.cvm_company_assets (asset_id)
    WHERE status = 'APPROVED';
  END IF;
END $$;
