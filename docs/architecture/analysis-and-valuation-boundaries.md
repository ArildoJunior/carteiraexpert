# Fronteiras de Análise, Indicadores, Valuation e Projeções

## 1. Princípios Arquiteturais Fundamentais

1. **Autonomia do Investidor:** As ferramentas analíticas organizam dados públicos e executam fórmulas matemáticas transparentes. A plataforma não decide, não sugere alocações e não transforma cálculos em recomendações de investimento.
2. **Linguagem Descritiva e Neutra:** Nenhum resultado de filtro, ranking ou indicador pode ser rotulado com linguagem de recomendação (ex: “melhores ativos”, “comprar”, “oportunidades”). A rotulagem deve ser estritamente descritiva (ex: “Ativos Filtrados”, “Resultado do Modelo”).
3. **Distinção Rigorosa de Natureza de Dados:** Qualquer visualização analítica deve diferenciar explicitamente:
   - Dado observado ou fato histórico;
   - Cálculo matemático determinístico;
   - Premissa definida pelo usuário;
   - Cenário hipotético simulado;
   - Inferência ou estimativa analítica.
4. **Isolamento Patrimonial Total:** Ferramentas de análise, filtros, valuations, projeções e comparações **nunca alteram** o patrimônio real, não modificam eventos históricos e não alteram posições em custódia.

## 2. Subdomínios Analíticos (Especificação Conceitual e Roadmap)

Os subdomínios abaixo representam diretrizes arquiteturais para funcionalidades analíticas aprovadas no produto, classificadas por seu estado real de implementação:

### 2.1. `market-fundamentals` (Indicadores Fundamentalistas)
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Produção de indicadores fundamentalistas (P/L, P/VP, ROE, ROIC, Dividend Yield, Dívida Líquida/EBITDA, etc.) a partir de demonstrações contábeis e cotações históricas, registrando fonte, período e qualidade do dado.

### 2.2. `technical-analysis` (Análise Técnica Descritiva)
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Séries de preço e volume com cálculos descritivos (médias móveis, volatilidade, retornos, drawdown). Não emite sinais de compra/venda nem ordens.

### 2.3. `screening` (Filtros de Mercado)
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Mecanismo de busca e filtragem parametrizada de ativos segundo critérios definidos pelo usuário. O resultado é uma lista descritiva de ativos aderentes aos filtros informados.

### 2.4. `valuation` (Modelos Teóricos de Valuation)
- **Estado:** *Parcialmente implementado (Valuation de mercado atual) / Modelos avançados planejados*.
- **Implementado:** O cálculo de valor de mercado atual de posições em carteira (`valuation-engine.ts`) com base na última cotação válida e taxa cambial.
- **Planejado:** Modelos teóricos parametrizados de valuation (Bazin, Graham, Peter Lynch e Fluxo de Caixa Descontado — DCF), explicitando premissas, fórmulas e limitações de cada metodologia.

### 2.5. `projections` (Projeções e Simulações)
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Simulação de aportes, crescimento patrimonial e reinvestimento de proventos como cenários hipotéticos, mantendo separação estrita da carteira real.

### 2.6. `user-metrics` (Métricas Customizadas)
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Permissão para que o usuário formule métricas próprias baseadas em pesos e parâmetros personalizados.

### 2.7. Comparação Explícita entre Carteiras
- **Estado:** *Planejado, não implementado*.
- **Escopo:** Ferramenta analítica sob demanda para confrontar métricas de uma carteira `REAL` com outras carteiras (`REAL`, `ESTUDO` ou `ANALISE`), sem fundir eventos ou alterar saldos.

## 3. Contrato Arquitetural de Resultados Analíticos

Todo resultado gerado por qualquer subdomínio analítico deve conter metadados mínimos:
- Ativo ou carteira avaliada;
- Período e moeda de referência;
- Data e hora do cálculo;
- Metodologia e fórmula aplicada;
- Parâmetros e premissas utilizadas;
- Estado de qualidade dos dados de entrada;
- Aviso contextual de finalidade exclusivamente informativa e educacional.
