# Fase 06 — Dados de Mercado e Gráficos

## Objetivo

Prover infraestrutura local para ingestão, persistência e consulta de cotações e taxas de câmbio, cálculo de valuation de mercado, evolução temporal de patrimônio e renderização de gráficos descritivos.

## Estado Atual da Fase

> **Classificação:** **Parcialmente implementada.**  
> A infraestrutura interna de ingestão manual/mock, persistência local de cotações e câmbio, motores de valuation e evolução diária, e gráficos Recharts estão implementados e testados. Conexões a provedores externos reais, sincronização automática e WebSockets permanecem planejados.

## Pacote 06.01 — Ingestão Interna, Cotações e Câmbio

### Incluído e Comprovado

- Contrato de adaptadores de ingestão (`MarketDataProviderAdapter`);
- Adaptador manual estruturado (`ManualPayloadAdapter`) e adaptador mock para testes (`MockProviderAdapter`);
- Serviço de ingestão e normalização (`MarketDataIngestionService`) com validação Zod e `Decimal`;
- Persistência relacional local nas tabelas `market_quotes` e `exchange_rates`;
- Mecanismo de desempate e ranking de qualidade de cotações (`DELAY_STATUS_QUALITY_RANK`);
- Tratamento de ativos sem cotação (`unquotedPositionsCount`) e cotações obsoletas (`stalePositionsCount`, com tolerância de até 7 dias civis UTC);
- Tratamento de divergência cambial (`CURRENCY_MISMATCH`);
- Motor de valuation de posições (`valuation-engine.ts`);
- Motor de evolução temporal diária (`portfolio-evolution-engine.ts`).

### Planejado / Não Implementado neste Pacote

- Integração direta e síncrona com provedores externos reais de cotações de mercado;
- Sincronização automática em background via cron jobs;
- Feeds em tempo real via WebSocket.

### Critérios de Aceite

- [x] Contrato de adaptadores e implementações manual/mock operacionais;
- [x] Ingestão valida tipos, moedas e valores numéricos com `Decimal`;
- [x] Cotações e taxas cambiais são persistidas no PostgreSQL com rastreabilidade;
- [x] Motor de valuation e evolução trata cotações ausentes, obsoletas e divergência cambial;
- [x] Testes unitários e de integração de market data e evolução aprovados;
- [ ] Provedores externos reais integrados em background (*Planejado*);
- [ ] Jobs assíncronos periódicos de atualização (*Planejado*).

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