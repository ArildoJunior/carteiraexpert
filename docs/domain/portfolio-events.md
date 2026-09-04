# Eventos Operacionais de Carteira

Este documento descreve os eventos operacionais patrimoniais persistidos na tabela `portfolio_events` do CarteiraExpert.

## 1. Tipos de Eventos Implementados

A tabela `portfolio_events` (`src/lib/db/schema/portfolio.ts`) armazena os fatos históricos do extrato de uma carteira, abrangendo tanto eventos operacionais de negociação quanto eventos societários (ações corporativas), conforme o enum canônico `PORTFOLIO_EVENT_TYPES` (`src/modules/portfolio/domain/portfolio-event.schema.ts`):

### 1.1. Eventos Operacionais de Negociação e Custódia
- **`BUY`:** Compra ou aquisição de ativos (ações, FIIs, ETFs, BDRs, criptoativos, etc., incluindo novos lotes originados por liquidação de subscrição).
- **`SELL`:** Venda ou alienação de ativos, com baixa proporcional de quantidade e custo investido, e apuração determinística de PnL realizado.
- **`TRANSFER_IN`:** Transferência de custódia de entrada para a carteira selecionada, incorporando a quantidade e o custo unitário informado.
- **`TRANSFER_OUT`:** Transferência de custódia de saída da carteira, reduzindo a quantidade e o custo investido proporcionalmente (sem apuração de lucro/prejuízo mercantil).
- **`MANUAL_ADJUSTMENT`:** Tipo presente no schema e no enum para ajustes manuais de posição (*Tratamento contábil no motor `position-engine.ts`: Pendência técnica*).
- **`REVERSAL`:** Tipo presente no schema e no enum para estorno de eventos anteriores (*Tratamento contábil no motor `position-engine.ts`: Pendência técnica*).

### 1.2. Eventos Societários (Ações Corporativas)
Orquestrados pelo módulo `src/modules/corporate-actions/` e persistidos na tabela `portfolio_events`:
- **`SPLIT`:** Desdobramento de ações com aumento proporcional de quantidade e redução de custo unitário.
- **`GROUPING`:** Grupamento de ações com redução proporcional de quantidade e aumento de custo unitário.
- **`BONUS_SHARE`:** Bonificação em cotas com custo atribuído opcional e recálculo de custo médio.
- **`DIVIDEND`:** Rendimentos isentos em dinheiro creditados na data de liquidação com base na custódia elegível da Data-Com.
- **`JCP`:** Juros sobre Capital Próprio em dinheiro com retenção de 15% de IRRF retido na fonte.

### 1.3. Direitos de Subscrição
- **Subscrições:** Possuem modelo relacional próprio composto por três tabelas (`subscription_offers`, `subscription_rights`, `subscription_exercises`), no qual o exercício gera atomicamente um evento operacional do tipo `BUY` com controle de idempotência via `idempotencyKey`.

### 1.4. Relação com Contas de Caixa e Custódia Institucional
Movimentações monetárias de caixa (depósitos, retiradas, transferências e liquidações) são gerenciadas em tabelas próprias no módulo de caixa (`cash_accounts` e `cash_transactions`). A vinculação a corretoras e instituições é realizada através das tabelas relacionais de custódia (`custody_institutions` e `custody_accounts`), associadas opcionalmente aos eventos de carteira via `custody_account_id`.

## 2. Campos Físicos do Schema (`portfolio_events`)

Os campos comprovados na tabela `portfolio_events` são:

- `id`: Identificador único do evento (UUID, chave primária);
- `portfolioId`: Identificador da carteira associada (UUID, chave estrangeira para `portfolios.id`);
- `assetId`: Identificador do ativo negociado (UUID, chave estrangeira para `assets.id`);
- `type`: Tipo operacional (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`);
- `direction`: Direção contábil do ajuste (`IN` ou `OUT`, obrigatório para `MANUAL_ADJUSTMENT`, `NULL` para os demais tipos, validado por Zod e check constraint física `chk_portfolio_events_direction`);
- `tradeDate`: Data e hora da operação em UTC (`TIMESTAMPTZ`, obrigatório);
- `settlementDate`: Data e hora de liquidação em UTC (`TIMESTAMPTZ`, opcional);
- `quantity`: Quantidade movimentada (`NUMERIC(28, 10)`, obrigatório, estritamente positiva `> 0`);
- `unitPrice`: Preço unitário de negociação (`NUMERIC(20, 8)`, obrigatório, não-negativo `>= 0`);
- `fees`: Taxas, emolumentos e corretagens (`NUMERIC(20, 8)`, obrigatório, não-negativo `>= 0`, padrão `0`);
- `currency`: Moeda original da transação (`TEXT`, padrão `'BRL'`);
- `notes`: Observações e anotações do usuário (`TEXT`, opcional);
- `source`: Origem do lançamento (`TEXT`, padrão `'manual'`, preenchimento textual complementar, ex: `'csv_import'`);
- `custodyAccountId`: Identificador opcional da conta de custódia / corretora vinculada (UUID, chave estrangeira para `custody_accounts.id` com `ON DELETE SET NULL`);
- `createdBy`: Identificador do usuário que realizou o lançamento (UUID, chave estrangeira para `users.id`);
- `createdAt`: Data e hora de criação do registro em UTC (`TIMESTAMPTZ`);
- `deletedAt`: Data e hora de cancelamento lógico / soft-delete em UTC (`TIMESTAMPTZ`, opcional);
- `cancellationReason`: Justificativa auditável do cancelamento lógico (`TEXT`, opcional).

*Nota:* Campos como `importJobId`, `metadata` ou `version` não existem na tabela física do banco de dados. A associação com lotes de importação é bidirecional via `import_batch_items.imported_portfolio_event_id`.

## 3. Regras de Negócio e Cálculo no Motor de Posições

O motor de posições (`src/modules/portfolio/domain/position-engine.ts`) aplica as seguintes regras determinísticas comprovadas no código e testes:

### 3.1. Posição em Custódia e Custo Médio Ponderado
- **Cálculo da Quantidade:** Acumulada sequencialmente a partir da ordenação cronológica crescente dos eventos por `tradeDate`. Eventos cancelados (`deletedAt IS NOT NULL`) são estritamente desconsiderados pelo filtro inicial do motor.
- **Custo Médio Ponderado em Compras e Entradas:** Em operações `BUY` e `TRANSFER_IN`, as taxas são incorporadas ao custo total:
  $$\text{Custo Total Novo} = \text{Custo Total Anterior} + (\text{quantity} \times \text{unitPrice} + \text{fees})$$
  $$\text{Custo Médio Unitário} = \frac{\text{Custo Total Novo}}{\text{Quantidade Total Nova}}$$
- **Redução Proporcional em Saídas (`TRANSFER_OUT`):** Reduz a quantidade e baixa o custo investido proporcionalmente ao custo médio ponderado vigente, sem apurar PnL de venda mercantil.
- **Venda Descoberta Proibida:** Tentativas de lançar vendas (`SELL`) com quantidade superior à posição em custódia na data lançam o erro `InsufficientPositionError`.

### 3.2. PnL Realizado em Vendas (`SELL`)
- Apurado deterministicamente no momento de cada venda:
  $$\text{Valor Líquido da Venda} = (\text{quantity} \times \text{unitPrice}) - \text{fees}$$
  $$\text{Custo de Aquisição Baixado} = \text{quantity} \times \text{Custo Médio Unitário}$$
  $$\text{PnL Realizado} = \text{Valor Líquido da Venda} - \text{Custo de Aquisição Baixado}$$

### 3.3. Cancelamento Lógico e Reversão
- **Cancelamento Lógico (Soft Delete):** Marcação de `deletedAt` e `cancellationReason`. O evento permanece no banco para auditoria e é ignorado nos cálculos subsequentes.
- **Reversão (`REVERSAL`):** Presente no enum e nas ações de auditoria (`audit_logs`); sua implementação no motor de posições permanece como regra de domínio pendente de detalhamento.

## 4. Limitações e Estado das Capacidades

| Capacidade | Estado Real no Código | Classificação |
|---|---|---|
| Lançamentos operacionais (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`) | Implementado | **Implementado e validado** |
| Tipos cadastrais e de auditoria (`MANUAL_ADJUSTMENT`, `REVERSAL`) | Implementado no schema | **Não verificado no motor de posições** |
| Cálculo determinístico de posições e custo médio ponderado | Implementado | **Implementado e validado** |
| Apuração de PnL realizado por venda | Implementado | **Implementado e validado** |
| Cancelamento lógico com justificativa | Implementado | **Implementado e validado** |
| Subscrições via modelo relacional de 3 entidades gerando `BUY` | Implementado | **Implementado e validado** |
| Gestão de saldos de caixa e contas correntes | Não implementado | **Regra aprovada, implementação pendente** |
| Contas de custódia institucional e corretoras | Não implementado | **Regra aprovada, implementação pendente** |