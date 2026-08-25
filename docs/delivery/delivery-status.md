# Estado Atual do Projeto

## Última atualização

2026-08-25

---

## Estado do Repositório Git

- **Branch:** `main` (sincronizada com `origin/main`)
- **Commit base:** `e73a5b3` (preparando pacote 05.01)

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais e ajustes, motor de posições, dashboard consolidado, extrato de histórico, o suporte completo a eventos corporativos (Split, Grupamento, Bonificação, Dividendos, JCP e Subscrições), a camada comercial e de quotas por plano (Pacote 05.01), a infraestrutura de dados de mercado com adaptador BRAPI, a persistência de preferências de gráficos e o sistema global de temas encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** **IMPLEMENTADA E VALIDADA** (Arquitetura modular monolítica, motor financeiro determinístico baseado em `Decimal`, persistência `NUMERIC`, infraestrutura de testes unitários, integração e E2E, e registro em `audit_logs` nos fluxos auditados).
- **Fase 02 — Identidade, Acesso e Segurança:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS** (Cadastro, login com hash Argon2id com parâmetros seguros, sessões com hash SHA-256 no banco, controle de taxa stateless com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD com trigger append-only em `user_consents`. As rotas e operações analisadas utilizam o identificador autenticado do usuário para restringir o acesso aos dados, com a cobertura completa de todas as rotas e serviços sujeita à validação contínua).
- **Fase 03 — Carteiras, Ativos e Posições:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS** (Gestão de múltiplas carteiras estruturais, catálogo de ativos, tipos operacionais com processamento no motor de posições comprovado por testes — `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT` e `MANUAL_ADJUSTMENT` —, suporte completo a `MANUAL_ADJUSTMENT` com direção `IN` (entrada com incorporação de custo e recálculo do custo médio sem PnL) e `OUT` (saída proporcional ao custo médio sem PnL mercantil e com rejeição atômica de saldo insuficiente via `InsufficientPositionError`), validação estrita no schema Zod e constraint física no PostgreSQL via migração `0006_add_portfolio_events_direction.sql`, tratamento formal de `REVERSAL` como evento neutro/sem efeito contábil sobre posições, custo, PnL ou taxas, validação de consistência temporal com normalização de direção em `validateTimelineConsistency`, cancelamento lógico com justificativa, extrato `/history` paginado com filtros avançados e modal `TransactionModal` na interface com testes unitários, integração e E2E).
- **Fase 04 — Ações Corporativas e Subscrições:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS**
  - **Pacote 04.01 — Split e Grupamento de Ativos:** Processamento determinístico de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`), preservação do custo total de aquisição invariante, identificação de frações em `Decimal`, validação temporal e integração à interface e extrato.
  - **Pacote 04.02 — Bonificação, Dividendos e JCP:** Processamento de bonificação de ações (`BONUS_SHARE`) com custo atribuído opcional e recálculo de custo médio, proventos em dinheiro — dividendos isentos (`DIVIDEND`) e Juros sobre Capital Próprio (`JCP`) com retenção de 15% de IRRF —, exigência de Data de Pagamento (`settlementDate`), validação de custódia na Data-Com (`tradeDate`) e totalização em `totalIncomeReceived`.
  - **Pacote 04.03 — Subscrições e Direitos Societários:** Modelo relacional composto por 3 tabelas (`subscription_offers`, `subscription_rights`, `subscription_exercises`), controle de prazos e direitos por carteira, liquidação financeira com geração atômica de evento operacional `BUY` com chave `idempotencyKey`, 4 modais de UI e cobertura comprovada por testes unitários, integração e E2E (`e2e/subscription.spec.ts`).
- **Fase 05 — Planos, Entitlements e Assinaturas:** **PARCIALMENTE IMPLEMENTADA E VALIDADA**
  - **Pacote 05.01 — Entitlements e Quotas por Plano:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Catálogo comercial com tabelas `commercial_plans`, `plan_entitlements` e `user_plans`, planos `free` (2 carteiras) e `pro` (10 carteiras) via migração `0007_add_commercial_plans_and_entitlements.sql`, fonte única de quota em `max_active_portfolios`, fallback sem efeitos colaterais em `getUserEffectivePlan`, bloqueio server-side via `assertCanCreatePortfolio` com lock concorrente `FOR UPDATE`, downgrade transacional com congelamento de excedentes em `frozen` e auditoria em `audit_logs`, bloqueio integral de mutações financeiras em carteiras congeladas via `assertPortfolioWritable`, permissão de soft delete para liberação voluntária de quota, badge visual e desabilitação na UI `/portfolios`, testes unitários, integração e E2E Playwright).
  - **Pacote 05.02 — Estrutura de Assinaturas e Pagamentos:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Estrutura de assinaturas comerciais com tabelas `billing_subscriptions` e `payment_events` via migração `0008_add_billing_subscriptions_and_payment_events.sql`, máquina de estados de ciclo de vida de faturamento, idempotência estrita por `idempotency_key`, sincronização atômica transacional com `user_plans`, fallback automático para FREE com congelamento de carteiras excedentes em caso de inadimplência/cancelamento imediato, interface abstrata `PaymentGatewayAdapter`, adaptador `MockPaymentGatewayAdapter`, Server Action segura `getUserBillingSummaryAction` e painel informativo na UI `/portfolios`, testes unitários e de integração em PostgreSQL real).
  - **Pacote 05.03 — Experiência Comercial de Planos:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Página dedicada `/plans` no dashboard, visão comparativa de recursos, quotas e carteiras ativas/congeladas em tempo real, status da assinatura com períodos de carência, ausência de checkout falso ou formulários de pagamento, botão de upgrade desabilitado com aviso explicativo e testes automatizados unitários, integração e E2E Playwright).
- **Fase 06 — Dados de Mercado, Valuation e Gráficos:** **HOMOLOGADA COM SUCESSO (`PASS`)** (Infraestrutura interna entregue: tabelas `market_quotes`, `exchange_rates` e `user_chart_preferences` via migrações `0005` e `0010`, adaptadores `ManualPayloadAdapter`, `MockProviderAdapter` e conector externo público `BrapiAdapter`, script CLI `scripts/ingest-market-data.ts`, serviço de ingestão `MarketDataIngestionService` com ranking de qualidade, motores determinísticos de valuation e evolução temporal diária "Mercado vs. Custo", gráficos Recharts de alocação por ativo/classe/moeda e evolução temporal com seletores interativos, persistência atômica de preferências visuais por usuário e área no PostgreSQL com fila serializada anti-concorrência `ChartPreferenceSyncQueue`, coalescência, proteção de estado local contra `router.refresh()` e isolamento multitenant estrito; automação agendada em background / cron jobs agendados e WebSockets permanecem como capacidades planejadas de infraestrutura futura).
- **Fase 07 — Importações Revisáveis:** **PLANEJADA, NÃO IMPLEMENTADA** (Upload, parsing de planilhas CSV/XLSX, extração assistida de notas em PDF e storage privado permanecem no roadmap).
- **Fase 08 — Ativos Internacionais e Criptoativos:** **PARCIALMENTE IMPLEMENTADA** (Multi-moeda, `exchange_rates`, conversão cambial determinística no valuation e precisão `NUMERIC(28, 10)` para criptoativos entregues; swaps, exchanges via API e custódia on-chain permanecem planejados).
- **Fase 09 — Projeções, Opções e Apoio Tributário:** **PARCIALMENTE IMPLEMENTADA NAS BASES** (Bases factuais de PnL realizado e IRRF sobre JCP entregues nos motores existentes; modelos teóricos Bazin/Graham/DCF, módulo operacional de opções e módulo fiscal dedicado permanecem planejados; DARF e IRPF completo estão fora do escopo permanente).
- **Fase 10 — IA Editorial e Preparação de Lançamento:** **PLANEJADA, NÃO IMPLEMENTADA** (Diretrizes de governança editorial aprovadas; infraestrutura de LLM e preparação operacional permanecem planejadas).
- **Sistema Global de Tema e Identidade Visual:** **IMPLEMENTADO E VALIDADO** (Suporte nativo a Claro, Escuro e Automático com `prefers-color-scheme`, hook `useTheme`, alternador acessível `ThemeToggle`, tokens semânticos, persistência sob `carteiraexpert_theme`, script anti-FOUC no `<head>`, 22 testes unitários dedicados e validação visual manual aprovada no navegador).

---

## Catálogo Físico de Tabelas Validadas no PostgreSQL (23 tabelas)

O banco de dados relacional oficial do CarteiraExpert é composto exatamente pelas seguintes 23 tabelas físicas:

1. `audit_logs`: Trilha de auditoria e registro de alterações sensíveis;
2. `users`: Contas de usuários autenticados;
3. `sessions`: Sessões ativas com token em hash SHA-256;
4. `password_reset_tokens`: Tokens temporários para redefinição atômica de senha;
5. `auth_rate_limits`: Registros de controle de taxa de requisições de autenticação;
6. `user_consents`: Registro versionado de termos LGPD com trigger *append-only*;
7. `portfolios`: Carteiras de investimento estruturais (status: `active`, `archived`, `frozen`);
8. `assets`: Catálogo unificado de ativos cadastrados e customizados;
9. `portfolio_events`: Eventos operacionais de carteira (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`) e societários (`SPLIT`, `GROUPING`, `BONUS_SHARE`, `DIVIDEND`, `JCP`), com coluna `direction` e constraint física condicional `chk_portfolio_events_direction`;
10. `subscription_offers`: Ofertas societárias de direitos de subscrição;
11. `subscription_rights`: Custódia de direitos de subscrição alocados por carteira;
12. `subscription_exercises`: Exercício liquidado de direitos gerando evento `BUY`;
13. `market_quotes`: Histórico e cotações locais de ativos;
14. `exchange_rates`: Histórico e taxas de conversão cambial UTC;
15. `commercial_plans`: Catálogo de planos comerciais e quotas numéricas (`max_active_portfolios`);
16. `plan_entitlements`: Chaves de autorização funcional (flags) por plano;
17. `user_plans`: Associação vigente do usuário ao plano comercial com suporte a status (`active`, `past_due`, `cancelled`);
18. `billing_subscriptions`: Ciclo de vida e estado contratual de assinaturas pagas com integridade relacional;
19. `payment_events`: Registro auditável de eventos de pagamento com chave de idempotência única (`idempotency_key`);
20. `billing_groups`: Grupos familiares e comerciais de faturamento compartilhado;
21. `billing_group_members`: Membros vinculados a planos compartilhados com isolamento estrito de carteiras e dados patrimoniais;
22. `billing_group_invitations`: Convites de membros para planos compartilhados com expiração e token único;
23. `user_chart_preferences`: Preferências de visualização de gráficos por usuário e área (`portfolio_evolution`, `dashboard_allocation`, `portfolio_allocation`).

---

## Capacidades Pendentes ou no Roadmap

Permanecem como regras de negócio aprovadas ou capacidades planejadas:

- **Expansão de Gateways e Pagamentos:** Conexão de gateways reais (Stripe/Asaas), webhooks ativos com verificação de assinatura criptográfica e rotinas em background de expiração;
- **Gestão de Caixa e Contas Bancárias:** Saldos em moeda, depósitos, saques, aportes em dinheiro e liquidação de caixa;
- **Custódia Institucional:** Vinculação formal de corretoras, contas institucionais e custodiantes;
- **Finalidades Formais de Carteira:** Atributo formal `purpose` (`REAL`, `ESTUDO`, `ANALISE`) e suporte a múltiplas carteiras `REAL`;
- **Dashboard Contextual:** Transição do agregador atual de `/dashboard` para seleção contextual de carteira única;
- **Automação de Ingestão de Mercado:** Rotinas agendadas (cron jobs / workers em background) para execução periódica da ingestão;
- **Módulo Operacional de Opções:** Cadastro de derivativos, gregas, alertas e acompanhamento de vencimentos;
- **Módulo Fiscal Dedicado:** Apuração mensal, compensação de prejuízos e relatórios auxiliares para IRPF;
- **IA Editorial Interna:** Pipeline editorial interno com revisão humana obrigatória.

---

## Validações Comprovadas no Repositório

- [x] **Typecheck:** Arquitetura TypeScript em Strict Mode (`pnpm typecheck` aprovado com zero erros).
- [x] **Lint:** Configuração Biome integrada para linting e formatação (`pnpm lint` aprovado com zero erros).
- [x] **Testes Unitários:** Comprovados no repositório (**45 arquivos e 614 testes**, cobrindo motores, schemas, gráficos, preferências, billing, quotas e planos).
- [x] **Testes de Integração:** Comprovados no repositório (**28 arquivos e 286 testes** em PostgreSQL real, cobrindo carteiras, preferências de gráficos, market data, planos e billing).
- [x] **Testes End-to-End (E2E):** Suítes Playwright estruturadas (**78 testes aprovados** cobrindo autenticação, consentimento LGPD, carteiras, quotas de planos, subscrições e preferências de gráficos em Chromium, Firefox e WebKit).
- [x] **Verificação Física do Schema:** 23 tabelas físicas catalogadas e 100% validadas pelo Schema Guardian no banco de testes e no banco de desenvolvimento (`pnpm db:verify`).
- [x] **Build de Produção:** Next.js 16 compilado com sucesso (Turbopack) com páginas estáticas/dinâmicas geradas.
