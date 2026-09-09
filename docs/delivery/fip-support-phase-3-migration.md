# Fase 3 — Migração dos ativos FIP

- **Data:** 2026-09-09
- **Status:** Concluída
- **Módulo / Domínio:** Catálogo Canônico de Ativos (`src/modules/catalog/`)
- **Natureza:** Operação de dados / Migração transacional de classificação patrimonial

---

## 1. Resumo

- Auditoria realizada em modo somente leitura.
- Foram identificados 24 ativos com evidências nominais relacionadas a FIP.
- 23 ativos foram confirmados como FIP.
- FIPC11 foi excluído por ser FIA IP.COM - CI, não FIP.
- A migração foi executada no banco principal dentro de transação protegida.
- Foram alteradas exatamente 23 linhas.
- O asset_type dos 23 ativos foi atualizado para 'fip'.
- Os status dos ativos foram preservados, incluindo os registros 'delisted'.
- FIPC11 permaneceu como 'etf'.
- Nenhum ativo customizado foi alterado.
- Não houve rollback.
- Nenhum schema, rota ou código de produção foi modificado.
- Nenhum teste foi executado.
- Nenhum commit ou push foi realizado como parte da migração.

---

## 2. Ativos Migrados

Os seguintes 23 ativos foram atualizados para `asset_type = 'fip'`:

- `AATH11`
- `BDIV11`
- `BKOI11` (status `delisted` preservado)
- `BRCP11` (status `delisted` preservado)
- `BRZP11`
- `COPN11`
- `EGIS11`
- `ENDD11`
- `ESUD11` (anteriormente classificado como `fii` via BDI 58)
- `ESUT11` (anteriormente classificado como `fii` via BDI 58)
- `ESUU11` (anteriormente classificado como `fii` via BDI 58)
- `FCCQ11` (status `delisted` preservado)
- `FPOR11`
- `KNOX11`
- `NVRP11`
- `PFIN11`
- `PICE11`
- `PICE12`
- `PPEI11`
- `RZDL11`
- `VIGT11`
- `XPIE11`
- `XPOM11` (status `delisted` preservado)

---

## 3. Exceção Documentada

- **Ticker:** `FIPC11`
- **Classificação:** Permanece inalterado com `asset_type = 'etf'`.
- **Nome Oficial no Banco:** `FIA IP.COM - CI`
- **Status:** `delisted`
- **Motivo da Exclusão:** Colisão sintática do ticker com o prefixo "FIP"; o instrumento oficial é um Fundo de Investimento em Ações (FIA), e não um Fundo de Investimento em Participações. Tratamento alinhado às regras canônicas de domínio implementadas em `canonical-classifier.ts` (`CLASS_AMBIGUITY` / `PENDING_REVIEW`).

---

## 4. Controles de Segurança e Governança

1. **Pré-validação estrita (somente leitura):**
   - Confirmou exatamente 23 ativos-alvo no catálogo canônico global.
   - Confirmou que nenhum alvo possuía `is_custom = true`.
   - Confirmou que 20 ativos estavam como `asset_type = 'etf'` e 3 ativos (`ESUD11`, `ESUT11`, `ESUU11`) estavam como `asset_type = 'fii'`.
   - Confirmou que a contagem prévia de ativos com `asset_type = 'fip'` era exatamente 0.
2. **Isolamento transacional:**
   - Adquiriu `pg_advisory_xact_lock(424242)` para garantia de exclusão mútua e concorrência segura.
   - Restringiu o `UPDATE` exclusivamente aos 23 tickers autorizados com `is_custom = false`.
   - Preservou integralmente campos cadastrais, ISIN, status e chaves primárias.
3. **Validação atômica pós-UPDATE (em transação):**
   - Verificou que exatamente 23 linhas foram afetadas.
   - Confirmou que todos os 23 ativos receberam `asset_type = 'fip'`.
   - Confirmou ausência de resíduos com `asset_type` anterior (`etf` ou `fii`) entre os alvos.
   - Confirmou que `FIPC11` permaneceu intocado como `etf`.
   - Confirmou que nenhum ativo customizado foi afetado.
4. **Pós-validação pós-COMMIT (somente leitura):**
   - Total final de ativos com `asset_type = 'fip'` no banco principal: **23**.
   - Total de ativos customizados com `asset_type = 'fip'`: **0**.
   - Preservação comprovada de `FIPC11` como `etf`.
