# Estado Atual do Projeto

## Última atualização

2026-09-04

---

## Estado do Repositório Git

- **Branch:** `main` (sincronizada com `origin/main`)
- **Commit base:** `0dffac4` (`feat(valuation): implementar modelos teóricos Bazin, Graham e DCF simplificado`)
- **Commits intermediários relevantes:** `78f2a5c` (`feat(custody): implementar instituições de custódia, contas de corretora e filtro no histórico`), `40341ba` (`feat(cash): implementar contas de caixa e movimentações monetárias`) e `f30faf8` (`feat(portfolio): implementar unicidade de carteira REAL e dashboard contextual`)
- **Estado da Working Tree:** Modificações da Etapa 8 implementadas, testadas e prontas para commit após autorização explícita.

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com finalidades (`REAL`, `ESTUDO`, `ANALISE`), unicidade de carteira REAL, contas de caixa monetário, instituições e contas de custódia com filtro no histórico, motor de posições, dashboard contextual, extrato de histórico, eventos corporativos (Split, Grupamento, Bonificação, Dividendos, JCP e Subscrições), camada comercial de planos e quotas, infraestrutura de dados de mercado com adaptador BRAPI e ingestão COTAHIST/CVM, catálogo público de ativos (Fase 06.5), modelos teóricos de valuation (Etapa 6), simulador de juros compostos e aportes (Etapa 7), módulo operacional de opções (Etapa 8), importações revisáveis (Fase 07), persistência de preferências de gráficos e sistema global de temas encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** **IMPLEMENTADA E VALIDADA** (Arquitetura modular monolítica, motor financeiro determinístico baseado em `Decimal`, persistência `NUMERIC`, infraestrutura de testes unitários, integração e E2E, e registro em `audit_logs`).
- **Fase 02 — Identidade, Acesso e Segurança:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS** (Cadastro, login com Argon2id, sessões em banco com token SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD com trigger *append-only* em `user_consents`, isolamento multitenant no servidor).
- **Etapa 1 — Resiliência Operacional, Segurança e Health Check:** **IMPLEMENTADA E VALIDADA** (Commit `c4ee5cf`, Route Handler `/api/health`, error boundaries, headers HTTP de segurança, runner `/api/jobs/ingest`, scripts de backup/restore).
- **Etapa 2 — Documentação Operacional de Ingestão e Backup:** **IMPLEMENTADA E VALIDADA** (Commit `64cc2e8`, playbooks operacionais `docs/operations/backup-and-restore.md` e `docs/operations/market-data-ingestion.md`).
- **Etapa 3 — Finalidades de Carteira (`REAL`, `ESTUDO`, `ANALISE`) e Dashboard Contextual:** **IMPLEMENTADA E VALIDADA** (Commit `f30faf8`, migração `0018_add_portfolio_purpose.sql`, índice parcial `idx_unique_user_real_portfolio`, constraint `chk_portfolios_purpose`, `DashboardContextSelector` via query string `/dashboard?portfolioId=...`).
- **Etapa 4 — Contas de Caixa e Movimentações Monetárias:** **HOMOLOGADA COM SUCESSO (`PASS`)** (Commit `40341ba`, migração `0019_add_cash_accounts_and_transactions.sql`; tabelas `cash_accounts` e `cash_transactions` com suporte multi-moeda e precisão `NUMERIC(28, 10)` com `Decimal`; lançamentos de `DEPOSIT`, `WITHDRAWAL`, `TRANSFER` e `ADJUSTMENT`; lock pessimista `FOR UPDATE` para concorrência segura; liquidação opcional vinculada a eventos operacionais via `portfolio_event_id`; vínculo com contas de custódia via `custody_account_id`; componentes de interface e cobertura de testes unitários e de integração).
- **Etapa 5 — Instituições de Custódia e Contas de Corretora:** **HOMOLOGADA COM SUCESSO (`PASS`)** (Commit `78f2a5c`, migração `0020_add_custody_entities.sql`, ADR-012; catálogo canônico em `custody_institutions` pré-populado com corretoras nacionais e internacionais como XP, BTG, NuInvest, Clear, Inter, Avenue, IBKR, Binance; contas de custódia do usuário por carteira em `custody_accounts` com suporte a status `active` e `archived`; vínculos opcionais com `ON DELETE SET NULL` em `portfolio_events.custody_account_id`, `cash_accounts.custody_account_id` e `import_batches.custody_account_id`; validação server-side anti-IDOR garantindo posse da carteira; filtro por instituição de custódia no extrato cronológico `/history`; cobertura completa por testes unitários, testes de integração e testes E2E Playwright).
- **Etapa 6 — Modelos Teóricos de Valuation (Bazin, Graham e DCF):** **IMPLEMENTADA E VALIDADA** (Commit `0dffac4`; motores puros determinísticos baseados em `Decimal` para Preço Teto de Bazin, Fórmula de Benjamin Graham e DCF Simplificado em 2 estágios em `src/modules/market-data/domain/theoretical-valuation-engine.ts`; schemas Zod em `theoretical-valuation.schema.ts`; serviço server-side em `theoretical-valuation.service.ts`; componente visual interativo `TheoreticalValuationCard.tsx` com simulador de premissas integrado nas rotas públicas `/acoes/[ticker]` e `/fiis/[ticker]`; avisos regulatórios de neutralidade CVM; cobertura de testes unitários matemáticos, edge cases e testes de interface jsdom com 100% de aprovação).
- **Etapa 7 — Simulador de Aportes, Juros Compostos e Projeções:** **IMPLEMENTADA E VALIDADA** (Módulo `src/modules/projections/` com motor financeiro puro determinístico baseado em `Decimal` em `projection-engine.ts`; conversão de taxas anuais compostas para mensais equivalentes; deflacionamento por poder de compra; apuração de marcos temporais como tempo para dobrar capital inicial e mês de inflexão financeira/crossover; projeção de proventos com base em Dividend Yield configurável; schema Zod com validação matemática estrita em `projection.schema.ts`; componente interativo `CompoundInterestSimulator.tsx` com Recharts e visualização dual anual/mensal paginada; rota pública `/simulador` integrada ao middleware e navbars; aviso regulatório CVM em conformidade; cobertura total por testes unitários e E2E Playwright multi-navegador; isolamento absoluto em relação ao motor patrimonial e à carteira real).
- **Etapa 8 — Módulo Operacional de Opções:** **IMPLEMENTADA E VALIDADA** (Módulo `src/modules/options/`, migração `0021_add_options_contracts.sql`; tabela `options_contracts` com integridade referencial a carteiras e ativos, suporte a tipos `CALL`/`PUT`, estilos `AMERICAN`/`EUROPEAN`, status `OPEN`/`EXERCISED`/`EXPIRED`/`CLOSED`; motor financeiro determinístico puro em `Decimal` com aproximação de Abramowitz & Stegun para CDF normal em `black-scholes-engine.ts`; cálculo de gregas informativas — Delta, Gamma, Theta anual/diário base 252, Vega por 1% vol, Rho por 1% taxa de juros; classificação de moneyness ITM/ATM/OTM, valor intrínseco/extrínseco, breakeven e pontos da curva de payoff; calendário oficial B3 em `expiration-calendar.ts` com cálculo determinístico de feriados móveis pelo algoritmo de Gauss/Meeus para Páscoa, Carnaval e Corpus Christi e alertas de proximidade D-5 a D-0; serviço server-side com validação estrita anti-IDOR de posse da carteira e auditoria em `audit_logs`; Server Actions tipadas; componentes visuais dedicados `OptionsDashboardView`, `OptionsContractList`, `OptionsContractForm`, `OptionsGreeksCard`, `OptionsPayoffChart`, `OptionsAlertsBanner` e `OptionsDisclaimerBanner` com aviso regulatório CVM/ANBIMA; rota `/options` integrada na sidebar e navbar; estrita neutralidade informativa sem recomendação de investimentos, sem envio de ordens e sem rolagem automatizada).
- **Fase 04 — Ações Corporativas e Subscrições:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS**
  - Pacote 04.01 — Split e Grupamento de Ativos: Desdobramentos (`SPLIT`) e grupamentos (`GROUPING`) determinísticos com preservação do custo de aquisição invariante e frações em `Decimal`.
  - Pacote 04.02 — Bonificação, Dividendos e JCP: Bonificação em ações (`BONUS_SHARE`) com custo atribuído opcional, proventos em dinheiro (`DIVIDEND` e `JCP` com retenção de 15% de IRRF), Data-Com e Data de Pagamento obrigatória.
  - Pacote 04.03 — Subscrições e Direitos Societários: Modelo relacional em 3 tabelas (`subscription_offers`, `subscription_rights`, `subscription_exercises`), liquidação atômica gerando evento `BUY` com chave `idempotencyKey` e cobertura E2E.
- **Fase 05 — Planos, Entitlements e Assinaturas:** **PARCIALMENTE IMPLEMENTADA E VALIDADA**
  - Pacote 05.01 — Entitlements e Quotas por Plano: Catálogo comercial (`commercial_plans`, `plan_entitlements`, `user_plans`), planos Free (2 carteiras) e Pro (10 carteiras), validação server-side via `assertCanCreatePortfolio` com lock `FOR UPDATE`, downgrade transacional com congelamento de excedentes em `frozen` e bloqueio estrito de mutações via `assertPortfolioWritable`.
  - Pacote 05.02 — Estrutura de Assinaturas e Pagamentos: Tabelas `billing_subscriptions` e `payment_events`, ciclo de vida de assinaturas, idempotência por `idempotency_key`, sincronização transacional com `user_plans`, fallback automático para Free em inadimplência (`unpaid`), interface `PaymentGatewayAdapter` e adaptador `MockPaymentGatewayAdapter`.
  - Pacote 05.03 — Experiência Comercial de Planos: Página dedicada `/plans` com visão comparativa de quotas e transparência sem cobrança real.
- **Fase 06 — Dados de Mercado, Valuation e Gráficos:** **PACOTES 06.01, 06.02 E 06.03 IMPLEMENTADOS E HOMOLOGADOS (`PASS`)** (Tabelas `market_quotes`, `exchange_rates`, `user_chart_preferences`, `b3_cotahist_batches` e `b3_historical_quotes` via migrações `0005`, `0010`, `0012` e `0013`; adaptadores `ManualPayloadAdapter`, `MockProviderAdapter` e conector público `BrapiAdapter`; serviço de ingestão `MarketDataIngestionService` com ranking de qualidade; parser oficial de largura fixa COTAHIST `CotahistFixedLengthParser`; serviço `CotahistIngestionService`; motores de valuation e evolução temporal diária "Mercado vs. Custo"; gráficos Recharts; persistência atômica de preferências em `user_chart_preferences` com fila serializada `ChartPreferenceSyncQueue` e isolamento multitenant).
- **Fase 06.5 — Alinhamento do MVP e Catálogo Público de Ativos:** **HOMOLOGADA COM SUCESSO (`PASS`)** (Módulo `src/modules/catalog/`, rotas públicas `/acoes`, `/fiis`, `/etfs`, `/bdrs`, `/ativos`, páginas por ticker com variação diária no fuso São Paulo com `Decimal`, `QuoteFreshnessBadge`, SEO com `sitemap.ts` e `robots.ts`, Landing Page em `/`, página 404 padronizada e lançamento em carteira autenticado pré-selecionado).
- **Fase 07 — Importações Revisáveis:** **HOMOLOGADA COM SUCESSO (`PASS`)** (Módulo `src/modules/imports/` com tabelas `import_batches` e `import_batch_items` via migração `0011`; parsers CSV com auto-detecção para `carteiraexpert_csv`, `b3_trades_csv` e `b3_movements_csv`; limite de 5 MB; deduplicação por hash SHA-256; tela de upload `/import`; central de revisão `/import/[id]` com KPIs em tempo real, edição com `Decimal`, exclusão por linha e resolução explícita de ativos; confirmação transacional atômica com lock `FOR UPDATE` gravando em `portfolio_events` com `source = 'csv_import'`).
- **Fase 08 — Ativos Internacionais e Criptoativos:** **PARCIALMENTE IMPLEMENTADA** (Multi-moeda, `exchange_rates`, conversão cambial determinística no valuation e precisão `NUMERIC(28, 10)` para criptoativos entregues; custódia on-chain e conexão direta a exchanges via API permanecem planejadas).
- **Fase 09 — Projeções, Opções e Apoio Tributário:** **PARCIALMENTE IMPLEMENTADA NAS BASES** (Bases factuais de PnL realizado, IRRF sobre JCP, Simulador de Projeções da Etapa 7 e Módulo Operacional de Opções da Etapa 8 entregues; módulo dedicado fiscal permanece planejado para a Etapa 9).
- **Fase 10 — IA Editorial e Preparação de Lançamento:** **PLANEJADA, NÃO IMPLEMENTADA** (Diretrizes de governança editorial aprovadas no ADR-005; pipeline técnico planejado para a Etapa 10).
- **Sistema Global de Tema e Identidade Visual:** **IMPLEMENTADO E VALIDADO** (Temas Claro, Escuro e Automático com `prefers-color-scheme`, hook `useTheme`, alternador acessível `ThemeToggle`, tokens semânticos, persistência sob `carteiraexpert_theme`, script anti-FOUC no `<head>`).

---

## Catálogo Físico de Tabelas Validadas no PostgreSQL (37 tabelas)

O banco de dados relacional oficial do CarteiraExpert é composto exatamente pelas seguintes 37 tabelas físicas de aplicação (além da tabela de controle `__drizzle_migrations`, totalizando 38 tabelas):

1. `audit_logs`: Trilha de auditoria e registro transversal de alterações sensíveis;
2. `users`: Contas de usuários autenticados com credenciais seguras;
3. `sessions`: Sessões ativas com token criptográfico em hash SHA-256;
4. `password_reset_tokens`: Tokens temporários para redefinição atômica de senha;
5. `auth_rate_limits`: Registros de controle de taxa contra força bruta com HMAC-SHA256;
6. `user_consents`: Registro versionado de termos LGPD com trigger físico *append-only*;
7. `portfolios`: Carteiras estruturais (`purpose`: `REAL`, `ESTUDO`, `ANALISE`; status: `active`, `archived`, `frozen`; índice único parcial `idx_unique_user_real_portfolio`);
8. `assets`: Catálogo canônico unificado de instrumentos financeiros globais e customizados;
9. `portfolio_events`: Eventos operacionais e societários (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`), com coluna `direction` e chave estrangeira `custody_account_id` com `ON DELETE SET NULL`;
10. `subscription_offers`: Ofertas societárias de direitos de subscrição reguladas pelo mercado;
11. `subscription_rights`: Custódia de direitos de subscrição alocados por carteira;
12. `subscription_exercises`: Exercício liquidado de direitos gerando evento `BUY` com chave `idempotencyKey`;
13. `market_quotes`: Histórico e cotações locais de ativos com status de defasagem;
14. `exchange_rates`: Histórico e taxas de conversão cambial diárias em UTC;
15. `commercial_plans`: Catálogo de planos comerciais e quotas numéricas (`max_active_portfolios`);
16. `plan_entitlements`: Chaves de autorização funcional (flags) por plano;
17. `user_plans`: Associação vigente do usuário ao plano comercial com status (`active`, `past_due`, `cancelled`);
18. `billing_subscriptions`: Ciclo de vida e estado contratual de assinaturas comerciais;
19. `payment_events`: Registro auditável de eventos de pagamento com chave de idempotência única (`idempotency_key`);
20. `billing_groups`: Grupos de faturamento compartilhado (Plano Família/Compartilhado);
21. `billing_group_members`: Membros vinculados a planos compartilhados com isolamento estrito de dados patrimoniais;
22. `billing_group_invitations`: Convites de membros para planos compartilhados com expiração e token único;
23. `user_chart_preferences`: Preferências de visualização de gráficos por usuário e área (`portfolio_evolution`, `dashboard_allocation`, `portfolio_allocation`);
24. `import_batches`: Lotes de importação CSV com status, métricas, hash de deduplicação e chave estrangeira `custody_account_id`;
25. `import_batch_items`: Linhas individuais do lote com status de validação, hash de linha, erros/avisos, ativo resolvido e vínculo com evento gerado;
26. `b3_cotahist_batches`: Lotes de ingestão de séries históricas e arquivos diários de fechamento da B3 (COTAHIST);
27. `b3_historical_quotes`: Cotações oficiais de fechamento (EOD) da B3 com integridade referencial ao lote e ao catálogo de ativos;
28. `asset_fundamentals`: Demonstrações contábeis oficiais versionadas (DFP/ITR) da CVM com métricas fundamentalistas;
29. `cvm_companies`: Cadastro oficial de companhias abertas da CVM (Resolução 80);
30. `cvm_source_files`: Rastreabilidade e integridade (SHA-256) de arquivos brutos baixados da CVM;
31. `cvm_ingestion_runs`: Execuções de parsers CVM com controle de concorrência e lease locks;
32. `cvm_company_assets`: De-Para auditado entre Companhias CVM e Ativos do Catálogo Canônico;
33. `cash_accounts`: Contas de caixa monetário por carteira, vinculáveis a contas de custódia (`custody_account_id`);
34. `cash_transactions`: Movimentações de caixa (`DEPOSIT`, `WITHDRAWAL`, `TRANSFER`, `ADJUSTMENT`) com vínculo opcional a eventos de carteira (`portfolio_event_id`);
35. `custody_institutions`: Catálogo canônico pré-populado de corretoras, bancos e exchanges nacionais e globais com unicidade de código (`code`);
36. `custody_accounts`: Contas de custódia vinculadas à carteira e à instituição (`status`: `active`, `archived`), com integridade referencial `ON DELETE SET NULL`;
37. `options_contracts`: Cadastro e gestão de contratos de opções de compra e venda vinculados a carteiras e ativos subjacentes, com strike, vencimento, estilo, tipo e rastreabilidade de auditoria.

---

## Capacidades Pendentes ou no Roadmap

Permanecem como regras de negócio aprovadas ou capacidades planejadas para as próximas etapas:

- **Etapa 9 — Módulo Fiscal Dedicado e Relatórios Auxiliares de IRPF:** Módulo `src/modules/tax/`, apuração mensal de ganhos líquidos, isenção de R$ 20k em ações, compensação de prejuízos acumulados e relatório auxiliar para declaração anual de IRPF (sem emissão de DARF);
- **Etapa 10 — IA Editorial Interna com Fluxo de Revisão Humana Obrigatória:** Pipeline editorial interno apoiado por IA para documentos públicos de RI, com aprovação humana mandatória pré-publicação;
- **Automação da Ingestão de Mercado:** Rotinas agendadas (cron jobs / workers em background) para execução periódica da ingestão e streaming via WebSocket;
- **Expansão de Formatos de Importação:** Suporte a arquivos binários (`.xlsx`) e extração assistida de notas em PDF com bucket privado e workers assíncronos (Fase 07 expandida);
- **Expansão de Gateways e Pagamentos:** Conexão de gateways reais (Stripe/Asaas), webhooks ativos com verificação de assinatura criptográfica e rotinas em background de expiração.

---

## Validações Comprovadas no Repositório

- [x] **Typecheck:** Arquitetura TypeScript em Strict Mode (`pnpm typecheck` aprovado com zero erros).
- [x] **Lint:** Configuração Biome integrada para linting e formatação (`pnpm lint` e `biome check` aprovados com zero erros).
- [x] **Testes Unitários:** Comprovados no repositório (**97 arquivos e 1.164 testes aprovados** via `pnpm run test:unit`, cobrindo motores determinísticos de projeção, Black-Scholes, calendário de opções B3, valuation teórico, schemas, gráficos, preferências, catálogo, billing, quotas, planos, contas de caixa e custódia).
- [x] **Testes de Integração:** Comprovados no repositório (**51 arquivos e 482 testes aprovados** via `pnpm run test:integration` em PostgreSQL real, cobrindo confirmação de importações, ciclo de vida de opções com anti-IDOR e auditoria, parsing, carteiras, contas de caixa, custódia institucional, catálogo público, preferências de gráficos, market data, planos e billing).
- [x] **Testes End-to-End (E2E):** Suítes Playwright estruturadas (**15 arquivos e 186 testes aprovados** via `pnpm run test:e2e` cobrindo o módulo operacional de opções `/options`, simulador de juros compostos `/simulador`, contas de custódia, importações completas com resolução explícita de ativos e isolamento IDOR, autenticação, consentimento LGPD, carteiras, catálogo público desktop/mobile, quotas de planos, subscrições e preferências de gráficos em Chromium 62/62, Firefox 62/62 e WebKit 62/62).
- [x] **Verificação Física do Schema:** 37 tabelas físicas catalogadas e 100% validadas pelo Schema Guardian no banco de testes e no banco de desenvolvimento (`pnpm db:verify` e `pnpm db:verify -- --test`).
- [x] **Build de Produção:** Next.js 16 compilado com sucesso (Turbopack) com páginas estáticas/dinâmicas geradas.

