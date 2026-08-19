# Análise Técnica, Fundamentalista e Filtros (Screening)

Este documento estabelece as diretrizes de domínio, princípios de neutralidade e estado de implementação para ferramentas de análise de mercado.

## 1. Princípios de Neutralidade e Não Recomendação

1. **Linguagem Estritamente Descritiva:** Todas as ferramentas analíticas operam com finalidade exclusivamente informativa e educacional. É vedado o uso de rótulos que sugiram orientação de investimento (ex: “oportunidades”, “melhores ativos”, “sinais de compra/venda”).
2. **Ausência de Recomendações e Execução:** A plataforma não recomenda estratégias, não emite alertas de compra/venda, não realiza consultoria de valores mobiliários e não executa ordens.
3. **Transparência na Natureza dos Dados:** As interfaces analíticas devem distinguir categoricamente:
   - Fatos históricos e cotações observadas;
   - Cálculos matemáticos determinísticos;
   - Premissas e filtros parametrizados pelo usuário;
   - Cenários simulados ou hipóteses.

## 2. Estado de Implementação dos Subdomínios Analíticos

### 2.1. Gráficos de Carteira Implementados
- **Implementado e validado:** Gráficos de alocação patrimonial por classe de ativo e gráficos de evolução temporal "Mercado vs. Custo" gerados pelo motor `src/modules/portfolio/domain/chart-engine.ts` para a carteira selecionada.
- *Ressalva:* A existência desses gráficos patrimoniais não constitui implementação de análise técnica ou de indicadores fundamentalistas avançados.

### 2.2. Subdomínios Planejados (Sem Implementação no Código)
- **Filtros e Screening de Mercado (`screening`):** Mecanismo de busca e filtragem parametrizada de ativos (Ações, FIIs, etc.) segundo critérios de múltiplos, liquidez e setores definidos pelo usuário (*Planejado, não implementado*).
- **Indicadores Fundamentalistas (`market-fundamentals`):** Ingestão e cálculo de múltiplos contábeis datados (P/L, P/VP, ROE, ROIC, Dívida Líquida/EBITDA, Margens, Dividend Yield) a partir de demonstrações financeiras (*Planejado, não implementado*).
- **Análise Técnica Descritiva (`technical-analysis`):** Séries históricas de preço e volume com indicadores matemáticos (médias móveis, volatilidade, drawdown) (*Planejado, não implementado*).
- **Métricas Personalizadas (`user-metrics`):** Criação de fórmulas e pesos customizados pelo usuário (*Planejado, não implementado*).

## 3. Matriz de Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Gráficos de alocação e evolução patrimonial da carteira | Implementado | **Implementado e validado** |
| Filtros de mercado e screening de ativos | Não implementado | **Planejado, não implementado** |
| Indicadores e múltiplos fundamentalistas (P/L, P/VP, ROE, etc.) | Não implementado | **Planejado, não implementado** |
| Indicadores de análise técnica (médias móveis, bandas, etc.) | Não implementado | **Planejado, não implementado** |
| Métricas e fórmulas customizadas pelo usuário | Não implementado | **Planejado, não implementado** |
| Emissão de sinais de compra/venda ou recomendações | Não suportado | **Fora do escopo permanente** |
