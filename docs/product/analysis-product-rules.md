# Regras de Produto para Análise, Filtros e Simulações

## 1. Princípios Fundamentais

1. **Autonomia do Investidor:** o usuário pode filtrar, comparar, simular e estudar ativos e estratégias; a plataforma organiza dados e executa fórmulas, mas não escolhe nem recomenda pelo usuário.
2. **Distinção Rigorosa de Natureza de Dados:** toda tela analítica deve distinguir com clareza visual:
   - Dado observado ou fato histórico registrado;
   - Cálculo matemático determinístico;
   - Premissa configurada ou aceita pelo usuário;
   - Cenário hipotético simulado;
   - Inferência ou estimativa analítica.
3. **Isolamento Patrimonial:** análises, filtros, rankings, simulações e projeções **não alteram** a carteira real nem afetam a posição de custódia do usuário.

## 2. Rankings e Filtros de Mercado (Screening)

1. **Linguagem Descritiva e Neutra:** nenhum ranking ou resultado de filtro pode ser rotulado como “melhores ativos”, “ações para comprar”, “oportunidades da semana” ou termos equivalentes de recomendação. A terminologia deve ser estritamente descritiva, como “Resultados do Filtro” ou “Ativos Filtrados”.
2. **Filtros Configuráveis:** os filtros organizam dados públicos e observações contábeis a partir de parâmetros definidos pelo usuário (ex: P/L, Dividend Yield, P/VP, ROE, Dívida Líquida/EBITDA, Liquidez, Vacância em FIIs).
3. **Transparência de Dados Ausentes:** filtros não devem ocultar silenciosamente ativos com indicadores incompletos; a interface deve informar o estado de qualidade e cobertura do dado.

## 3. Metodologias de Valuation e Projeções

1. **Modelos Matemáticos Informativos:** metodologias consagradas de valuation (como Bazin, Graham, Peter Lynch e Fluxo de Caixa Descontado — DCF) representam ferramentas de estudo e modelos teóricos parametrizados.
2. **Termos Metodológicos:** expressões como “Preço Teto”, “Preço Justo” ou “Margem de Segurança” são nomes técnicos de fórmulas específicas de autores clássicos e devem ser apresentadas com a indicação expressa da metodologia, nunca como recomendação de compra ou garantia de preço.
3. **Projeções e Cenários:** simulações de aportes, crescimento e reinvestimento de proventos representam cenários hipotéticos baseados em premissas do usuário. A interface deve exibir avisos contextuais informando que projeções não constituem promessa de rentabilidade.

## 4. Comparação Explícita entre Carteiras (Funcionalidade Planejada)

1. **Ação Explícita e Isolada:** a comparação entre carteiras é uma funcionalidade analítica sob demanda, não uma soma automática.
2. **Confronto de Finalidades:** o usuário poderá comparar uma carteira `REAL` com outras carteiras `REAL`, `ESTUDO` ou `ANALISE`.
3. **Garantia de Não-Contaminação:** a comparação:
   - Não cria uma nova carteira permanente;
   - Não altera o patrimônio real;
   - Não funde nem mistura eventos históricos;
   - Não modifica saldos de caixa nem posições de custódia;
   - Não transforma carteiras em uma carteira consolidada permanente.
4. **Métricas Comparadas e Estado da Implementação:** as métricas listadas existem isoladamente ou parcialmente por carteira, mas o comparador entre carteiras ainda não está implementado. O modo ‘Mercado vs. Custo’ da evolução patrimonial é uma comparação interna da mesma carteira, não uma comparação entre carteiras.

## 5. Transparência, Gráficos e Demonstração

1. **Metadados de Gráficos:** gráficos analíticos devem explicitar período, moeda de exibição, fonte do dado, data/hora de referência e tratamento de ajustes de preço por proventos/splits.
2. **Imutabilidade Histórica:** alterações ou correções em fórmulas analíticas não podem reescrever silenciosamente resultados históricos salvos pelo usuário sem versionamento rastreável.
3. **Dados de Demonstração:** ativos e dados de exemplo (como demonstrações para novos usuários) devem ser destacados visualmente como fictícios ou demonstrativos, sem nunca se misturar ao patrimônio real da carteira.
