-- Migration 0024: Adiciona índice composto em b3_historical_quotes (bdi_code, trade_date DESC)
-- Otimiza consultas do catálogo público por categoria (BDI) e data máxima do pregão.
-- NÃO EXECUTAR AUTOMATICAMENTE SEM AUTORIZAÇÃO EXPLÍCITA.

CREATE INDEX IF NOT EXISTS "idx_b3_quotes_bdi_trade_date" ON "b3_historical_quotes" ("bdi_code", "trade_date" DESC);
