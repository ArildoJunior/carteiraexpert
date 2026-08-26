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

## Pacote 06.03 — Ingestão Histórica e Diária de Dados de Mercado da B3

> **Especificação Detalhada:** [`phase-06-03-b3-historical-market-data-ingestion.md`](./phase-06-03-b3-historical-market-data-ingestion.md)
> **Decisão Arquitetural Vinculada:** [ADR-010](../decisions/ADR-010-b3-eod-historical-ingestion.md)
> **Status:** **Planejado — especificação para implementação.**

### Objetivo e Escopo Funcional

Implementar fluxo seguro, auditável e idempotente para upload privado e processamento assíncrono das séries históricas e arquivos diários de fim de dia (EOD) da B3 no formato oficial `COTAHIST` (arquivos ZIP contendo TXT de largura fixa).

### Componentes Planejados

1. **Upload e Armazenamento Privado:**
   - Envio exclusivo por administradores e funcionários autorizados via área restrita;
   - Armazenamento dos arquivos ZIP originais em área privada com cálculo e conferência de hash SHA-256;
   - Bloqueio rigoroso de acesso de usuários comuns aos arquivos originais (sem telas, endpoints, links públicos ou redistribuição).

2. **Processamento Assíncrono e Parser COTAHIST:**
   - Desacoplamento da requisição HTTP via fila e workers em background com máquina de estados de lote (`RECEIVED`, `VALIDATING`, `QUEUED`, `PROCESSING`, `COMPLETED`, `COMPLETED_WITH_WARNINGS`, `FAILED`, `DUPLICATE`, `CANCELLED`);
   - Extração segura do TXT e parser de largura fixa versionado conforme layout oficial `SeriesHistoricas_Layout.pdf`;
   - Validações de integridade estrutural: registro de abertura/header `00`, registros de negociação `01` e registro de encerramento/trailer `99` com contagens;
   - Descarte obrigatório de linhas incompletas ou truncadas (nunca importar registros parciais);
   - Normalização monetária (escala inteira dividida por 100), fator de cotação (`quotation_factor`), códigos BDI e tipos de mercado.

3. **Carga Idempotente e Integração:**
   - Deduplicação por hash SHA-256 e chave de negócio `(trading_date, ticker, bdi_code, market_type, distribution_number)`;
   - Carga transacional atômica na tabela canônica `market_quotes` identificando a origem `B3_COTAHIST` e lote de importação;
   - Trilha de auditoria e geração de relatórios operacionais do lote com contagem de registros válidos, inseridos, atualizados, rejeitados e avisos;
   - Disponibilização dos dados processados para consumo pelos motores de valuation, evolução temporal, gráficos e estudos do produto.

### Critérios de Aceite (Pendentes)

- [ ] Upload de ZIPs restrito a administradores e funcionários autorizados no backend;
- [ ] Arquivos originais mantidos em armazenamento privado sem acesso ou redistribuição a usuários comuns;
- [ ] Parser versionado de largura fixa validando header `00`, trailer `99` e registros `01`;
- [ ] Linhas parciais ou truncadas descartadas sem interrupção indevida ou corrupção de base;
- [ ] Carga idempotente por SHA-256 e chave de negócio sem duplicar cotações;
- [ ] Processamento assíncrono fora da requisição web com estados e auditoria de lote;
- [ ] Homologação inicial aprovada com a série completa de 2016 antes da expansão;
- [ ] Gráficos, valuation e estudos consumindo os dados normalizados com indicação de origem B3 e natureza de fim de dia;
- [ ] Testes unitários, de integração e autorização aprovados com 100% de sucesso.