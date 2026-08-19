# Criptoativos

Este documento descreve o suporte e as diretrizes de domínio para criptoativos na plataforma CarteiraExpert.

## 1. Cadastro e Tipagem de Criptoativos

- **Catálogo de Ativos:** Criptoativos são registrados na tabela `assets` com `assetType = 'crypto'` (`src/lib/db/schema/portfolio.ts`).
- **Precisão Numérica de Alta Escala:**
  - Quantidades de criptoativos são obrigatoriamente persistidas no banco como `NUMERIC(28, 10)` e manipuladas no TypeScript com a biblioteca `Decimal` (com até 10 casas decimais).
  - Preços unitários e valores monetários utilizam `NUMERIC(20, 8)`.
  - É proibido o uso de tipos de ponto flutuante (`number`, `FLOAT`).

## 2. Eventos Operacionais Suportados para Criptoativos

Criptoativos utilizam os mesmos tipos de eventos operacionais padronizados na tabela `portfolio_events`:

- **`BUY`:** Compra de criptoativos contra moeda fiduciária (ex: BTC/BRL, ETH/USD).
- **`SELL`:** Venda de criptoativos, apurando o PnL realizado contra o custo médio ponderado vigente.
- **`TRANSFER_IN`:** Transferência de entrada (ex: de exchange para carteira ou entre endereços).
- **`TRANSFER_OUT`:** Transferência de saída entre carteiras.
- **`MANUAL_ADJUSTMENT`:** Ajustes corretivos de saldo de frações.
- **`REVERSAL`:** Estorno contábil de transações anteriores.

### 2.1. Tratamento de Taxas
- As taxas são armazenadas no campo `fees` dos eventos operacionais quando aplicável. Não existe um evento textual separado denominado `NETWORK_FEE`.
- O tratamento contábil e fiscal específico de taxas de mineração/gas em transferências entre carteiras permanece como *Não verificado / Pendente de detalhamento*.

## 3. Diretrizes de Negócio

1. **Transferências Internas:** A transferência de criptoativos entre carteiras é representada por `TRANSFER_OUT` e `TRANSFER_IN`. A regra de não incidência tributária é uma diretriz de produto que depende da apuração fiscal.
2. **Cotações e Valuation:** As cotações de criptoativos são consumidas da tabela interna `market_quotes` a partir de ingestões prévias, respeitando a moeda cadastrada e a janela de defasagem de 7 dias UTC.
3. **Ausência de Recomendações e Execução:** A plataforma organiza posições e calcula métricas descritivas; não executa ordens, não envia transações para blockchains e não recomenda compra/venda de criptoativos.

## 4. Matriz de Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Cadastro de criptoativos (`assetType = 'crypto'`) | Implementado | **Implementado e validado** |
| Precisão numérica de 10 casas decimais (`NUMERIC(28, 10)`) | Implementado | **Implementado e validado** |
| Lançamentos operacionais de compra, venda e transferências | Implementado | **Implementado e validado** |
| Armazenamento de taxas via campo `fees` | Implementado | **Implementado e validado** |
| Valuation de criptoativos via `market_quotes` | Implementado | **Implementado e validado** |
| Regras contábeis e fiscais específicas de taxas de rede | Não detalhado | **Não verificado / Pendente de detalhamento** |
| Trocas diretas entre criptos (`CRYPTO_SWAP`) | Não implementado | **Planejado, não implementado** |
| Conexão automática a exchanges via API | Não implementado | **Planejado, não implementado** |
| Rastreamento de carteiras on-chain / Web3 | Não implementado | **Planejado, não implementado** |
| Execução de ordens e envio de transações | Não suportado | **Fora do escopo permanente** |