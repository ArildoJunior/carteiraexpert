# Fase 06 — Dados de Mercado e Gráficos

## Objetivo

Prover infraestrutura local para ingestão, persistência e consulta de cotações e taxas de câmbio, cálculo de valuation de mercado, evolução temporal de patrimônio e renderização de gráficos descritivos.

## Estado Atual da Fase

> **Classificação:** **Parcialmente implementada.**  
> A infraestrutura interna de ingestão (manual, mock e provedor público BRAPI), persistência local de cotações e câmbio, script administrativo CLI (`pnpm market:ingest`), motores de valuation e evolução diária, e gráficos Recharts estão implementados e testados. A execução operacional agendada via rotinas em background / cron jobs periódicos e streaming via WebSockets permanecem planejados.

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
- [ ] Rotinas agendadas (cron jobs) de ingestão periódica em background (*Planejado*);
- [ ] Conexão com provedores comerciais pagos de alta disponibilidade (*Planejado*).

## Pacote 06.02 — Gráficos e Visualizações

### Incluído e Comprovado

- Motor de agregação de séries e gráficos (`src/modules/portfolio/domain/chart-engine.ts`);
- Gráfico de evolução temporal "Mercado vs. Custo" com Recharts;
- Gráficos de alocação por classe de ativos e por ativo individual;
- Formatação monetária e percentual precisa baseada em `Decimal`.

### Planejado / Fora do Escopo

- Gráficos avançados de candlestick, gráficos de dispersão e heatmaps;
- Livro de ofertas e profundidade de mercado (*Fora do escopo permanente*);
- Persistência customizada de preferências de visualização por usuário (*Planejado*).

### Critérios de Aceite

- [x] Gráficos de alocação e evolução patrimonial integrados e funcionais;
- [x] Séries temporais utilizam dados do banco local sem sobrecarga do cliente;
- [x] Testes unitários do motor de gráficos aprovados;
- [ ] Preferências de exibição persistidas por usuário (*Planejado*).