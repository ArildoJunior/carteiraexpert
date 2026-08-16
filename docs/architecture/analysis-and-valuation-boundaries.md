# Fronteiras de análise, indicadores, valuation e projeções

## Objetivo

Oferecer ferramentas informativas para organizar dados e aplicar metodologias transparentes. Este domínio não decide pelo usuário e não transforma resultado matemático em recomendação.

## Subdomínios

### market-fundamentals

Responsável por receber dados financeiros normalizados e produzir indicadores com período, unidade, fonte, data de referência e qualidade. Exemplos: P/L, P/VP, ROE, ROA, ROIC, margens, payout, dívida líquida/EBITDA, liquidez, vacância e alavancagem.

Não deve inventar valores ausentes nem comparar métricas incompatíveis entre setores sem explicitar a limitação.

### technical-analysis

Responsável por séries de preço e volume e por cálculos descritivos como médias, volatilidade, retornos, drawdown, bandas e outros indicadores autorizados. Não deve emitir sinal de compra/venda nem ordenar ativos.

### screening

Responsável por filtros definidos pelo usuário para ações, FIIs e, futuramente, outras classes. O resultado é uma lista de ativos que atendem às condições informadas; não é uma recomendação.

### valuation

Responsável por metodologias parametrizadas e reproduzíveis: Bazin, Graham, Peter Lynch e fluxo de caixa descontado. Cada resultado deve guardar fórmula/metodologia, versão, entradas, fontes, data de referência, arredondamento e limitações.

### projections

Responsável por cenários hipotéticos de um ativo ou carteira. Deve separar carteira real, cenário simulado e comparação de cenários. Premissas podem ser históricas, fornecidas pelo usuário ou inferidas por regra documentada; a origem deve ser visível.

### user-metrics

Responsável por permitir que o usuário crie uma métrica ou taxa própria com nome, fórmula limitada, entradas, pesos, escala, versão e aceite explícito. A métrica não pode ser apresentada como recomendação da plataforma.

## Dependências permitidas

- Dados financeiros e preços entram por contratos de leitura.
- O domínio de análise não altera eventos da carteira.
- O domínio de análise não é fonte de verdade patrimonial.
- Valuation não altera posição, custo médio ou saldo.
- IA não calcula indicadores, valuations ou projeções.

## Contrato mínimo de qualquer resultado

Todo resultado deve conter: ativo ou carteira, período, moeda, data/hora, fonte, entradas, metodologia, versão, estado de qualidade, premissas, limitações e indicação de que é informativo.
