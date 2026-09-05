# Valuation, Evolução Patrimonial e Projeções

Este documento define os limites de domínio e o estado de implementação dos motores de valuation, evolução patrimonial e modelos teóricos de projeção.

## 1. Capacidades Implementadas e Validadas

As seguintes funcionalidades de valuation e análise patrimonial estão efetivamente implementadas e cobertas por testes no código:

### 1.1. Valuation de Mercado Atual de uma Carteira
- **Motor:** `src/modules/portfolio/domain/valuation-engine.ts` e `position-engine.ts`.
- **Cálculo:** Confronta a quantidade líquida em custódia com a cotação mais recente válida em `market_quotes`.
- **Conversão Cambial:** Aplica a taxa de conversão direta da tabela `exchange_rates` para ativos denominados em moeda diferente da moeda-base da carteira.
- **Tratamento de Inconsistências:** Posições sem cotação histórica válida permanecem como não cotadas (`unquotedPositionsCount`), cotações com mais de 7 dias civis UTC são marcadas como obsoletas (`stalePositionsCount`), e divergências de moeda incrementam `currencyMismatchPositionsCount` sem invalidar cotações compatíveis anteriores.

### 1.2. Evolução Patrimonial Temporal
- **Motor:** `src/modules/portfolio/domain/portfolio-evolution-engine.ts`.
- **Cálculo:** Executa o replay cronológico diário de todos os eventos operacionais e societários da carteira até a data avaliada, reconstruindo o valor de mercado diário (`totalMarketValue`) e o custo investido correspondente às posições cotadas (`quotedInvestedCost`).

### 1.3. Comparação Visual "Mercado vs. Custo"
- **Motor:** `src/modules/portfolio/domain/chart-engine.ts`.
- **Exibição:** Gera a série comparativa interna que confronta a curva de valor de mercado com a curva de custo investido da mesma carteira ao longo do tempo.

### 1.4. Modelos Teóricos de Valuation Parametrizado (Etapa 6)
- **Motor:** `src/modules/market-data/domain/theoretical-valuation-engine.ts`.
- **Cálculo:** Implementado de forma determinística e testada em `Decimal`:
  - **Método de Bazin (Preço Teto):** Baseado em dividend yield médio histórico e yield desejado pelo usuário ($P_{\text{teto}} = D / Y$);
  - **Fórmula de Graham (Valor Intrínseco):** Baseado no lucro por ação (LPA) e valor patrimonial por ação (VPA): $V = \sqrt{22.5 \cdot \text{LPA} \cdot \text{VPA}}$;
  - **Fluxo de Caixa Descontado Simplificado (DCF):** Projeção plurianual com premissas de taxa de desconto e taxa de crescimento perpétuo.

### 1.5. Simulador de Projeções e Aportes Futuros
- **Motor:** `src/modules/projections/domain/compound-interest.ts` e rota `/simulador`.
- **Cálculo:** Simulação de juros compostos em `Decimal`, acumulação patrimonial por aportes recorrentes mensais, ajuste opcional de inflação e efeito do reinvestimento de dividendos.
- **Aviso Obrigatório:** A plataforma destaca caráter puramente informativo e educacional, sem garantia de rentabilidade futura.

## 2. Capacidades Planejadas (Não Implementadas)

Os seguintes modelos conceituais representam diretrizes futuras e **não possuem código implementado**:

### 2.1. Métricas Avançadas de Rentabilidade
- **Rentabilidade Ponderada pelo Tempo (TWR):** Rentabilidade por cotização diária (*Planejado, não implementado*);
- **Rentabilidade Ponderada pelo Dinheiro (MWR / TIR):** Taxa interna de retorno financeira (*Planejado, não implementado*);
- **Modelo de Peter Lynch:** Métrica teórica confrontando índice P/L com taxa de crescimento e dividend yield (PEG Ratio) (*Planejado, não implementado*).

### 2.2. Comparação Analítica entre Carteiras Distintas
- **Distinção Conceitual Obrigatória:** A comparação analítica entre carteiras distintas (`REAL`, `ESTUDO` ou `ANALISE`) é uma ferramenta analítica sob demanda *Planejada*. Ela não deve ser confundida com o valuation da carteira individual nem com a consolidação agregada do dashboard atual.

## 3. Matriz de Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Valuation de mercado atual de uma carteira | Implementado | **Implementado e validado** |
| Evolução patrimonial temporal com replay de eventos | Implementado | **Implementado e validado** |
| Gráfico comparativo "Mercado vs. Custo" na carteira | Implementado | **Implementado e validado** |
| Tratamento de cotações obsoletas, ausentes e câmbio | Implementado | **Implementado e validado** |
| Modelos teóricos de valuation (Bazin, Graham, DCF) | Implementado (`theoretical-valuation-engine.ts`) | **Implementado e validado** |
| Projeções e simulações de aportes futuros (`/simulador`) | Implementado (`compound-interest.ts`) | **Implementado e validado** |
| Rentabilidade por cotização (TWR / MWR) | Não implementado | **Planejado, não implementado** |
| Modelo de Peter Lynch (PEG Ratio) | Não implementado | **Planejado, não implementado** |
| Comparação analítica entre carteiras distintas | Não implementado | **Planejado, não implementado** |
