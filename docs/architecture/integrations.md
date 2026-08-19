# Arquitetura de Integrações e Dados de Mercado

Este documento descreve a arquitetura de integrações, adaptadores e ingestão de dados de mercado da plataforma CarteiraExpert baseada no código existente.

## 1. Princípios Arquiteturais

1. **Desacoplamento da Interface:** Nas rotas e fluxos analisados, a interface e os motores consultam os dados persistidos localmente em `market_quotes` e `exchange_rates`. Não foi confirmada chamada síncrona a provedores externos durante o carregamento.
2. **Ingestão Controlada e Idempotente:** A entrada de dados de mercado ocorre via adaptadores desacoplados que validam, normalizam e persistem registros com tratamento estrito de unicidade e idempotência.
3. **Rastreabilidade e Defasagem:** Os registros persistidos armazenam a fonte, a data de referência e o status de defasagem conforme os campos existentes no schema. Não foi confirmada, nas tabelas de cotações e câmbio, uma coluna `created_by` obrigatória para identificar o usuário ou processo executor.
4. **Respeito ao Multi-Tenant:** A resolução de ativos durante a ingestão respeita rigorosamente o catálogo: ativos globais (`is_custom = false`) são compartilhados, enquanto ativos customizados (`is_custom = true`) são restritos ao seu criador (`user_id`).

## 2. Camada de Adaptadores de Mercado

A arquitetura define contratos abstratos para isolar a plataforma de qualquer fornecedor de dados específico.

### 2.1. Contrato Abstrato (`MarketDataProviderAdapter`)
Localização: `src/modules/market-data/server/market-data-provider.types.ts`

Define a interface comprovada no código:
- `name`: identificador único do adaptador;
- `fetchQuotes(tickers?: string[], targetDate?: Date): Promise<ProviderQuoteItem[]>`: busca lote de cotações;
- `fetchExchangeRates(pairs?: Array<{ fromCurrency: string; toCurrency?: string }>, targetDate?: Date): Promise<ProviderExchangeRateItem[]>`: busca lote de taxas de câmbio.

### 2.2. Adaptadores Implementados no Código

- **`ManualPayloadAdapter`** (`src/modules/market-data/server/adapters/manual-payload.adapter.ts`): *Implementado e validado*. Adaptador síncrono que processa payloads estruturados em formato JSON submetidos manualmente via API ou scripts administrativos.
- **`MockProviderAdapter`** (`src/modules/market-data/server/adapters/mock-provider.adapter.ts`): *Implementado e validado*. Adaptador determinístico para testes unitários, testes de integração e ambiente de desenvolvimento local, gerando cotações e taxas simuladas sem dependência de rede.

### 2.3. Provedores Externos Reais
- **Estado da Implementação:** *Não implementado / Não verificado*.
- Não há fornecedores externos reais (ex: B3, Brapi, AlphaVantage, CoinGecko, etc.) integrados ou contratados no estado atual.
- Não existem credenciais, chaves de API externas ou chamadas HTTP para terceiros configuradas no código de produção.

## 3. Fluxo de Ingestão de Dados de Mercado

O fluxo comprovado no código (`src/modules/market-data/server/market-data-ingestion.service.ts`) opera nas seguintes etapas:

Adaptador (Manual / Mock) → Validação (Zod) → Normalização (UTC / Decimal) → Ingestão (`MarketDataIngestionService`) → Banco Interno (`market_quotes` / `exchange_rates`) → Motores de Domínio → Interface

### 3.1. Validação com Zod e Decimal
Localização: `src/modules/market-data/domain/market-data.schema.ts`
- `ingestQuoteItemSchema`: valida `ticker` ou `assetId`, preço não-negativo via `Decimal`, data/hora e `delayStatus`.
- `ingestExchangeRateItemSchema`: valida par de moedas (`fromCurrency`, `toCurrency`), taxa positiva (`rate > 0`) via `Decimal`, data/hora e `delayStatus`.

### 3.2. Normalização e Hierarquia de Qualidade
- As datas são normalizadas para UTC no início do dia civil de referência (`00:00:00.000Z`).
- Hierarquia de qualidade de dados (`DELAY_STATUS_QUALITY_RANK`):
  1. `realtime` (Rank 5)
  2. `delayed_15m` (Rank 4)
  3. `eod` (Rank 3)
  4. `manual` (Rank 2)
  5. `unknown` (Rank 1)
- Em caso de conflito de cotação para o mesmo ativo e data, o registro existente só é substituído se o novo payload apresentar qualidade igual ou superior.

### 3.3. Persistência Relacional
- **`market_quotes`:** constraint de unicidade `uq_market_quotes_asset_date (asset_id, quote_date)`.
- **`exchange_rates`:** constraint de unicidade `uq_exchange_rates_pair_date (from_currency, to_currency, rate_date)`.
- As tabelas registram a fonte, data de referência e defasagem; não possuem `created_by` obrigatório no schema físico.

## 4. Consumo nos Motores de Domínio

Os dados ingeridos são consumidos exclusivamente através de consultas no banco de dados local:

- **Motor de Posições e Valuation (`position-engine.ts`, `valuation-engine.ts`):** Cruza a posição em custódia com a cotação mais recente e aplica a taxa cambial exata para ativos em moeda estrangeira.
- **Motor de Evolução Temporal (`portfolio-evolution-engine.ts`):**
  - **Janela de Cotações Obsoletas:** Cotações com mais de 7 dias civis UTC em relação à data avaliada são marcadas como obsoletas (`stalePositionsCount`).
  - **Ativos sem Cotação:** Posições sem cotação histórica válida permanecem como não cotadas (`unquotedPositionsCount`).
  - **Incompatibilidade de Moeda:** Cotações em moeda divergente do ativo não substituem cotações compatíveis anteriores e são registradas para diagnóstico (`currencyMismatchPositionsCount`).
  - **Conversão Cambial:** Sem taxa cambial exata `asset.currency -> baseCurrency`, o ativo não é somado no valor de mercado da consolidação.

## 5. Testes Comprovados

- Testes unitários do schema e serviço de ingestão: `tests/unit/market-data/market-data-schema.test.ts` e `market-data-ingestion.test.ts`.
- Testes de integração de ingestão no banco: `tests/integration/market-data/market-data-ingestion.test.ts`.
- Testes de valuation e evolução patrimonial com cotações e câmbio: `tests/unit/portfolio/portfolio-evolution-engine.test.ts` e `tests/integration/portfolio/portfolio-evolution.service.test.ts`.

## 6. Matriz de Estado das Capacidades de Integração

| Capacidade | Estado Real no Código | Classificação Arquitetural |
|---|---|---|
| Contrato abstrato de provedor (`MarketDataProviderAdapter`) | Implementado | **Implementado e validado** |
| Adaptador manual estruturado (`ManualPayloadAdapter`) | Implementado | **Implementado e validado** |
| Adaptador mock para testes (`MockProviderAdapter`) | Implementado | **Implementado e validado** |
| Serviço de ingestão e normalização (`MarketDataIngestionService`) | Implementado | **Implementado e validado** |
| Persistência local de cotações (`market_quotes`) | Implementado | **Implementado e validado** |
| Persistência local de câmbio (`exchange_rates`) | Implementado | **Implementado e validado** |
| Tratamento de cotações obsoletas / ausentes no valuation | Implementado | **Implementado e validado** |
| Provedores externos reais de cotações / câmbio | Não implementado | **Não verificado / Pendente** |
| Sincronização automática em background / Cron jobs | Não implementado | **Planejado, não implementado** |
| Feeds de cotações em tempo real via WebSocket | Não implementado | **Planejado, não implementado** |
| Open Finance e APIs bancárias para custódia | Não implementado | **Fora do escopo do MVP** |
| Mensageria assíncrona / Filas Redis | Não implementado | **Planejado, não implementado** |
