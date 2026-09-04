# Limites dos Módulos

Este documento define os limites de responsabilidade, fronteiras arquiteturais e estado de implementação dos módulos do CarteiraExpert.

## 1. Módulos Implementados e Parcialmente Implementados

### 1.1. `identity`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/identity/` e `src/lib/db/schema/identity.ts`.
- **Responsabilidades:**
  - Cadastro de usuários e normalização de credenciais;
  - Autenticação e hash de senhas com Argon2id;
  - Gerenciamento de sessões com token SHA-256 no banco e cookies HttpOnly;
  - Controle de rate limiting stateless via banco (`authRateLimits`);
  - Fluxo de redefinição de senha com tokens de uso único (15 minutos);
  - Registro append-only de consentimentos e termos LGPD (`userConsents`).
- **Não é responsável por:**
  - Dados financeiros, carteiras ou planos comerciais.

### 1.2. `portfolio`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/portfolio/`, `src/lib/db/schema/portfolio.ts`, `src/lib/db/schema/cash.ts` e `src/lib/db/schema/custody.ts`.
- **Responsabilidades:**
  - CRUD de carteiras patrimoniais com isolamento por usuário e finalidades formais (`portfolios`, com `purpose: 'REAL' | 'ESTUDO' | 'ANALISE'` e unicidade da carteira `REAL` ativa);
  - Catálogo de ativos globais e ativos customizados (`assets`);
  - Lançamentos manuais de operações (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`);
  - Gestão de contas de caixa e movimentações monetárias (`cash_accounts`, `cash_transactions`);
  - Gestão de instituições de custódia e contas de corretora (`custody_institutions`, `custody_accounts`) com vínculos opcionais `ON DELETE SET NULL`;
  - Motor determinístico de cálculo de posições, custo médio ponderado e PnL realizado (`position-engine.ts`);
  - Motor de evolução patrimonial temporal com replay de eventos (`portfolio-evolution-engine.ts`);
  - Motor de renderização de gráficos de alocação e evolução (`chart-engine.ts`);
  - Extrato cronológico com filtros avançados (inclusive por instituição de custódia) em `/history`;
  - Visualização operacional da carteira selecionada em `/portfolios/[id]` e Dashboard contextual.
- **Limitações e Capacidades Futuras:**
  - Não cobre eventos societários complexos (delegados ao módulo `corporate-actions`);
  - Módulo operacional de opções e derivativos (planejado para a Etapa 8);
  - Ferramentas de valuation teórico Bazin/Graham/DCF (planejadas para a Etapa 6).

### 1.3. `corporate-actions`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/corporate-actions/` e `src/lib/db/schema/subscription.ts`.
- **Responsabilidades:**
  - Processamento auditável e idempotente dos eventos societários suportados: desdobramentos (`SPLIT`), grupamentos (`GROUPING`), bonificações de ações (`BONUS_SHARE`) e proventos em dinheiro (`DIVIDEND` e `JCP` com retenção na fonte de 15% de IRRF);
  - Gestão do ciclo de subscrições: ofertas de subscrição (`subscriptionOffers`), alocação de direitos por carteira (`subscriptionRights`) e exercício atômico com geração de evento `BUY` (`subscriptionExercises`).
- **Limitações:**
  - Não cobre outros eventos societários complexos (fusões, cisões, incorporações, amortizações ou OPAs);
  - Não recomenda adesão a eventos societários ou compra de direitos.

### 1.4. `market-data`
- **Estado:** *Implementado internamente e integrado via BRAPI / Ingestão B3 COTAHIST planejada*.
- **Código Principal:** `src/modules/market-data/` e `src/lib/db/schema/market-data.ts`.
- **Capacidades Implementadas e Validadas:**
  - Abstração de provedor de dados (`MarketDataProviderAdapter`);
  - Adaptadores internos: manual (`ManualPayloadAdapter`), mock (`MockProviderAdapter`) e conector público B3/BRAPI (`BrapiAdapter`);
  - Script CLI administrativo de ingestão (`scripts/ingest-market-data.ts`, `pnpm market:ingest`);
  - Ingestão em lote e normalização temporal em UTC (`MarketDataIngestionService`);
  - Persistência e consulta de cotações (`market_quotes`) e taxas de câmbio (`exchange_rates`);
  - Motor de valuation de posições com tratamento de moeda e defasagem (`valuation-engine.ts`).
- **Capacidades Pendentes / Especificadas:**
  - *Ingestão Histórica B3 COTAHIST (Pacote 06.03 / ADR-010):* Upload privado de ZIPs, parser de largura fixa COTAHIST, armazenamento privado seguro e processamento assíncrono por workers;
  - *Sincronização Automática em Background:* Cron jobs periódicos e streaming via WebSocket.

### 1.5. `plans`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/plans/` e `src/lib/db/schema/plans.ts`.
- **Responsabilidades:**
  - Catálogo de planos comerciais e quotas de carteiras (`commercial_plans`);
  - Entitlements por feature (`plan_entitlements`);
  - Associação e vigência por usuário (`user_plans`);
  - Resolução de plano efetivo e quotas (`getUserEffectivePlan`, `getPlanQuotaSummary`);
  - Enforcement server-side de limites (`assertCanCreatePortfolio`);
  - Downgrade transacional com congelamento de carteiras excedentes (`applyPlanDowngradeInTransaction`).

### 1.6. `billing`
- **Estado:** *Implementado e validado como estrutura interna*.
- **Código Principal:** `src/modules/billing/` e `src/lib/db/schema/billing.ts`.
- **Responsabilidades:**
  - Ciclo de vida e estados de assinaturas pagas (`billing_subscriptions`);
  - Registro e processamento idempotente de eventos de pagamento (`payment_events`);
  - Sincronização atômica com `user_plans` e acionamento de downgrade/congelamento em caso de inadimplência (`unpaid`);
  - Contrato abstrato e agnóstico de provedores (`PaymentGatewayAdapter`) e mock para testes (`MockPaymentGatewayAdapter`);
  - Consulta segura de resumo de faturamento (`getUserBillingSummaryAction`).
- **Limitações:**
  - Não faz chamadas de rede externas, não integra SDKs de terceiros (Stripe, Asaas) e não expõe webhooks ativos no momento.

### 1.7. `catalog`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/catalog/`.
- **Responsabilidades:**
  - Descoberta pública de ativos por classe (`/acoes`, `/fiis`, `/etfs`, `/bdrs`, `/ativos`);
  - Páginas públicas individuais por ticker com cálculo de variação diária no fuso São Paulo com `Decimal`;
  - Badge de frescor de cotação (`QuoteFreshnessBadge`);
  - SEO com geração de `sitemap.ts` e `robots.ts`;
  - Ação de lançamento em carteira autenticado com ativo pré-selecionado (`TransactionModal`).

### 1.8. `imports`
- **Estado:** *Implementado e validado (Fase 07)*.
- **Código Principal:** `src/modules/imports/` e `src/lib/db/schema/imports.ts`.
- **Responsabilidades:**
  - Ingestão de planilhas CSV com auto-detecção de layout (`carteiraexpert_csv`, `b3_trades_csv`, `b3_movements_csv`);
  - Validação rigorosa de limite de 5 MB e rejeição de arquivos vazios;
  - Deduplicação inteligente por hash de arquivo SHA-256 e por linha (`raw_line_hash`);
  - Central de revisão de lotes em `/import/[id]` com KPIs em tempo real, filtros por status e edição manual de itens com `Decimal`;
  - Resolução explícita de ativos não identificados (`select_existing` / `create_custom`);
  - Confirmação transacional atômica com bloqueio pessimista `FOR UPDATE`, gravação em `portfolio_events` com `source = 'csv_import'` e bloqueio de edição pós-finalização;
  - Proteção IDOR estrita e isolamento multitenant.
- **Limitações e Expansão Futura:**
  - Suporte a planilhas binárias `.xlsx` e extração de notas em PDF com bucket privado permanecem planejados no roadmap expandido.

## 2. Módulos Planejados (Sem Implementação Efetiva)

Os módulos abaixo possuem diretórios estruturais reservados em `src/modules/`, mas encontram-se sem código ou tabelas ativas no estado atual:

### 2.1. `tax` (Módulo Tributário Dedicado)
- **Estado:** *Parcialmente implementado nos motores existentes / Módulo dedicado planejado*.
- **Escopo Previsto:** Relatórios anuais de IRPF auxiliares, fechamento de períodos fiscais e consolidação de apuração.
- **Realidade Atual:** O cálculo factual de PnL realizado por venda é executado no módulo `portfolio` e a retenção de IRRF em JCP é calculada no módulo `corporate-actions`. Não há módulo fiscal dedicado em `src/modules/tax/`.
- **Limites Permanentes:** A plataforma não emite DARF, não elabora declaração completa e não substitui serviços contábeis.

### 2.4. `options` (Módulo Operacional de Opções)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Acompanhamento operacional de travas, posições cobertas, alertas de exercício/vencimento e cálculo descritivo de gregas.
- **Realidade Atual:** Apenas a string `'option'` existe no catálogo cadastral de tipos de ativos (`asset_type`), sem lógica operacional.

### 2.5. `editorial-ai` (IA Editorial Interna)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Apoio interno à redação de resumos e relatórios analíticos a partir de documentos públicos de RI, sob fluxo estrito com revisão e aprovação humana obrigatória antes de qualquer publicação.
- **Limites Permanentes:** A IA não possui autonomia para publicar conteúdo, não calcula métricas financeiras oficiais e não interage com usuários finais através de chats.

## 3. Regras de Fronteira e Comunicação entre Módulos

1. **Acesso ao Banco de Dados:** Um módulo não deve acessar diretamente tabelas privadas de outro módulo sem contrato explícito de serviço ou schema compartilhado.
2. **Desacoplamento de Domínio:** Motores de cálculo financeiro são puros, isolados, determinísticos e independentes de componentes de interface ou de integrações de rede.
3. **Comunicação na Interface:** Componentes React devem acionar Server Actions específicas do módulo responsável, evitando composições diretas que violem os limites de domínio.