# Ações Corporativas e Subscrições

Este documento descreve os modelos de ações corporativas e subscrições implementados no módulo `corporate-actions` do CarteiraExpert e sua respectiva cobertura de testes.

## 1. Ações Corporativas Suportadas no Domínio

O motor de eventos societários (`src/modules/corporate-actions/domain/corporate-action-engine.ts`) e o motor de posições (`src/modules/portfolio/domain/position-engine.ts`) processam os seguintes eventos:

### 1.1. Desdobramento (`SPLIT`)
- **Regra:** Aumento proporcional da quantidade de cotas/ações detidas e redução inversamente proporcional do custo médio unitário, mantendo inalterado o custo investido total.
- **Fórmula:**
  $$\text{Quantidade Nova} = \text{Quantidade Anterior} \times \text{ratio}$$
  $$\text{Custo Médio Novo} = \frac{\text{Custo Médio Anterior}}{\text{ratio}}$$

### 1.2. Grupamento (`GROUPING`)
- **Regra:** Redução proporcional da quantidade de cotas/ações e aumento inversamente proporcional do custo médio unitário, mantendo inalterado o custo investido total.
- **Fórmula:**
  $$\text{Quantidade Nova} = \frac{\text{Quantidade Anterior}}{\text{ratio}}$$
  $$\text{Custo Médio Novo} = \text{Custo Médio Anterior} \times \text{ratio}$$

### 1.3. Bonificação de Ações (`BONUS_SHARE`)
- **Regra:** Incorporação de novas cotas/ações à custódia (`bonusQuantity`).
- **Custo Atribuído:** Caso a emissão atribua custo fiscal (`allocatedCost > 0`), o custo investido total é acrescido desse valor, recalculando-se o custo médio ponderado da posição:
  $$\text{Custo Total Novo} = \text{Custo Total Anterior} + \text{allocatedCost}$$
  $$\text{Custo Médio Novo} = \frac{\text{Custo Total Novo}}{\text{Quantidade Anterior} + \text{bonusQuantity}}$$

### 1.4. Dividendos (`DIVIDEND`)
- **Regra:** Provento em dinheiro creditado sem incidência ou retenção de imposto de renda, vinculado a uma data de corte (`exDate`) e data de pagamento.

### 1.5. Juros sobre Capital Próprio (`JCP`)
- **Regra:** Provento em dinheiro com incidência e retenção de 15% de IRRF. O motor calcula deterministicamente:
  $$\text{Valor Líquido} = \text{Valor Bruto} \times 0.85$$

## 2. Modelo Relacional de Subscrições

As subscrições são gerenciadas por um modelo relacional dedicado composto por três tabelas (`src/lib/db/schema/subscription.ts`):

1. **`subscription_offers` (Ofertas de Subscrição):** Registra ativo de origem, ativo do direito, ativo final subscrito, prazos de corte/exercício e preço de emissão.
2. **`subscription_rights` (Direitos de Subscrição):** Registra a custódia de direitos alocada a uma carteira, controlando quantidade alocada, exercida e status (`ACTIVE`, `PARTIALLY_EXERCISED`, `FULLY_EXERCISED`, `EXPIRED`, `CANCELLED`).
3. **`subscription_exercises` (Exercício de Direitos):** Registra a liquidação do exercício de direitos, calculando o custo financeiro total e gerando atomicamente o evento operacional correspondente do tipo `BUY` na tabela `portfolio_events` com chave de idempotência (`idempotencyKey`).

## 3. Matriz de Cobertura de Testes e Validação Individual

A tabela abaixo discrimina o estado de implementação e os níveis de testes comprovados para cada evento societário:

| Evento / Funcionalidade | Implementado no Motor | Teste Unitário | Teste de Integração | Teste E2E | Classificação Final |
|---|---|---|---|---|---|
| Desdobramento (`SPLIT`) | Sim (`applySplit`) | Sim (`corporate-action-engine.test.ts`) | Sim (`corporate-actions.service.test.ts`) | Não verificado | **Implementado e validado** |
| Grupamento (`GROUPING`) | Sim (`applyGrouping`) | Sim (`corporate-action-engine.test.ts`) | Sim (`corporate-actions.service.test.ts`) | Não verificado | **Implementado e validado** |
| Bonificação (`BONUS_SHARE`) | Sim (`applyBonusShare`) | Sim (`corporate-action-engine.test.ts`) | Sim (`corporate-actions.service.test.ts`) | Não verificado | **Implementado e validado** |
| Dividendos (`DIVIDEND`) | Sim (`calculateDividend`) | Sim (`corporate-action-engine.test.ts`) | Sim (`corporate-actions.service.test.ts`) | Não verificado | **Implementado e validado** |
| JCP com 15% IRRF (`JCP`) | Sim (`calculateJcp`) | Sim (`corporate-action-engine.test.ts`) | Sim (`corporate-actions.service.test.ts`) | Não verificado | **Implementado e validado** |
| Subscrições (`subscription_*`) | Sim (`subscription-engine.ts`) | Sim (`subscription-engine.test.ts`) | Sim (`subscription-service.test.ts`) | Sim (`e2e/subscription.spec.ts`) | **Implementado e validado** |
| Fusões, cisões e incorporações | Não | Não | Não | Não | **Planejado, não implementado** |
| Amortizações de capital complexas | Não | Não | Não | Não | **Planejado, não implementado** |
| Ofertas Públicas de Aquisição (OPA) | Não | Não | Não | Não | **Planejado, não implementado** |
| Eventos societários internacionais | Não | Não | Não | Não | **Planejado, não implementado** |

## 4. Idempotência e Auditoria nos Fluxos Comprovados

- **Idempotência Comprovada:** A garantia de idempotência é atribuída aos fluxos comprovados por testes, especialmente o exercício de subscrições através da chave `idempotencyKey` validada em `subscription-service.test.ts`.
- **Validação de Integração:** Os fluxos de ações corporativas efetivamente exercitados em `corporate-actions.service.test.ts` possuem validação de integração no PostgreSQL real, conforme os cenários cobertos pelo teste. Isso não constitui comprovação de suporte geral a reversões nem de cobertura integral de todos os eventos societários.
- **Trilha de Auditoria:** O registro em `audit_logs` ocorre nos fluxos que utilizam o mecanismo de auditoria do sistema.
- **Limitação de Escopo:** Não é afirmada garantia geral de idempotência, auditoria irrestrita ou suporte universal a reversões para todos os tipos possíveis de eventos corporativos.