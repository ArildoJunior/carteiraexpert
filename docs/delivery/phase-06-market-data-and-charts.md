# Fase 06 — Dados de Mercado e Gráficos

## Objetivo

Prover infraestrutura local para ingestão, persistência e consulta de cotações e taxas de câmbio, cálculo de valuation de mercado, evolução temporal de patrimônio, renderização de gráficos descritivos e persistência de preferências visuais por usuário e área.

## Estado Atual da Fase

> **Classificação:** **Homologada com sucesso (`PASS`).**
> A infraestrutura interna de ingestão (manual, mock e provedor público BRAPI), persistência local de cotações e câmbio, script administrativo CLI (`pnpm market:ingest`), motores de valuation e evolução diária, gráficos Recharts (alocação e evolução temporal) e a persistência atômica de preferências visuais por usuário e área (`user_chart_preferences`, migração `0010`) estão 100% implementados e validados por suítes unitárias, de integração e E2E. A execução operacional agendada via rotinas em background / cron jobs periódicos e streaming via WebSockets permanecem como capacidades planejadas de infraestrutura futura.

## Pacote 06.01 — Ingestão Interna, Cotações e Câmbio

### Incluído e Comprovado

- Contrato canônico de adaptadores de ingestão (`MarketDataProviderAdapter`);
- Adaptador manual estruturado (`ManualPayloadAdapter`) e adaptador mock para testes (`MockProviderAdapter`);
- Adaptador externo real para API pública BRAPI (`BrapiAdapter` em `src/modules/market-data/server/adapters/brapi.adapter.ts`), com validação estrita de timezones UTC e filtros por data de referência (`targetDate`);
- Script administrativo CLI para ingestão em lote (`scripts/ingest-market-data.ts`, executável via `pnpm market:ingest`);
- Serviço de ingestão e normalização (`MarketDataIngestionService`) com validação Zod e `Decimal`;
- Persistência relacional local nas tabelas `market_quotes` e `exchange_rates`;
- Mecanismo de desempate e ranking de qualidade de cotações (`DELAY_STATUS_QUALITY_RANK`);
- Tratamento de ativos sem cotação (`unquotedPositionsCount`) e cotações obsoletas (`stalePositionsCount`, com tolerância de até 7 dias civis UTC);
- Tratamento de divergência cambial (`CURRENCY_MISMATCH`);
- Motor de valuation de posições (`valuation-engine.ts`);
- Motor de evolução temporal diária (`portfolio-evolution-engine.ts`).

### Planejado / Não Implementado neste Pacote

- Execução operacional agendada via cron jobs ou workers em background para atualização automática periódica;
- Provedores comerciais contratados com SLA dedicado;
- Feeds em tempo real via WebSocket.

### Critérios de Aceite

- [x] Contrato de adaptadores e implementações manual, mock e BRAPI operacionais e testados;
- [x] Ingestão valida tipos, moedas e valores numéricos com `Decimal`;
- [x] Cotações e taxas cambiais são persistidas no PostgreSQL com rastreabilidade;
- [x] Motor de valuation e evolução trata cotações ausentes, obsoletas e divergência cambial;
- [x] Testes unitários e de integração de market data e evolução aprovados;
- [ ] Rotinas agendadas (cron jobs) de ingestão periódica em background (*Planejado de infraestrutura*);
- [ ] Conexão com provedores comerciais pagos de alta disponibilidade (*Planejado de evolução futura*).

## Pacote 06.02 — Gráficos e Visualizações

### Incluído e Comprovado

- Motor de agregação de séries e gráficos (`src/modules/portfolio/domain/chart-engine.ts`);
- Gráfico de evolução temporal "Mercado vs. Custo" com Recharts e suporte a períodos (`1M`, `3M`, `6M`, `1Y`, `YTD`, `ALL`) e modos de visualização (`comparison`, `cost_basis`, `market_value`, `pnl`);
- Gráficos de alocação por classe de ativos, por ativo individual e por moeda (`asset_type`, `asset`, `currency`) e bases (`market_value`, `cost_basis`);
- Formatação monetária e percentual precisa baseada em `Decimal`;
- Persistência atômica de preferências visuais por usuário e área no PostgreSQL (`user_chart_preferences`, migração `0010_add_user_chart_preferences.sql`);
- Fila serializada anti-concorrência no cliente (`ChartPreferenceSyncQueue` / `useChartPreferenceSync`) com coalescência de requisições e eliminação de race conditions de closure;
- Segregação rigorosa entre dados financeiros revalidados via `router.refresh()` e escolhas visuais ativas do usuário;
- Isolamento multitenant estrito por `userId` da sessão no servidor via `requireAuth()`.

### Planejado / Fora do Escopo

- Gráficos avançados de candlestick, gráficos de dispersão e heatmaps;
- Livro de ofertas e profundidade de mercado (*Fora do escopo permanente*).

### Critérios de Aceite

- [x] Gráficos de alocação e evolução patrimonial integrados e funcionais;
- [x] Séries temporais utilizam dados do banco local sem sobrecarga do cliente;
- [x] Testes unitários do motor de gráficos aprovados;
- [x] Preferências de exibição persistidas por usuário e área no PostgreSQL (tabela `user_chart_preferences`, migração `0010_add_user_chart_preferences.sql`).