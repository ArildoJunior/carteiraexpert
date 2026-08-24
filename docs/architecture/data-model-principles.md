# Princípios do Modelo de Dados

## 1. Fonte de Verdade Patrimonial

A fonte de verdade primária e auditável do patrimônio são os fatos históricos registrados e validados no banco de dados.

### 1.1. Eventos Operacionais em `portfolio_events`
No schema de eventos patrimoniais (`src/lib/db/schema/portfolio.ts`), os tipos operacionais implementados são:
- **`BUY`:** compra ou aquisição de ativos (inclui ações, FIIs, ETFs, BDRs, etc., e novos lotes resultantes de exercício de subscrição).
- **`SELL`:** venda de ativos, com apuração determinística de PnL realizado e baixa de posição.
- **`TRANSFER_IN`:** transferência de custódia de entrada para a carteira.
- **`TRANSFER_OUT`:** transferência de custódia de saída da carteira.
- **`MANUAL_ADJUSTMENT`:** ajuste corretivo de posição ou quantidade com trilha de auditoria.
- **`REVERSAL`:** estorno ou reversão de evento anterior.

### 1.2. Ações Corporativas Processadas pelo Domínio
No motor de eventos societários (`src/modules/corporate-actions/domain/corporate-action-engine.ts`), as ações corporativas processadas são:
- **`SPLIT`:** desdobramento de ações com aumento proporcional de quantidade e redução de custo unitário.
- **`GROUPING`:** grupamento de ações com redução proporcional de quantidade e aumento de custo unitário.
- **`BONUS_SHARE`:** bonificação de ações com recebimento de novas cotas e incorporação opcional de custo atribuído.
- **`DIVIDEND`:** provento em dinheiro isento de retenção fiscal.
- **`JCP`:** Juros sobre Capital Próprio com retenção na fonte de 15% de IRRF.

### 1.3. Modelo Relacional de Subscrições
Em vez de um tipo único de evento em texto, as subscrições possuem modelo relacional próprio composto por três entidades (`src/lib/db/schema/subscription.ts`):
1. **`subscription_offers`:** parâmetros da emissão (ativo de origem, ativo do direito, ativo subscrito, prazos e preço de exercício).
2. **`subscription_rights`:** lotes de direitos atribuídos a uma carteira específica, com controle de status (`ACTIVE`, `PARTIALLY_EXERCISED`, `FULLY_EXERCISED`, `EXPIRED`, `CANCELLED`).
3. **`subscription_exercises`:** registros atômicos de exercício de direitos, vinculados a um evento `BUY` em `portfolio_events` com chave de idempotência.

### 1.4. Eventos Planejados e Não Implementados
Os seguintes tipos de eventos representam capacidades futuras no roadmap e **não existem** no schema ou no código atual:
- `CRYPTO_SWAP` (*Planejado, não implementado*);
- `OPTION_EXERCISE` e `OPTION_EXPIRATION` (*Planejados, não implementados*);
- Eventos de caixa: depósito, retirada, aporte e resgate monetário (*Regra aprovada, implementação pendente*);
- Eventos institucionais de custódia por corretora (*Regra aprovada, implementação pendente*).

## 2. Preservação e Rastreabilidade de Fatos Históricos

- Fatos históricos são preservados por padrão e corrigidos por cancelamento lógico, reversão, ajuste manual ou novo lançamento corretivo. A imutabilidade lógica e a rastreabilidade são princípios do modelo; isso não significa que todas as linhas sejam fisicamente imutáveis.
- A tabela `audit_logs` registra alterações críticas (`INSERT`, `UPDATE`, `DELETE`, `REVERSAL`, `ADJUSTMENT`) contendo ator, tipo de ator, identificador de correlação e snapshots sanitizados do estado anterior e posterior.

## 3. Projeções e Cálculos Derivados

Para garantir desempenho e evitar inconsistências, posições e métricas analíticas são calculadas sob demanda ou projetadas a partir dos eventos:

- **Posição Atual e Custo Médio Ponderado:** Calculados deterministicamente pelo motor de posições (`position-engine.ts`) a partir da sequência cronológica de eventos.
- **PnL Realizado:** Cálculo derivado apurado a cada operação de venda (`SELL`), confrontando o preço líquido de venda com o custo médio ponderado vigente. Não constitui tabela física persistida.
- **Evolução Patrimonial Temporal:** Gerada sob demanda pelo motor de evolução (`portfolio-evolution-engine.ts`) via replay temporal de eventos até a data de avaliação.
- **Saldo de Caixa Monetário:** *Regra aprovada, implementação pendente*. Não existe tabela ou projeção de saldo de caixa persistida no estado atual.
- **Resumo Tributário:** *Parcialmente implementado*. Bases factuais disponíveis através de PnL realizado e proventos apurados nos motores de domínio.
- **Custódia Institucional:** Não existem entidades de corretoras ou custodiantes no banco. A estrutura `custodyMap` nos motores é estritamente uma estrutura Map em memória para consolidação de ativos durante o cálculo.

## 4. Precisão Numérica e Tipagem

- **Valores Monetários e Cotações:** Obrigatoriamente `NUMERIC(20, 8)` no PostgreSQL e classe `Decimal` no TypeScript.
- **Quantidades de Ativos e Criptoativos:** Obrigatoriamente `NUMERIC(28, 10)` no PostgreSQL e classe `Decimal` no TypeScript.
- **Proibição de Ponto Flutuante:** É terminantemente proibido o uso de `number`, `FLOAT`, `REAL` ou `DOUBLE PRECISION` para valores monetários, taxas, cotações, preços médios ou quantidades.
- **Datas e Fusos Horários:** Todas as colunas temporais utilizam `TIMESTAMP WITH TIME ZONE` (`TIMESTAMPTZ`) persistidas com referência horária UTC.

## 5. Estrutura Física do Banco de Dados

O banco de dados relacional é composto exatamente por **19 tabelas físicas oficiais**:
1. `audit_logs`
2. `users`
3. `sessions`
4. `password_reset_tokens`
5. `auth_rate_limits`
6. `user_consents`
7. `portfolios`
8. `assets`
9. `portfolio_events`
10. `subscription_offers`
11. `subscription_rights`
12. `subscription_exercises`
13. `market_quotes`
14. `exchange_rates`
15. `commercial_plans`
16. `plan_entitlements`
17. `user_plans`
18. `billing_subscriptions`
19. `payment_events`