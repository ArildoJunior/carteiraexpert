# Fase 04 — Ações Corporativas e Subscrições

## Objetivo

Implementar o suporte a eventos societários de renda variável e ofertas de direitos de subscrição com precisão matemática, idempotência e rastreabilidade.

## Pacote 04.01 — Desdobramento e Grupamento de Ativos

### Incluído e Comprovado

- Desdobramento (`SPLIT`): aumento proporcional da quantidade e redução inversamente proporcional do custo médio unitário, mantendo inalterado o custo investido total;
- Grupamento (`GROUPING`): redução proporcional da quantidade e aumento inversamente proporcional do custo médio unitário, mantendo o custo investido invariante;
- Preservação e identificação de frações residuais em `Decimal`;
- Integração ao motor de posições, extrato `/history` e visualização de ativos.

### Critérios de Aceite

- [x] Desdobramento ajusta quantidade e custo médio preservando o custo econômico total;
- [x] Grupamento ajusta quantidade e custo médio de forma determinística;
- [x] Suítes de testes unitários (`corporate-action-engine.test.ts`) e integração (`corporate-actions.service.test.ts`) aprovadas.

## Pacote 04.02 — Bonificação e Proventos em Dinheiro

### Incluído e Comprovado

- Bonificação de ações (`BONUS_SHARE`): incorporação de novas cotas à custódia com custo atribuído opcional e recálculo de custo médio;
- Dividendos em dinheiro (`DIVIDEND`): crédito isento de proventos vinculado a Data-Com e Data de Pagamento, preservando quantidade e custo total;
- Juros sobre Capital Próprio (`JCP`): apuração do provento com retenção na fonte de 15% de IRRF e crédito do rendimento líquido;
- Exigência de custódia positiva na Data-Com e obrigatoriedade de Data de Pagamento (`settlementDate`);
- Totalização acumulada de proventos recebidos no card métrico `totalIncomeReceived`.

### Critérios de Aceite

- [x] Bonificação ajusta posição e custo médio conforme custo fiscal atribuído;
- [x] Dividendos creditam valor e mantêm quantidade e custo inalterados;
- [x] JCP retém 15% de IRRF deterministicamente;
- [x] Suítes de testes unitários e de integração aprovadas.

## Pacote 04.03 — Subscrições e Direitos Societários

### Incluído e Comprovado

- Modelo relacional composto por 3 tabelas dedicadas:
  1. `subscription_offers`: cadastro da oferta de subscrição, datas de corte/exercício e preço de emissão;
  2. `subscription_rights`: custódia de direitos alocada por carteira e controle de status (`ACTIVE`, `PARTIALLY_EXERCISED`, `FULLY_EXERCISED`, `EXPIRED`, `CANCELLED`);
  3. `subscription_exercises`: registro do exercício de direitos com chave de idempotência (`idempotencyKey`), gerando atomicamente o evento operacional correspondente do tipo `BUY` na tabela `portfolio_events`.
- Cobertura comprovada por testes unitários (`subscription-engine.test.ts`), testes de integração em PostgreSQL real (`subscription-service.test.ts`, `subscription-actions.test.ts`) e testes ponta a ponta (`e2e/subscription.spec.ts`).

### Fora do Escopo desta Fase

- Fusões, cisões, incorporações, amortizações de capital complexas e OPA (*Planejado, não implementado*);
- Eventos societários internacionais (*Planejado, não implementado*).

### Critérios de Aceite

- [x] Ofertas e custódia de direitos são gerenciadas no banco relacional;
- [x] Exercício de subscrição gera evento `BUY` com controle de idempotência via `idempotencyKey`;
- [x] Testes unitários, de integração e E2E aprovados para subscrições.

## Matriz de Cobertura e Validação dos Eventos da Fase 04

| Evento / Funcionalidade | Motor Implementado | Teste Unitário | Teste de Integração | Teste E2E | Classificação Final |
|---|---|---|---|---|---|
| Desdobramento (`SPLIT`) | Sim (`applySplit`) | Sim | Sim | Não verificado | **Implementado e validado** |
| Grupamento (`GROUPING`) | Sim (`applyGrouping`) | Sim | Sim | Não verificado | **Implementado e validado** |
| Bonificação (`BONUS_SHARE`) | Sim (`applyBonusShare`) | Sim | Sim | Não verificado | **Implementado e validado** |
| Dividendos (`DIVIDEND`) | Sim (`calculateDividend`) | Sim | Sim | Não verificado | **Implementado e validado** |
| JCP com 15% IRRF (`JCP`) | Sim (`calculateJcp`) | Sim | Sim | Não verificado | **Implementado e validado** |
| Subscrições (`subscription_*`) | Sim (`subscription-engine.ts`) | Sim | Sim | Sim (`e2e/subscription.spec.ts`) | **Implementado e validado** |
| Reorganizações complexas / OPA | Não | Não | Não | Não | **Planejado, não implementado** |