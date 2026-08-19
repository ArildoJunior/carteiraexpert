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

## 2. Capacidades Planejadas (Não Implementadas)

Os seguintes modelos conceituais representam diretrizes no roadmap analítico da plataforma e **não possuem código ou endpoints implementados**:

### 2.1. Modelos Teóricos de Valuation Parametrizado
- **Método de Bazin (Preço Teto):** Projeção teórica baseada em dividend yield médio histórico e yield desejado pelo usuário (*Planejado, não implementado*).
- **Fórmula de Graham:** Modelo de valor intrínseco baseado em Lucro por Ação (LPA) e Valor Patrimonial por Ação (VPA) (*Planejado, não implementado*).
- **Modelo de Peter Lynch:** Métrica teórica confrontando índice P/L com taxa de crescimento e dividend yield (PEG Ratio) (*Planejado, não implementado*).
- **Fluxo de Caixa Descontado (DCF):** Modelo de projeção plurianual com premissas de taxa de desconto, crescimento na perpetuidade e valor terminal (*Planejado, não implementado*).

### 2.2. Simulações e Projeções Hipotéticas
- Simulações de aportes futuros recorrentes (*Planejado, não implementado*);
- Projeção de reinvestimento automático de proventos em cenários hipotéticos (*Planejado, não implementado*);
- Métricas avançadas de rentabilidade ponderada pelo tempo (TWR) e ponderada pelo dinheiro (MWR) (*Planejado, não implementado*);
- Criação de métricas ou taxas personalizadas pelo usuário (*Planejado, não implementado*).

### 2.3. Comparação Analítica entre Carteiras Distintas
- **Distinção Conceitual Obrigatória:** A comparação analítica entre carteiras distintas (`REAL`, `ESTUDO` ou `ANALISE`) é uma ferramenta analítica sob demanda *Planejada*. Ela não deve ser confundida com o valuation da carteira individual nem com a consolidação agregada do dashboard atual.

## 3. Matriz de Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Valuation de mercado atual de uma carteira | Implementado | **Implementado e validado** |
| Evolução patrimonial temporal com replay de eventos | Implementado | **Implementado e validado** |
| Gráfico comparativo "Mercado vs. Custo" na carteira | Implementado | **Implementado e validado** |
| Tratamento de cotações obsoletas, ausentes e câmbio | Implementado | **Implementado e validado** |
| Modelos teóricos de valuation (Bazin, Graham, Lynch, DCF) | Não implementado | **Planejado, não implementado** |
| Projeções e simulações de aportes futuros | Não implementado | **Planejado, não implementado** |
| Rentabilidade por cotização (TWR / MWR) | Não implementado | **Planejado, não implementado** |
| Comparação analítica entre carteiras distintas | Não implementado | **Planejado, não implementado** |
