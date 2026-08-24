# Fase 05 — Planos, Entitlements e Assinaturas

## Objetivo

Implementar o modelo comercial de planos (Free e Pro), catálogo de entitlements técnicos, estrutura de assinaturas e ciclo de vida de faturamento, e gestão de grupos compartilhados com preservação do isolamento estrito de dados financeiros.

## Estado Atual da Fase

> **Classificação:** **Parcialmente implementada e validada nos Pacotes 05.01, 05.02 e 05.03.**
> - Pacote 05.01: Catálogo comercial (`commercial_plans`, `plan_entitlements`, `user_plans`), quotas por plano e congelamento em downgrade (`frozen`).
> - Pacote 05.02: Estrutura de assinaturas (`billing_subscriptions`), eventos de pagamento (`payment_events`), idempotência estrita e adaptação agnóstica de gateways.
> - Pacote 05.03: Experiência comercial e gestão de planos com interface dedicada `/plans`, quotas em tempo real e transparência sem cobrança real.
> - Pacote 05.04 (Grupo Compartilhado — ADR-004) e Integração de Gateways Reais: Planejados para evolução futura.

*Nota de Desambiguação:* As tabelas `subscription_offers`, `subscription_rights` e `subscription_exercises` tratam exclusivamente de direitos societários de renda variável (subscrição de ações) e **não possuem relação com planos comerciais SaaS**. As assinaturas SaaS são gerenciadas em `billing_subscriptions` e `payment_events`.

## Pacote 05.01 — Entitlements e Quotas por Plano

### Entregue e Homologado (`PASS`)

- Catálogo de recursos e entitlements técnicos (`commercial_plans`, `plan_entitlements`, `user_plans`);
- Plano Free (limite de 2 carteiras ativas) e plano Pro (até 10 carteiras ativas);
- Enforcement server-side via `assertCanCreatePortfolio` com lock pessimista (`FOR UPDATE`);
- Regras de downgrade com preservação total de dados e congelamento de carteiras excedentes (`status = 'frozen'`);
- Bloqueio estrito de escrita em carteiras congeladas via `assertPortfolioWritable`.

### Critérios de Aceite

- [x] Usuário Free acessa exclusivamente recursos autorizados para seu plano (máximo 2 carteiras ativas);
- [x] Usuário de plano Pro tem acesso aos recursos expandidos (até 10 carteiras ativas);
- [x] Downgrade preserva integralmente os dados financeiros do usuário, sem exclusões automáticas;
- [x] Carteiras excedentes em downgrade entram no estado `frozen` (apenas leitura);
- [x] Testes de validação de permissões e quotas por plano implementados e aprovados (unitários, integração e E2E).

## Pacote 05.02 — Estrutura de Assinaturas e Pagamentos

### Entregue e Homologado (`PASS`)

- Tabelas relacionais `billing_subscriptions` e `payment_events` com migração `0008`;
- Máquina de estados de assinatura: `incomplete`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`;
- Idempotência estrita em eventos de pagamento via `idempotency_key` único;
- Sincronização atômica e transacional com `user_plans`;
- Fallback automático para o plano Free e congelamento de excedentes em inadimplência (`unpaid`);
- Interface agnóstica `PaymentGatewayAdapter` e adaptador `MockPaymentGatewayAdapter` para testes sem chamadas de rede;
- Server Action segura `getUserBillingSummaryAction` e seção informativa em `/portfolios`.

### Critérios de Aceite

- [x] Criação, atualização e cancelamento de assinaturas com validação Zod e auditoria;
- [x] Cancelamento com `cancelAtPeriodEnd = true` mantém benefícios até o término do ciclo contratado;
- [x] Inadimplência (`unpaid`) e cancelamento imediato rebaixam para Free e acionam congelamento transacional;
- [x] Processamento de eventos de pagamento idempotente por chave única sem duplicações;
- [x] Zero chamadas externas de rede, sem SDKs de gateway instalados e sem rotas públicas de webhook ativo;
- [x] 19 tabelas físicas validadas pelo Schema Guardian e testes unitários e de integração aprovados.

## Pacote 05.03 — Experiência Comercial de Planos

### Entregue e Homologado (`PASS`)

- Página visual dedicada `/plans` com visão comparativa e transparente de recursos entre Free e Pro;
- Indicador em tempo real de quotas (carteiras ativas, disponíveis e congeladas);
- Status de assinatura descritivo com períodos de vigência e carência;
- Alerta contextual destacado para carteiras congeladas após downgrade;
- Botão de upgrade desabilitado com aviso explicativo informando que pagamentos automatizados estão em preparação;
- Ausência total de formulários de pagamento, dados de cartão ou botões falsos de checkout;
- Cobertura por testes unitários (`plans-view-ui.test.tsx`) e E2E no Playwright (`plans-view.spec.ts`).

### Critérios de Aceite

- [x] Página `/plans` acessível no dashboard e protegida por autenticação;
- [x] Exibição fidedigna do plano Free e plano Pro com seus respectivos limites;
- [x] Quota e status de faturamento consultados de forma segura a partir do servidor;
- [x] Tratamento de estados `active`, `trialing`, `past_due`, `canceled` e `unpaid`;
- [x] Nenhuma chamada a gateways externos ou endpoints de pagamento;
- [x] Suíte completa de testes aprovada.

## Pacote 05.04 — Grupo Compartilhado e Isolamento (ADR-004)

### Planejado

- Gestão de grupo de assinatura com titular pagante;
- Envio e aceite de convites para membros (limite de 3 a 5 participantes);
- Desvinculação ou cancelamento de membros com rebaixamento para o plano Free;
- **Isolamento de Dados Obrigatório:** O pagamento compartilhado não concede ao titular nem aos membros acesso para visualizar, editar ou inferir dados de carteiras, ativos ou relatórios financeiros uns dos outros.

### Fora do Escopo Permanente

- Carteira compartilhada ou cotitularidade de patrimônio;
- Consolidação automática de investimentos entre membros familiares.

### Critérios de Aceite (Pendentes)

- [ ] Titular gerencia convites e composição do grupo;
- [ ] Membros recebem entitlements sem acesso aos dados financeiros do titular;
- [ ] Titular não visualiza dados financeiros dos membros convidados;
- [ ] Cancelamento remove os benefícios de plano sem apagar dados das carteiras;
- [ ] Testes automatizados cobrindo explicitamente o isolamento do ADR-004 implementados.