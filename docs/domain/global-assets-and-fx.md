# Ativos Globais e Câmbio

Este documento descreve as regras de domínio para ativos internacionais, conversão cambial e consolidação multi-moeda no CarteiraExpert.

## 1. Princípios de Multi-Moeda

1. **Preservação da Moeda Original:** Cada ativo cadastrado na tabela `assets` possui uma moeda de denominação explícita (`currency`, ex: `USD`, `EUR`, `BRL`). Todas as operações em `portfolio_events` registram e preservam a moeda original de negociação.
2. **Moeda-Base da Carteira:** Cada carteira possui uma moeda-base de referência (`portfolios.baseCurrency`, padrão `'BRL'`).
3. **Consolidação Cambial:** A consolidação patrimonial na moeda-base é uma visão derivada de cálculo; ela nunca altera o preço original ou a quantidade em custódia do ativo.
4. **Conversão Cambial:** O sistema realiza conversão do valor de mercado para a moeda-base quando existe taxa cambial compatível. Não foi confirmada uma decomposição analítica independente entre retorno do ativo e efeito cambial.

## 2. Persistência e Resolução de Taxas de Câmbio (`exchange_rates`)

A resolução de câmbio é atendida exclusivamente pela tabela local `exchange_rates` (`src/lib/db/schema/market-data.ts`):

- **Estrutura:** Par de moedas (`fromCurrency`, `toCurrency`), taxa (`rate`, `NUMERIC(20, 8)`), data de referência em UTC (`rateDate`) e status de defasagem (`delayStatus`).
- **Unicidade e Normalização:** Chave única `uq_exchange_rates_pair_date (from_currency, to_currency, rate_date)` com datas normalizadas para `00:00:00.000Z`.
- **Origem dos Dados:** Ingestão via adaptadores internos (`ManualPayloadAdapter`, `MockProviderAdapter`) através do serviço `MarketDataIngestionService`.

## 3. Regras de Conversão nos Motores de Domínio

No motor de evolução temporal (`src/modules/portfolio/domain/portfolio-evolution-engine.ts`) e no motor de valuation:

### 3.1. Ativos na Mesma Moeda da Carteira
Se `asset.currency === portfolio.baseCurrency`, o valor de mercado e o custo investido são consolidados diretamente na proporção nominal (fator cambial 1.0).

### 3.2. Ativos em Moeda Estrangeira
Se `asset.currency !== portfolio.baseCurrency`:
- **Taxa Cambial Válida:** O motor busca a taxa correspondente ao par exato `asset.currency -> portfolio.baseCurrency` para a data de referência avaliada. O valor de mercado em BRL é calculado multiplicando-se o valor nominal pela taxa.
- **Taxa Cambial Ausente:** Caso não exista taxa cambial para a data avaliada, o ativo internacional **não é somado** ao valor de mercado da consolidação, evitando distorções patrimoniais.
- **Incompatibilidade de Moeda na Cotação (`CURRENCY_MISMATCH`):** Se a cotação recebida para o ativo estiver em moeda diferente da cadastrada em `asset.currency`, a cotação é desconsiderada para efeito de valor de mercado sem invalidar cotações compatíveis anteriores, sendo contabilizada em `currencyMismatchPositionsCount`.

## 4. Matriz de Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Cadastro de ativos em moedas estrangeiras (USD, EUR, etc.) | Implementado | **Implementado e validado** |
| Persistência e consulta de taxas de câmbio em `exchange_rates` | Implementado | **Implementado e validado** |
| Conversão cambial determinística no valuation e evolução temporal | Implementado | **Implementado e validado** |
| Tratamento de taxas ausentes e divergência cambial | Implementado | **Implementado e validado** |
| Decomposição analítica entre retorno de ativo e efeito cambial | Não implementado | **Não verificado / Pendente** |
| Provedores externos reais de taxas de câmbio (APIs de mercado) | Não implementado | **Não verificado / Pendente** |
| Integração bancária automática com contas internacionais | Não implementado | **Fora do escopo do MVP** |
| Contas de custódia em corretoras estrangeiras | Não implementado | **Regra aprovada, implementação pendente** |