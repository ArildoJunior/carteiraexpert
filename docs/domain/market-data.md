# Dados de Mercado

Este documento descreve as regras de domínio, contratos de adaptadores e ingestão de dados de mercado no CarteiraExpert.

## 1. Princípios de Consumo de Dados

1. **Desacoplamento e Consultas Locais:** Nas rotas e fluxos analisados, a interface e os motores consultam os dados persistidos localmente em `market_quotes` e `exchange_rates`. Não foi confirmada chamada síncrona a provedores externos durante o carregamento. A integração com provedores externos reais permanece não implementada ou não verificada.
2. **Desacoplamento por Adaptadores:** A obtenção de dados de mercado é intermediada pela interface abstrata `MarketDataProviderAdapter` (`src/modules/market-data/server/market-data-provider.types.ts`).
3. **Transparência de Defasagem:** Toda cotação e taxa armazena seu estado de defasagem (`delay_status`) e data de referência em UTC.
4. **Respeito ao Multi-Tenant:** Ativos globais (`is_custom = false`) compartilham cotações comuns; ativos customizados (`is_custom = true`) são restritos ao usuário criador.

## 2. Camada de Adaptadores e Ingestão

### 2.1. Adaptadores Implementados
- **`ManualPayloadAdapter`** (`src/modules/market-data/server/adapters/manual-payload.adapter.ts`): Processa payloads estruturados em formato JSON submetidos manualmente via API ou rotinas administrativas (*Implementado e validado*).
- **`MockProviderAdapter`** (`src/modules/market-data/server/adapters/mock-provider.adapter.ts`): Fornece cotações e taxas determinísticas simuladas para testes e ambiente local (*Implementado e validado*).

### 2.2. Serviço de Ingestão (`MarketDataIngestionService`)
O serviço valida os dados com Zod e `Decimal` (`src/modules/market-data/domain/market-data.schema.ts`), normaliza as datas para `00:00:00.000Z` e aplica a hierarquia de qualidade (`DELAY_STATUS_QUALITY_RANK`):
1. `realtime` (Rank 5)
2. `delayed_15m` (Rank 4)
3. `eod` (Rank 3)
4. `manual` (Rank 2)
5. `unknown` (Rank 1)

Caso já exista cotação para o mesmo ativo e data em `market_quotes`, o registro só é substituído se o novo payload apresentar qualidade igual ou superior.

### 2.3. Persistência Relacional
- **`market_quotes`:** `asset_id`, `quote_date`, `price`, `currency`, `source`, `delay_status`. Chave única `uq_market_quotes_asset_date`.
- **`exchange_rates`:** `from_currency`, `to_currency`, `rate_date`, `rate`, `source`, `delay_status`. Chave única `uq_exchange_rates_pair_date`.
- As tabelas registram a fonte e data de referência; não possuem coluna `created_by` obrigatória no schema físico.

## 3. Tratamento de Cotações nos Motores de Domínio

O motor de evolução temporal (`src/modules/portfolio/domain/portfolio-evolution-engine.ts`) aplica as seguintes políticas:

- **Cotação Válida:** Cotação encontrada dentro da janela máxima de 7 dias civis UTC (`MAX_QUOTE_AGE_DAYS = 7`) em relação à data de avaliação.
- **Cotação Obsoleta (Stale):** Cotações com mais de 7 dias são desconsideradas para o cálculo de valor de mercado da data e computadas em `stalePositionsCount`.
- **Ativo Não Cotado (Unquoted):** Ativos em carteira sem nenhuma cotação histórica válida permanecem como não cotados (`unquotedPositionsCount`).
- **Incompatibilidade de Moeda (`CURRENCY_MISMATCH`):** Cotação em moeda divergente do ativo não invalida a cotação compatível anterior e incrementa `currencyMismatchPositionsCount`.
- **Taxa Cambial Ausente:** Sem taxa cambial exata `asset.currency -> baseCurrency`, o ativo não é somado no valor de mercado da consolidação.

## 4. Matriz de Estado das Capacidades de Dados de Mercado

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Contrato abstrato de provedor (`MarketDataProviderAdapter`) | Implementado | **Implementado e validado** |
| Adaptador manual (`ManualPayloadAdapter`) | Implementado | **Implementado e validado** |
| Adaptador mock para testes (`MockProviderAdapter`) | Implementado | **Implementado e validado** |
| Serviço de ingestão e normalização (`MarketDataIngestionService`) | Implementado | **Implementado e validado** |
| Persistência e consulta local (`market_quotes` e `exchange_rates`) | Implementado | **Implementado e validado** |
| Tratamento de cotações obsoletas, ausentes e divergência cambial | Implementado | **Implementado e validado** |
| Provedores externos reais de cotações (B3, APIs de mercado) | Não implementado | **Não verificado / Pendente** |
| Sincronização automática em background / Cron jobs | Não implementado | **Planejado, não implementado** |
| Streaming em tempo real via WebSocket | Não implementado | **Planejado, não implementado** |
| Livro de ofertas e profundidade de mercado | Não suportado | **Fora do escopo do MVP** |