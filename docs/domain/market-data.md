# Dados de Mercado

Este documento descreve as regras de domínio, contratos de adaptadores e ingestão de dados de mercado no CarteiraExpert.

## 1. Princípios de Consumo de Dados

1. **Desacoplamento e Consultas Locais (ADR-006):** Nas rotas e fluxos da aplicação, a interface e os motores consultam exclusivamente os dados persistidos localmente em `market_quotes` e `exchange_rates`. Não são realizadas chamadas síncronas a provedores externos durante o carregamento de telas.
2. **Desacoplamento por Adaptadores (ADR-008):** A obtenção de dados de mercado é intermediada pela interface abstrata `MarketDataProviderAdapter` (`src/modules/market-data/server/market-data-provider.types.ts`).
3. **B3 como Fonte Histórica e de Fim de Dia (ADR-010):** Os arquivos oficiais de séries históricas e diárias da B3 (`COTAHIST`) constituem a fonte primária para cotações históricas e de fechamento (End of Day — EOD).
4. **Transparência de Defasagem e Origem:** Toda cotação e taxa armazena seu estado de defasagem (`delay_status`: `eod`, `delayed_15m`, `realtime`, `manual`, `unknown`), fonte (`source`) e data de referência em UTC. Dados de fim de dia (D-1) são formalmente identificados como históricos/EOD, sem promessa de tempo real.
5. **Separação entre Fatos de Mercado e Operações de Carteira:** Cotações representam fatos públicos de mercado e permanecem estritamente isoladas dos lançamentos e eventos privados das carteiras (`portfolio_events`). A oscilação de mercado altera o valuation da custódia sem modificar o histórico de operações ou custo de aquisição.
6. **Preços Brutos vs. Ajustes Corporativos:** Os preços ingeridos a partir do COTAHIST representam cotações brutas negociadas em pregão. Ajustes decorrentes de proventos, splits, bonificações ou grupamentos não são inferidos na carga bruta, sendo apurados pelos motores dedicados de eventos corporativos (Fase 04).
7. **Uso Interno sem Redistribuição:** Os dados de mercado processados destinam-se exclusivamente ao consumo das funcionalidades internas do produto (gráficos, valuation, estudos, indicadores e relatórios). Os arquivos brutos originais (ZIP/TXT) não são redistribuídos, baixados ou revendidos aos usuários finais.
8. **Respeito ao Multi-Tenant:** Ativos globais (`is_custom = false`) compartilham cotações comuns; ativos customizados (`is_custom = true`) são restritos ao usuário criador.

## 2. Camada de Adaptadores e Ingestão

### 2.1. Adaptadores Implementados
- **`ManualPayloadAdapter`** (`src/modules/market-data/server/adapters/manual-payload.adapter.ts`): Processa payloads estruturados em formato JSON submetidos manualmente via API ou rotinas administrativas (*Implementado e validado*).
- **`MockProviderAdapter`** (`src/modules/market-data/server/adapters/mock-provider.adapter.ts`): Fornece cotações e taxas determinísticas simuladas para testes e ambiente local (*Implementado e validado*).
- **`BrapiAdapter`** (`src/modules/market-data/server/adapters/brapi.adapter.ts`): Conector que consome cotações de ações brasileiras (B3) via API pública da BRAPI com normalização UTC (*Implementado e validado*).

### 2.2. Adaptador de Séries Históricas B3 (Pacote 06.03 / ADR-010)
- **`CotahistParserAdapter`** (*Planejado / Especificado em ADR-010 e Pacote 06.03*):
  - **Formato Oficial:** Leitura de arquivos TXT de largura fixa contidos em arquivos ZIP oficiais da B3 (`SeriesHistoricas_Layout.pdf`).
  - **Estrutura de Registros:** Registro de Abertura (`00`), Registros de Negociação de Ativos (`01`) e Registro de Encerramento/Trailer (`99`).
  - **Preços Brutos e Escala:** Preços armazenados como inteiros no arquivo e normalizados monetariamente via divisão determinística por 100 com `Decimal` (abertura, máxima, mínima, médio e fechamento).
  - **Fator de Cotação (`quotation_factor`):** Multiplicador de quantidade aplicável ao preço unitário (ex.: `1` para cotação por unidade de ação/cota; `1000` para cotação por lote de mil ações).
  - **Códigos BDI e Tipos de Mercado:**
    - Código BDI: identifica a classificação do papel (ex.: `02` para Lote Padrão, `12` para Fundos Imobiliários, `96` para Fracionário B3, etc.);
    - Tipo de Mercado: categoriza a modalidade de negociação (ex.: `010` para Mercado à Vista, `020` para Fracionário, `070`/`080` para Opções de Compra/Venda).
  - **Chave de Unicidade e Idempotência:** Chave de negócio canônica para desempate de cotações da B3:
    ```text
    (trading_date, ticker, bdi_code, market_type, distribution_number)
    ```
  - **Descarte de Registros Incompletos:** Registros parciais resultantes de truncamento de arquivo são sumariamente descartados durante o parser e nunca gravados no banco.

### 2.3. Serviço de Ingestão (`MarketDataIngestionService`)
O serviço valida os dados com Zod e `Decimal` (`src/modules/market-data/domain/market-data.schema.ts`), normaliza as datas para `00:00:00.000Z` e aplica a hierarquia de qualidade (`DELAY_STATUS_QUALITY_RANK`):
1. `realtime` (Rank 5)
2. `delayed_15m` (Rank 4)
3. `eod` (Rank 3)
4. `manual` (Rank 2)
5. `unknown` (Rank 1)

Caso já exista cotação para o mesmo ativo e data em `market_quotes`, o registro só é substituído se o novo payload apresentar qualidade igual ou superior.

### 2.4. Persistência Relacional
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
| Adaptador externo BRAPI (`BrapiAdapter`) | Implementado | **Implementado e validado** |
| Script CLI administrativo de ingestão (`scripts/ingest-market-data.ts`) | Implementado | **Implementado e validado** |
| Serviço de ingestão e normalização (`MarketDataIngestionService`) | Implementado | **Implementado e validado** |
| Persistência e consulta local (`market_quotes` e `exchange_rates`) | Implementado | **Implementado e validado** |
| Tratamento de cotações obsoletas, ausentes e divergência cambial | Implementado | **Implementado e validado** |
| Ingestão Histórica B3 COTAHIST / Atualização Diária (Pacote 06.03) | Especificado em ADR-010 | **Planejado / Especificado para implementação** |
| Sincronização automática em background / Cron jobs periódicos | Não implementado | **Planejado, não implementado** |
| Provedores comerciais pagos com SLA dedicado (ADR-008) | Não implementado | **Planejado, não implementado** |
| Streaming em tempo real via WebSocket | Não implementado | **Planejado, não implementado** |
| Livro de ofertas e profundidade de mercado | Não suportado | **Fora do escopo permanente** |