# Fase 03 — Núcleo de Carteira, Ativos e Posições

## Objetivo

Permitir a gestão de carteiras pelo usuário, cadastro de ativos, registro de eventos operacionais, cálculo determinístico de posições e custo médio ponderado, e histórico paginado com filtros.

## Pacote 03.01 — Gestão de Carteiras e Catálogo de Ativos

### Incluído e Comprovado

- Criação, listagem, edição e arquivamento de carteiras estruturais (`portfolios`);
- Suporte estrutural a múltiplas carteiras por usuário;
- Catálogo de ativos (`assets`) suportando ações, FIIs, ETFs, BDRs, criptoativos e ativos customizados;
- Lançamentos manuais de operações na tabela `portfolio_events`: processamento comprovado no motor de posições para `BUY`, `SELL`, `TRANSFER_IN` e `TRANSFER_OUT`; tipos `MANUAL_ADJUSTMENT` e `REVERSAL` presentes no schema, enum e auditoria, com cálculo contábil no motor classificado como não verificado / pendente de detalhamento;
- Persistência obrigatória de datas em UTC (`tradeDate`, `settlementDate`), quantidades em `NUMERIC(28, 10)` e preços/taxas em `NUMERIC(20, 8)`.

### Fora do Escopo e Regras Pendentes

- Atributo formal de finalidade (`purpose`: `REAL`, `ESTUDO`, `ANALISE`) (*Regra aprovada, implementação pendente*);
- Modelagem formal e suporte comercial a múltiplas carteiras `REAL` (*Regra aprovada, implementação pendente*);
- Quotas de carteiras por plano e status `frozen` (*Regra aprovada, implementação pendente*);
- Gestão de saldo de caixa, contas correntes e corretoras (*Regra aprovada, implementação pendente*).

### Critérios de Aceite

- [x] Usuário cria e gerencia suas próprias carteiras;
- [x] Lançamentos operacionais comprovados (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`) são persistidos e calculados com precisão decimal;
- [x] Operações pertencem exclusivamente a uma carteira e são isoladas por `userId` nas consultas analisadas;
- [x] Suítes de testes de carteiras e ativos aprovadas (unitários, integração e E2E).

## Pacote 03.02 — Motor de Posição, Custo Médio e PnL Realizado

### Incluído e Comprovado

- Motor determinístico de cálculo de posição (`src/modules/portfolio/domain/position-engine.ts`);
- Custo médio ponderado recalculado a cada aquisição (`BUY`, `TRANSFER_IN`), incorporando taxas no custo total;
- Redução proporcional de custo e quantidade em transferências de saída (`TRANSFER_OUT`);
- Apuração factual de PnL realizado por venda (`SELL`) deduzindo taxas de corretagem;
- Validação temporal de saldo impedindo vendas descobertas via erro de domínio `InsufficientPositionError`;
- Cancelamento lógico auditável de eventos (`deletedAt` e `cancellationReason`), sendo ignorados nos cálculos subsequentes do motor.

### Fora do Escopo deste Pacote

- Marcação a mercado em tempo real e gráficos de rentabilidade não realizada (Fase 06);
- Módulo fiscal dedicado e relatórios de IRPF (Fase 09).

### Critérios de Aceite

- [x] Compras e entradas acumulam quantidade e recalculam custo médio;
- [x] Vendas baixam quantidade e custo proporcionalmente e apuram PnL realizado;
- [x] Venda superior à custódia disponível lança `InsufficientPositionError`;
- [x] Cancelamento lógico é desconsiderado pelo motor nos cálculos;
- [x] Testes unitários e de integração cobrindo regras e casos de borda aprovados.

## Pacote 03.03 — Histórico, Extrato e Visões de Interface

### Incluído e Comprovado

- Extrato cronológico e histórico de operações na rota `/history` com paginação e filtros por ativo, tipo de evento e período;
- Visualização contextual por carteira selecionada na rota `/portfolios/[id]`;
- Dashboard consolidado na rota `/dashboard` totalizando as carteiras ativas do usuário (*Comportamento atual transitório*);
- Feed de atividades recentes e cards métricos no dashboard.

### Fora do Escopo e Regras Pendentes

- Dashboard contextual na rota `/dashboard` operando sobre carteira única (*Regra aprovada, implementação pendente de refatoração de rota*);
- Exportação de relatórios em PDF.

### Critérios de Aceite

- [x] Extrato exibe eventos com badges, datas, quantidades e valores de forma paginada;
- [x] Rota `/portfolios/[id]` opera de forma estritamente contextual sobre a carteira selecionada;
- [x] Consultas e operações analisadas utilizam `userId` autenticado no servidor.