# Valuation e projeções

## Metodologias

### Bazin

Usar dividendos por ação e yield definido pelo usuário ou pela configuração do cenário. Exibir fórmula, período do dividendo, tratamento de dividendos extraordinários, fonte e limitações. “Preço teto” é nome da metodologia, não orientação.

### Graham

Exibir entradas usadas, fórmula adotada, moeda, período e limitações. Não aplicar fórmula universalmente a setores ou ativos incompatíveis sem sinalização.

### Peter Lynch

Exibir crescimento usado, P/L, dividend yield e fórmula/versionamento. O resultado deve ser descrito como métrica metodológica, não como aprovação do ativo.

### Fluxo de caixa descontado

Permitir histórico e projeções futuras com premissas explícitas: crescimento, taxa de desconto, horizonte, valor terminal, número de ações, moeda e tratamento de caixa/dívida. Não assumir que lucro líquido é fluxo de caixa livre; se for usado como proxy, marcar expressamente a limitação.

## Projeção de ativo e carteira

O usuário pode simular quantidade, aportes, crescimento, dividendos, reinvestimento, câmbio, inflação, taxas e cenários. O cenário deve ser imutável após execução ou versionado quando editado. Nunca alterar a carteira real.

## Premissas inferidas

Premissa inferida deve mostrar: método de inferência, dados usados, período, data, confiança/limitação e opção para o usuário substituir ou aceitar. “Inferido” não significa “provável” nem “garantido”.

## Métrica/taxa personalizada

O usuário pode criar uma taxa própria com nome, fórmula dentro do conjunto suportado, campos de entrada, pesos, limites e versão. Deve haver validação contra divisão por zero, unidade incompatível e resultado fora da escala. O sistema não deve endossar a taxa como método oficial.
