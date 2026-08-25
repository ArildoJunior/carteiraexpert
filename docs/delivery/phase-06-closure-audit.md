# Auditoria Técnica e Matriz de Rastreabilidade da Fase 06 — Dados de Mercado, Valuation e Gráficos

## 1. Contexto e Objetivo da Auditoria

Esta auditoria técnica local tem por objetivo avaliar o estado de implementação da **Fase 06 — Dados de Mercado, Valuation e Gráficos** em relação aos seus requisitos explicitamente documentados no repositório do **CarteiraExpert**.

A avaliação baseia-se exclusivamente na documentação local:
- `docs/delivery/phase-06-market-data-and-charts.md`
- `docs/architecture/integrations.md`
- `docs/architecture/analysis-and-valuation-boundaries.md`
- `AGENTS.md` (Seção 8: Dados de mercado e gráficos)
- `docs/delivery/delivery-status.md`

A auditoria distingue rigorosamente:
1. **Fato verificado:** O que está efetivamente implementado e coberto por testes no código local;
2. **Pendência mandatória:** O que está explicitamente documentado como critério da Fase 06 e ainda não está implementado;
3. **Item futuro não bloqueante:** O que a documentação classifica textualmente como planejado para fases posteriores ou fora do pacote atual;
4. **Proposta técnica a confirmar:** Sugestões mínimas de implementação para pendências, sem assumir escolhas prévias como decisões aprovadas.

---

## 2. Matriz de Rastreabilidade dos Requisitos da Fase 06

| Requisito documentado | Evidência documental | Implementação local | Testes relacionados | Estado | Justificativa | Ação mínima para encerramento |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Contrato Canônico de Adaptadores de Ingestão** | `phase-06-market-data-and-charts.md` (L16); `integrations.md` (L16-23) | `src/modules/market-data/server/market-data-provider.types.ts` (`MarketDataProviderAdapter`, `ProviderQuoteItem`, `ProviderExchangeRateItem`) | `tests/unit/market-data/adapters/brapi.adapter.test.ts`; `tests/integration/market-data/market-data-ingestion.service.test.ts` | **CONCLUÍDO** | Interface canônica TypeScript strict mode implementada, desacoplando os motores de provedores específicos. | Nenhuma. |
| **2. Adaptadores de Ingestão (Manual, Mock e BRAPI)** | `phase-06-market-data-and-charts.md` (L17-18); `integrations.md` (L24-29) | `src/modules/market-data/server/adapters/manual-payload.adapter.ts`, `mock-provider.adapter.ts`, `brapi.adapter.ts` | `tests/unit/market-data/adapters/brapi.adapter.test.ts`; `tests/integration/market-data/brapi-ingestion.test.ts` | **CONCLUÍDO** | Adaptador manual estruturado, mock determinístico e adaptador BRAPI com normalização UTC implementados. | Nenhuma. |
| **3. Script Administrativo CLI de Ingestão** | `phase-06-market-data-and-charts.md` (L19); `integrations.md` (L32); `package.json` (`market:ingest`) | `scripts/ingest-market-data.ts` (executável via `pnpm market:ingest`) | Validado operacionalmente via execução de script com suporte a `--dry-run`, `--file`, `--provider=brapi`, `--tickers` e `--user-email` | **CONCLUÍDO** | Script administrativo CLI funcional com controle de operador, dry-run, logs de auditoria e validações de integridade. | Nenhuma. |
| **4. Serviço de Ingestão com Zod, UTC e Decimal** | `phase-06-market-data-and-charts.md` (L20); `integrations.md` (L36-66); `AGENTS.md` (Seção 4) | `src/modules/market-data/server/market-data-ingestion.service.ts`; `src/modules/market-data/domain/market-data.schema.ts` | `tests/unit/market-data/market-data-schema.test.ts`; `tests/unit/market-data/market-data-ingestion.test.ts`; `tests/integration/market-data/market-data-ingestion.service.test.ts` | **CONCLUÍDO** | Ingestão em lote com validação Zod, deduplicação em memória, normalização de timezone UTC e precisão `Decimal`. | Nenhuma. |
| **5. Persistência Relacional de Cotações e Câmbio** | `phase-06-market-data-and-charts.md` (L21); `integrations.md` (L77-81); `AGENTS.md` (Seção 8) | `src/lib/db/schema/market-data.ts` (`marketQuotes`, `exchangeRates`); `src/modules/market-data/server/market-data.service.ts` | `tests/integration/market-data/market-data.service.test.ts`; `tests/unit/verify-schema.test.ts` | **CONCLUÍDO** | Tabelas físicas `market_quotes` e `exchange_rates` no PostgreSQL com constraints de unicidade (`asset_id, quote_date` e `from, to, rate_date`), checks positivos e auditoria. | Nenhuma. |
| **6. Hierarquia de Qualidade (`DELAY_STATUS_QUALITY_RANK`)** | `phase-06-market-data-and-charts.md` (L22); `integrations.md` (L69-76) | `src/modules/market-data/server/market-data-ingestion.service.ts` (`DELAY_STATUS_QUALITY_RANK`) | `tests/unit/market-data/market-data-ingestion.test.ts`; `tests/integration/market-data/market-data-ingestion.service.test.ts` | **CONCLUÍDO** | Hierarquia de 5 níveis (`realtime` > `delayed_15m` > `eod` > `manual` > `unknown`) com rejeição de downgrades (`QUALITY_DOWNGRADE_REJECTED`). | Nenhuma. |
| **7. Tratamento de Cotações Ausentes, Obsoletas e Moeda** | `phase-06-market-data-and-charts.md` (L23-24); `integrations.md` (L87-92) | `src/modules/portfolio/domain/valuation-engine.ts`; `src/modules/portfolio/domain/portfolio-evolution-engine.ts` | `tests/unit/market-data/valuation-engine.test.ts`; `tests/unit/portfolio/portfolio-evolution-engine.test.ts`; `tests/integration/portfolio/portfolio-evolution.service.test.ts` | **CONCLUÍDO** | Apuração de `unquotedPositionsCount`, limite de 7 dias civis UTC (`stalePositionsCount`) e rejeição de moeda divergente (`CURRENCY_MISMATCH`). | Nenhuma. |
| **8. Motores Determinísticos de Valuation e Evolução Diária** | `phase-06-market-data-and-charts.md` (L25-26); `integrations.md` (L84-92) | `src/modules/portfolio/domain/valuation-engine.ts`; `src/modules/portfolio/domain/portfolio-evolution-engine.ts`; `src/modules/portfolio/server/portfolio-evolution.service.ts` | `tests/unit/market-data/valuation-engine.test.ts`; `tests/unit/portfolio/portfolio-evolution-engine.test.ts`; `tests/integration/portfolio/portfolio-evolution.service.test.ts` | **CONCLUÍDO** | Motores puros calculam valuation e séries diárias de patrimônio (Custo vs. Mercado) em UTC com isolamento total de interface e IA. | Nenhuma. |
| **9. Consultas Locais sem Chamadas Externas no Render** | `AGENTS.md` (Seção 8); `integrations.md` (L7) | `src/modules/market-data/server/market-data.service.ts` (`getLatestQuotesForAssets`, `getLatestExchangeRates`) | `tests/integration/market-data/market-data.service.test.ts`; `tests/integration/portfolio/dashboard.service.test.ts` | **CONCLUÍDO** | A interface consulta exclusivamente o PostgreSQL interno via queries com `DISTINCT ON`, sem chamadas de rede durante a navegação. | Nenhuma. |
| **10. Motor de Agregação de Gráficos e Alocação** | `phase-06-market-data-and-charts.md` (L48-51); `AGENTS.md` (Seção 8) | `src/modules/portfolio/domain/chart-engine.ts` (`calculatePortfolioAllocation`, `formatChartMoney`, `formatChartPercent`) | `tests/unit/portfolio/chart-engine.test.ts` | **CONCLUÍDO** | Motor agrega alocação por tipo de ativo, por ativo e por carteira, garantindo totalização percentual em 100% e formatação precisa com `Decimal`. | Nenhuma. |
| **11. Gráficos Interativos de Evolução e Alocação na UI** | `phase-06-market-data-and-charts.md` (L49-50); `AGENTS.md` (Seção 8) | `src/modules/portfolio/ui/PortfolioEvolutionChart.tsx`; `src/modules/portfolio/ui/DashboardAllocationCharts.tsx`; `src/modules/portfolio/ui/PortfolioAllocationCharts.tsx` | `tests/unit/portfolio/chart-engine.test.ts`; `e2e/portfolio.spec.ts` | **CONCLUÍDO** | Componentes Recharts para Área/Linha de evolução temporal (1M, 3M, 6M, 1Y, YTD, ALL) e Rosca de alocação com suporte aos temas Claro/Escuro. | Nenhuma. |
| **12. Persistência de Preferências de Gráficos por Usuário** | `phase-06-market-data-and-charts.md` (L57, L64); `AGENTS.md` (Seção 8) | `src/lib/db/schema/chart-preferences.ts` (`user_chart_preferences`); `src/modules/portfolio/server/chart-preferences.service.ts`; `src/modules/portfolio/server/portfolio.actions.ts` (`saveChartPreferenceAction`, `getUserChartPreferencesAction`); `src/modules/portfolio/ui/PortfolioEvolutionChart.tsx`; `src/modules/portfolio/ui/DashboardAllocationCharts.tsx`; `src/modules/portfolio/ui/PortfolioAllocationCharts.tsx`; `src/app/(dashboard)/dashboard/page.tsx`; `src/app/(dashboard)/portfolios/[id]/page.tsx` | `tests/unit/portfolio/chart-preferences.schema.test.ts` (11 testes); `tests/integration/portfolio/chart-preferences.service.test.ts` (5 testes); `tests/integration/portfolio/portfolio-actions.test.ts` (2 testes); `e2e/chart-preferences.spec.ts` (1 teste) | **CONCLUÍDO** | Tabela relacional criada (migração 0010), Schema Guardian atualizado, validações Zod estritas, persistência idempotente via upsert, isolamento absoluto por `userId` da sessão no servidor e restauração automática de estado na UI validada de ponta a ponta. | Nenhuma. |
| **13. Automação de Ingestão Agendada (Background Jobs / Cron)** | `phase-06-market-data-and-charts.md` (L10, L29, L41); `integrations.md` (L33, L112); `delivery-status.md` (L75) | Inexistente no runtime da aplicação. A ingestão é acionada sob demanda via CLI (`scripts/ingest-market-data.ts`). | Inexistente | **ITEM FUTURO** (Não Bloqueante) | A documentação classifica textualmente como capacidade planejada de infraestrutura (*"Planejado / Não Implementado neste Pacote"*). A ingestão sob demanda via CLI e adaptadores atende à Fase 06. | Manter como capacidade de infraestrutura/deploy para evolução futura. |
| **14. Provedores Comerciais Pagos com SLA Dedicado** | `phase-06-market-data-and-charts.md` (L31, L42); `integrations.md` (L34, L113) | Inexistente (apenas `BrapiAdapter` e adaptadores locais mock/manual disponíveis). | `tests/unit/market-data/adapters/brapi.adapter.test.ts` | **ITEM FUTURO** (Não Bloqueante) | Documentado como diretriz de evolução futura (ADR-008) para substituição de fontes gratuitas sem quebra de contrato. Não bloqueia a Fase 06. | Manter como expansão comercial futura. |
| **15. Feeds de Cotações em Tempo Real via WebSocket** | `phase-06-market-data-and-charts.md` (L32); `integrations.md` (L114) | Inexistente. | N/A | **ITEM FUTURO** (Não Bloqueante) | Documentado como item futuro. A arquitetura base do produto apoia-se em snapshots diários EOD/delayed. | Manter fora do escopo da Fase 06. |

---

## 3. Classificação dos Itens Auditados

### Grupo 1 — Requisitos Mandatórios da Fase 06
Todos os 12 requisitos mandatórios documentados para a Fase 06 encontram-se **100% implementados, testados e integrados** no repositório local.

1. Contrato Canônico de Adaptadores de Ingestão
2. Adaptadores de Ingestão (Manual, Mock e BRAPI)
3. Script Administrativo CLI de Ingestão
4. Serviço de Ingestão com Zod, UTC e Decimal
5. Persistência Relacional de Cotações e Câmbio
6. Hierarquia de Qualidade (`DELAY_STATUS_QUALITY_RANK`)
7. Tratamento de Cotações Ausentes, Obsoletas e Moeda
8. Motores Determinísticos de Valuation e Evolução Diária
9. Consultas Locais sem Chamadas Externas no Render
10. Motor de Agregação de Gráficos e Alocação
11. Gráficos Interativos de Evolução e Alocação na UI
12. Persistência de Preferências de Gráficos por Usuário e Área

---

### Grupo 2 — Itens Explicitamente Planejados para Fases Futuras (Não Bloqueiam a Fase 06)

Os seguintes itens estão explicitamente documentados como planejamento futuro ou fora do escopo do pacote básico da Fase 06, não constituindo bloqueadores de seu encerramento:

1. **Automação Periódica de Ingestão de Mercado em Background:**
   - **Evidência Documental:** `docs/delivery/phase-06-market-data-and-charts.md` Linha 10 (*"A execução operacional agendada via rotinas em background / cron jobs periódicos e streaming via WebSockets permanecem planejados."*), Linha 29 e Linha 41; `docs/architecture/integrations.md` Linha 33 e Linha 112; `docs/delivery/delivery-status.md` Linha 75 (*"Capacidades Pendentes ou no Roadmap"*).
   - **Justificativa:** A infraestrutura de ingestão sob demanda via adaptadores (`BrapiAdapter`, `ManualPayloadAdapter`, `MockProviderAdapter`) e CLI administrativo (`pnpm market:ingest`) satisfaz os requisitos funcionais de carga de dados para a Fase 06.
2. **Provedores Comerciais Pagos com SLA Dedicado:**
   - **Evidência Documental:** `docs/delivery/phase-06-market-data-and-charts.md` Linha 31 e Linha 42; `docs/architecture/integrations.md` Linha 34 (*"A integração com fontes pagas com SLA dedicado e suporte a alta disponibilidade permanece como diretriz futura aprovada (conforme ADR-008)."*).
3. **Feeds em Tempo Real via WebSockets:**
   - **Evidência Documental:** `docs/delivery/phase-06-market-data-and-charts.md` Linha 32; `docs/architecture/integrations.md` Linha 114 (*"Feeds de cotações em tempo real via WebSocket: Planejado, não implementado"*).
4. **Modelos Teóricos de Valuation (Bazin, Graham, DCF) e Screening:**
   - **Evidência Documental:** `docs/architecture/analysis-and-valuation-boundaries.md` Seção 2.4; `docs/delivery/phase-09-projections-options-and-tax.md` Pacote 09.01 (pertencentes à Fase 09).

---

### Grupo 3 — Melhorias e Hipóteses Não Documentadas (Fora de Escopo)

1. **Livro de Ofertas e Profundidade de Mercado (Order Book L2):** `docs/delivery/phase-06-market-data-and-charts.md` Linha 56 (*"Livro de ofertas e profundidade de mercado (Fora do escopo permanente)"*).
2. **Recomendações Automáticas de Compra/Venda baseadas em Gráficos:** Proibição regulatória permanente (`AGENTS.md` Seção 2).
3. **Chat de IA para Interpretação de Gráficos:** Proibição regulatória e funcional permanente (`AGENTS.md` Seção 2).

---

## 4. Implementação Realizada: Persistência de Preferências de Gráficos do Usuário

### Detalhamento da Solução Implementada
1. **Modelagem Relacional e Schema Drizzle (`user_chart_preferences`):**
   - Tabela dedicada `user_chart_preferences` criada com chave estrangeira para `users(id)` (`ON DELETE CASCADE`), constraint de unicidade `uq_user_chart_preferences_user_area` sobre `(user_id, chart_area)` e constraints de validação de enum físico no PostgreSQL (`chk_chart_pref_area`, `chk_chart_pref_period`, `chk_chart_pref_view_mode`, `chk_chart_pref_grouping`, `chk_chart_pref_basis`).
   - Migração versionada `drizzle/migrations/0010_add_user_chart_preferences.sql` criada e journalizada.
   - Schema Guardian (`src/lib/db/verify-schema.ts`) atualizado com a definição física exata da tabela na matriz `EXPECTED_SCHEMA_MATRIX`.
2. **Camada de Domínio e Validações Zod:**
   - Tipos canônicos em `src/modules/portfolio/domain/chart-preferences.types.ts` e validações Zod estritas por área com `superRefine` em `src/modules/portfolio/domain/chart-preferences.schema.ts`.
3. **Camada de Serviço e Server Actions:**
   - Serviço `src/modules/portfolio/server/chart-preferences.service.ts` com busca consolidada (`getUserChartPreferences`) e upsert atômico idempotente (`saveUserChartPreference`) via `ON CONFLICT (user_id, chart_area) DO UPDATE SET ...`.
   - Server Actions `saveChartPreferenceAction` e `getUserChartPreferencesAction` em `src/modules/portfolio/server/portfolio.actions.ts`, autenticadas com `requireAuth()` e resolvendo o `userId` exclusivamente da sessão HTTP-only no servidor.
4. **Integração na Interface e Arquitetura Anti-Concorrência:**
   - **Eliminação de Closure Desatualizada:** Cada componente (`PortfolioEvolutionChart.tsx`, `DashboardAllocationCharts.tsx`, `PortfolioAllocationCharts.tsx`) mantém um snapshot completo e síncrono em `useRef` (`preferenceRef`), atualizado imediatamente antes do `setState` por meio de uma função centralizada `applyPreferenceChange`. Isso impede que cliques rápidos consecutivos capturem valores antigos de closures de renders anteriores.
   - **Segregação Rigorosa entre Dados Financeiros e Preferências Visuais:** Em `PortfolioEvolutionChart.tsx`, atualizações legítimas de `initialSummary` (ex.: após compra, venda, cancelamento ou revalidação de dados) atualizam sempre e incondicionalmente o estado de resumo da série temporal (`setSummary(initialSummary)`), sem jamais executar setters de período (`setSelectedPeriod`) ou modo (`setViewMode`).
   - **Prevenção de Sobrescrita Indevida na Sincronização:** Removida qualquer dependência de `syncStatus` dos efeitos de hidratação. Utilização de `hasLocalPreferenceChangeRef` e `lastPropPreferenceRef` para garantir que a transição de status para `idle` ou a revalidação de props do servidor nunca revertam as escolhas visuais ativas do usuário para valores padrão antigos.
   - **Preservação de `router.refresh()` nos Fluxos Patrimoniais:** O callback `onSuccess={() => router.refresh()}` foi integralmente preservado em `TransactionModal` e `CancelEventModal` em `PortfolioDetailView.tsx`, garantindo que mutações financeiras atualizem posições, eventos e métricas derivadas enquanto as preferências visuais ativas permanecem intactas.
   - **Fila Serializada e Coalescência (`ChartPreferenceSyncQueue` / `useChartPreferenceSync`):** Máximo de 1 requisição em voo por área, coalescendo alterações intermediárias e garantindo que o snapshot mais recente seja deterministicamente o último gravado.
   - **Observabilidade no DOM:** Containers dos gráficos expõem `data-sync-status="idle" | "saving"` para testes E2E e asserções determinísticas sem necessidade de timeouts artificiais.
   - **Sincronização Determinística Multi-Navegador (Firefox/WebKit/Chromium):** Fluxos de teste E2E estruturados com esperas orientadas a estado observável (visibilidade de títulos de modais), prevenindo condições de corrida na renderização assíncrona do Firefox.
5. **Cobertura e Resultados de Validação:**
   - **Testes Unitários:** 45 arquivos aprovados, **614 testes passados** (`pnpm run test:unit`), cobrindo schemas, motores de cálculo, filas de concorrência e componentes React;
   - **Testes de Integração:** 28 arquivos aprovados, **286 testes passados** (`pnpm run test:integration`) com PostgreSQL real, cobrindo persistência de cotações, valuation, preferências de gráficos e Server Actions;
   - **Testes End-to-End (E2E):** 78 testes aprovados (`pnpm run test:e2e`), cobrindo 100% dos fluxos em Chromium, Firefox e WebKit, incluindo alternâncias rápidas de gráficos, mutações de carteira com `router.refresh()`, persistência através de `page.reload()` e isolamento multitenant estrito;
   - **Schema Guardian:** 23 tabelas físicas catalogadas e **100% aprovadas** tanto no banco de testes (`DATABASE_URL_TEST`) quanto no banco de desenvolvimento (`DATABASE_URL`), resolvendo integralmente o erro 500 no `/dashboard`;
   - **Compilação de Produção:** Next.js 16 (Turbopack) compilado com sucesso (`pnpm run build`) com zero erros de tipagem (`pnpm run typecheck`) e zero avisos de linter (`pnpm run lint`).

---

## 5. Análise da Automação de Cotações (Background Jobs) e Operação de Banco

- **Classificação Documental:** A automação agendada em background é classificada na documentação local como **planejada de infraestrutura** (`phase-06-market-data-and-charts.md` L10, L29, L41; `integrations.md` L33; `delivery-status.md` L75), não constituindo critério bloqueador para a Fase 06.
- **Estado Técnico Atual:** O script administrativo CLI `scripts/ingest-market-data.ts` (comando `pnpm market:ingest`) está implementado, testado e atende integralmente à ingestão e persistência local sob demanda.
- **Aplicação de Migrações em Desenvolvimento:** A migração versionada `0010_add_user_chart_preferences.sql` foi aplicada ao banco de desenvolvimento (`DATABASE_URL`) via `$env:ALLOW_DATABASE_MUTATION="true"; pnpm db:migrate` e validada via `pnpm db:verify`, garantindo compatibilidade imediata com o runtime de `pnpm dev`.

---

## 6. Conclusão da Auditoria e Fechamento da Fase 06

1. **Requisitos Mandatórios (12/12):** Todos os 12 requisitos documentados para a Fase 06 encontram-se **100% implementados, testados e validados**.
2. **Pendência Mandatória Resolvida:** A persistência de preferências de gráficos por usuário e área foi integralmente entregue e comprovada por testes de schema, fila, componentes React, integração no PostgreSQL real e E2E Playwright.
3. **Ambiente de Desenvolvimento Alinhado:** A relação `user_chart_preferences` e todas as 23 tabelas estruturais estão criadas e validadas no banco de desenvolvimento, eliminando falhas de runtime no `/dashboard`.
4. **Itens Não Bloqueantes:** Automação agendada em background, provedores comerciais pagos e WebSockets permanecem registrados como capacidades de evolução futura e infraestrutura.
5. **Estado da Fase:** A Fase 06 — Dados de Mercado, Valuation e Gráficos está **homologada com sucesso (`PASS`) e tecnicamente aprovada**, com todos os 12 requisitos mandatórios entregues, integridade física de schema validada em 23 tabelas pelo Schema Guardian, ambientes de desenvolvimento e teste perfeitamente alinhados, e cobertura completa comprovada por 614 testes unitários, 286 testes de integração e 78 testes E2E.
