# CarteiraExpert

O **CarteiraExpert** é um SaaS brasileiro de consolidação patrimonial, inteligência financeira e apoio à gestão de investimentos para ativos brasileiros, internacionais, moedas estrangeiras, criptoativos e opções.

> **Finalidade e limites inegociáveis:** A plataforma tem finalidade estritamente informativa, organizacional e educacional. A plataforma **NÃO** recomenda compra, venda, manutenção, rolagem ou estratégias de investimento, **NÃO** envia, intermedia ou executa ordens para corretoras, bancos ou exchanges, **NÃO** executa rolagens de opções, **NÃO** emite DARF ou realiza pagamentos e **NÃO** substitui profissionais habilitados. Cálculos financeiros são determinísticos e isolados, sem dependência de IA.

---

## Estado Atual do Projeto

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, auditoria imutável e infraestrutura de testes).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, recuperação de senha atômica, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:** Concluída e Publicada (Pacotes 03.00-E, 03.01-D, 03.02, 03.03 e 03.04 — Gestão de carteiras, ativos globais e customizados, lançamentos manuais de Compra, Venda e Ajustes Manuais (`MANUAL_ADJUSTMENT`) com direção explícita (`IN` e `OUT`), motor de custo médio ponderado, validação temporal de vendas e saídas com bloqueio de saldo descoberto, apuração de PnL realizado, tratamento de `REVERSAL` como evento neutro no cálculo contábil, dashboard consolidado e extrato de histórico paginado com filtros avançados).
- **Fase 04 — Eventos Corporativos e Subscrições:**
  - **Pacote 04.01 — Split e Grupamento de Ativos:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Processamento determinístico de desdobramentos e grupamentos, preservação do custo de aquisição invariante, identificação de frações em `Decimal`, recálculo automático de quantidade e custo médio, e extrato `/history` integrado).
  - **Pacote 04.02 — Bonificação, Dividendos e JCP:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Bonificação de ações com custo atribuído opcional, recebimento de proventos em dinheiro — dividendos isentos e Juros sobre Capital Próprio com apuração líquida e retenção de 15% de IRRF —, exigência mandatória de Data de Pagamento e Data-Com, totalização em `totalIncomeReceived`).
  - **Pacote 04.03 — Subscrições e Direitos Societários:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Modelo relacional de 3 entidades em `subscription_offers`, `subscription_rights` e `subscription_exercises`, controle de status do direito, liquidação financeira atômica gerando evento operacional `BUY` com controle de idempotência via `idempotencyKey`, 4 modais dedicados na interface e cobertura completa por testes unitários, integração e E2E).
- **Fase 05 — Planos Comerciais, Assinaturas e Entitlements:** **PARCIALMENTE IMPLEMENTADA E VALIDADA**
  - **Pacote 05.01 — Entitlements e Quotas por Plano:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Catálogo comercial em `commercial_plans` com planos `free` e `pro`, fonte única da quota numérica em `max_active_portfolios`, associação vigente por usuário em `user_plans`, fallback puro sem efeitos colaterais em `getUserEffectivePlan`, bloqueio server-side via `assertCanCreatePortfolio` com lock pessimista `FOR UPDATE`, downgrade transacional com congelamento idempotente de excedentes em status `frozen`, bloqueio estrito de todas as mutações financeiras em carteiras congeladas via `assertPortfolioWritable`, permissão de soft delete para liberação de quota, auditoria em `audit_logs` e badge visual de quotas em `/portfolios`).
  - **Pacote 05.02 — Estrutura de Assinaturas e Pagamentos:** **HOMOLOGADO COM SUCESSO (`PASS`)** (Tabelas `billing_subscriptions` e `payment_events` com migração `0008`, máquina de estados de faturamento, idempotência estrita por `idempotency_key`, sincronização atômica e transacional com `user_plans`, fallback e congelamento automático em caso de inadimplência (`unpaid`), interface agnóstica `PaymentGatewayAdapter` e adaptador `MockPaymentGatewayAdapter` para testes sem chamadas externas, e resumo de faturamento seguro na UI).
- **Fase 06 — Dados de Mercado, Valuation e Gráficos:** **PARCIALMENTE IMPLEMENTADA** (Persistência relacional em `market_quotes` e `exchange_rates`, adaptadores `ManualPayloadAdapter`, `MockProviderAdapter` e `BrapiAdapter`, serviço de ingestão `MarketDataIngestionService` com ranking de qualidade, motores de valuation e evolução patrimonial diária, gráficos de alocação por ativo/classe e gráfico de evolução temporal "Mercado vs. Custo" com Recharts; sincronização automática em background e WebSockets permanecem planejados).
- **Sistema Global de Tema e Identidade Visual:** Concluído (Suporte nativo aos temas Claro, Escuro e Automático com `prefers-color-scheme`, tokens semânticos, persistência em `localStorage` e script anti-FOUC no `<head>`).
- **Próxima Fase Prevista:** **Fase 07 — Importações Revisáveis** (ou expansão da Fase 05 com gateways e compartilhamento).

---

## Funcionalidades Implementadas

### 1. Identidade e Controle de Acesso
- **Cadastro de Usuários:** Validação robusta de dados via Zod e hashing de senhas via Argon2id (parâmetros de memória e tempo alinhados às diretrizes OWASP).
- **Login e Sessões:** Sessões persistidas na tabela `sessions` com tokens criptográficos SHA-256, TTL fixo de 7 dias, proteção contra enumeração de e-mails com hash dummy e anonimização de IP.
- **Cookies de Sessão:** Cookie `ce_session` com flags `HttpOnly`, `SameSite=Lax` e `Secure` obrigatório em produção.
- **Proteção Contra Força Bruta (Rate Limiting):** Tabela `auth_rate_limits` com bloqueio progressivo por chaves HMAC-SHA256 derivadas de IP e e-mail.
- **Recuperação de Senha Segura:** Tokens de uso único com expiração em 15 minutos e consumo transacional via PostgreSQL.
- **Logout Seguro e Auditado:** Revogação imediata da sessão no banco de dados (`revoked_at`), auditoria obrigatória em `audit_logs` (`reason: 'user_requested'`) e limpeza de cookies.

### 2. Governança e Consentimentos (LGPD)
- **Tabela `user_consents` Append-Only:** Trigger físico PostgreSQL (`enforce_append_only_user_consents`) que bloqueia `UPDATE` e `DELETE`.
- **Versionamento de Termos:** Suporte a versões independentes para Termos de Uso, Política de Privacidade e Comunicações de Marketing.
- **Enforçamento de Termos Vigentes:** Interceptação automática no `DashboardLayout` e redirecionamento para `/terms-acceptance` quando o usuário possuir termos desatualizados ou pendentes.

### 3. Carteiras, Ativos e Eventos Patrimoniais
- **Gestão de Carteiras via UI (`/portfolios`):** Criação, edição, listagem em grade e exclusão lógica auditada de carteiras por usuário.
- **Visão Detalhada da Carteira (`/portfolios/[id]`):** Cabeçalho com métricas da carteira, quadro de posições consolidadas em custódia, extrato cronológico de operações ativas e ações de lançamento.
- **Ativos Globais e Customizados:** Autocomplete debounced com busca server-side no lançamento de operações e modal para cadastro rápido de ativos customizados por usuário com ticker único.
- **Registro Manual de Operações e Ajustes:** Modal para lançamento de ordens de Compra (`BUY`), Venda (`SELL`) e Ajuste Manual (`MANUAL_ADJUSTMENT`) com seleção condicional obrigatória de direção (`IN` ou `OUT`), indicação em tempo real de quantidade disponível em custódia para vendas e ajustes de saída, datas de negociação/liquidação, quantidade, preço unitário, taxas e notas.
- **Cancelamento Auditado com Justificativa:** Cancelamento seguro com exclusão lógica (`deletedAt: NOW()`), motivo obrigatório (mínimo de 5 caracteres), validação de linha temporal e registro em `audit_logs`.
- **Isolamento Multiusuário e Proteção IDOR:** Bloqueio e auditoria de qualquer tentativa de acesso a carteiras, ativos, posições ou extratos de outros usuários.
- **Segregação Transacional e Injeção de Auditoria:** Arquitetura com separação estrita entre coordenadores e transações atômicas `...InTransaction`, com rollback físico comprovado no PostgreSQL.

### 4. Motor de Posições, Custo Médio e Validação Temporal
- **Cálculo Determinístico de Posição:** Quantidade acumulada em custódia calculada a partir do histórico de compras, vendas e ajustes ativos.
- **Custo Médio Ponderado Unitário:** Incorporação automática de taxas e emolumentos no custo de aquisição ($CM = \frac{Custo_{total}}{Quantidade}$).
- **Apuração de Resultado Realizado ($PnL$):** Cálculo de lucro ou prejuízo realizado em cada operação de venda ($Receita_{liquida} - Custo_{base}$), abatendo taxas operacionais e preservando o custo médio unitário remanescente.
- **Ajustes Manuais de Posição (`MANUAL_ADJUSTMENT`):** Tratamento determinístico por delta de quantidade. Entrada manual (`IN`) incrementa quantidade em custódia e adiciona custo ($Q_{nova} = Q + \Delta Q$, $Custo_{novo} = Custo + \Delta Custo$), recalculando o custo médio ponderado sem gerar PnL realizado. Saída manual (`OUT`) reduz quantidade e custo proporcionalmente ao custo médio ponderado vigente sem alterar o custo médio unitário nem gerar PnL mercantil, zerando o custo total se consumir 100% da posição e rejeitando atomicamente saídas superiores ao saldo disponível na data.
- **Tratamento de `REVERSAL`:** Formalizado no domínio e schema como evento neutro no cálculo contábil de posições, não alterando quantidade em custódia, custo médio, custo total, PnL realizado ou taxas operacionais.
- **Validação Temporal de Vendas e Saídas:** Rejeição atômica e rollback de vendas ou ajustes manuais de saída a descoberto ($Q_{saida} > Q_{disponivel}$ na data de negociação).
- **Consistência da Linha do Tempo:** Rejeição de eventos retroativos fora de ordem ou cancelamento de compras antigas que invalidem vendas ou ajustes posteriores na linha do tempo.
- **Validação no Schema e no Banco de Dados:** Validação estrita de `direction` com Zod (`superRefine` exigindo `IN`/`OUT` exclusivamente para `MANUAL_ADJUSTMENT` e proibindo para outros tipos) e check constraint física no PostgreSQL (`chk_portfolio_events_direction` via migração `0006_add_portfolio_events_direction.sql`).
- **Proteção Contra Concorrência:** Bloqueio pessimista no PostgreSQL (`FOR UPDATE`) para serialização de transações na carteira.

### 5. Histórico e Dashboard Consolidado
- **Dashboard Consolidado SSR (`/dashboard`):** Visão geral patrimonial em Server Component com cálculo em tempo real e revalidação sob demanda.
- **Segregação por Moeda Base:** Agrupamento estrito de métricas por moeda (`BRL`, `USD`, `EUR`), sem conversão cambial fictícia.
- **Métricas Consolidadas:** Custo total de aquisição em custódia, PnL realizado acumulado de vendas, taxas acumuladas, proventos acumulados, contagem de ativos distintos e carteiras ativas.
- **Feed Unificado e Extrato Geral (`/history`):** Extrato cronológico multicarteiras de compras, vendas, ajustes e eventos corporativos, com filtros avançados por carteira, tipo de operação, ativo e período de datas.
- **Exclusão de Soft Deletes:** Desconsideração estrita de eventos e carteiras canceladas/excluídas em todas as consultas e agregações.

### 6. Eventos Corporativos e Subscrições (Fase 04)
- **Desdobramentos (SPLIT) e Grupamentos (GROUPING):** Ajuste proporcional de quantidade e custo médio unitário mantendo o custo total de aquisição invariante, com identificação e preservação de frações residuais em `Decimal`.
- **Bonificação em Ações (BONUS_SHARE):** Adição de cotas bonificadas com custo atribuído opcional e recálculo determinístico do custo médio unitário.
- **Proventos em Dinheiro (DIVIDEND e JCP):** Dividendos isentos e Juros sobre Capital Próprio com retenção de 15% de IRRF, validação de Data-Com e exigência obrigatória de Data de Pagamento (`settlementDate`).
- **Ofertas e Direitos de Subscrição:** Gestão de ofertas (`subscription_offers`), custódia de direitos alocada por carteira (`subscription_rights`), controle de status (`ACTIVE`, `PARTIALLY_EXERCISED`, `FULLY_EXERCISED`, `EXPIRED`, `CANCELLED`) e liquidação do exercício (`subscription_exercises`) gerando atomicamente evento operacional `BUY` com chave `idempotencyKey`.

### 7. Dados de Mercado, Valuation e Séries Temporais (Fase 06)
- **Banco Interno de Mercado:** Tabelas dedicadas `market_quotes` (cotações de ativos) e `exchange_rates` (taxas de conversão cambial) consultadas localmente sem sobrecarga de rede durante a navegação.
- **Adaptadores de Ingestão:** Contrato abstrato `MarketDataProviderAdapter` com implementações funcionais para `ManualPayloadAdapter`, `MockProviderAdapter` (testes/desenvolvimento) e `BrapiAdapter` (provedor externo público para cotações brasileiras via API).
- **Ranking de Qualidade de Dados:** Hierarquia `DELAY_STATUS_QUALITY_RANK` (`realtime` > `delayed_15m` > `eod` > `manual` > `unknown`) garantindo que apenas dados de qualidade igual ou superior substituam cotações existentes.
- **Motor de Valuation e Evolução Temporal:** Motor determinístico (`valuation-engine.ts` e `portfolio-evolution-engine.ts`) com política de tolerância a cotações obsoletas (até 7 dias civis UTC), identificação de ativos não cotados e conversão cambial multi-moeda.
- **Gráficos e Visualizações:** Gráficos de alocação por ativo e por classe com Recharts, além de gráfico comparativo de evolução temporal "Mercado vs. Custo" com suporte a múltiplos períodos (`1M`, `3M`, `6M`, `YTD`, `1Y`, `ALL`) e fallback inicial `YTD`.

### 8. Planos Comerciais, Quotas e Assinaturas (Fase 05 — Pacotes 05.01 e 05.02)
- **Catálogo de Planos Comerciais:** Tabelas `commercial_plans` e `plan_entitlements` com os planos padrão `free` (2 carteiras ativas) e `pro` (10 carteiras ativas).
- **Fonte Única de Quota:** Limite numérico de carteiras derivado exclusivamente de `commercial_plans.max_active_portfolios`, sem duplicações inconsistentes.
- **Associação Vigente:** Tabela `user_plans` com vínculo único por usuário (`UNIQUE(user_id)`) e fallback em tempo de execução sem efeitos colaterais para o plano `free` quando inexistente.
- **Enforcement Server-Side de Quotas:** Validação estrita antes de inserções via `assertCanCreatePortfolio` com bloqueio concorrente pessimista (`FOR UPDATE`) no usuário.
- **Downgrade com Congelamento Seguro (`frozen`):** Operação transacional e idempotente (`applyPlanDowngradeInTransaction`) que congela carteiras excedentes sem exclusão de dados financeiros históricos, gerando trilha em `audit_logs`.
- **Bloqueio Integral de Mutações em Carteiras Congeladas:** Centralizado em `assertPortfolioWritable`, impedindo criação/cancelamento de eventos operacionais, eventos corporativos, subscrições ou edições simples, enquanto permite soft delete para liberação voluntária de quota.
- **Estrutura de Assinaturas e Eventos de Pagamento:** Tabelas `billing_subscriptions` e `payment_events`, controle de status do ciclo de vida, idempotência estrita por `idempotency_key`, sincronização transacional com `user_plans` e interface agnóstica de gateways (`PaymentGatewayAdapter`).

### 9. Sistema Global de Tema e Identidade Visual
- **Temas Disponíveis:** Suporte nativo aos modos **Claro** (paleta suave `#F8FAFC` com cards brancos), **Escuro** (fundo `#0B1120` com superfícies `#1E293B`) e **Automático/System** (sincronizado dinamicamente com o sistema operacional via `prefers-color-scheme`).
- **Acessibilidade e Controle:** Componente `ThemeToggle` com teclado acessível (`Escape`, clique fora, `aria-expanded`), sem FOUC (flash de tema incorreto) via script síncrono injetado no `<head>` e persistência sob a chave `carteiraexpert_theme`.
- **Tokens Semânticos:** Matriz padronizada de cores funcionais (textos, bordas, superfícies, ações, gráficos positivos/negativos e custos).

### 10. Integridade de Schema, Contratos e Banco de Dados
- **Schema Guardian:** Validação física em tempo de execução (`assertSchemaCompatible`) e via CLI (`db:verify`) inspecionando o catálogo PostgreSQL (19 tabelas oficiais validadas).
- **Contratos Drizzle Tipados:** Exportação canônica de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor`, com eliminação de `any` em assinaturas e callbacks.
- **Fixture Estática de Tipos:** Arquivo `tests/types/database-contracts.test-d.ts` validando compatibilidade estrutural e rejeição em tempo de compilação via `@ts-expect-error`.
- **Migrações Versionadas:** Script de migração (`scripts/migrate.ts`) com pre-flight check e trava de segurança exigindo `ALLOW_DATABASE_MUTATION=true` para o banco principal.
- **Seed de Desenvolvimento Protegido:** Script `scripts/seed-dev.ts` com trava obrigatória `ALLOW_DEV_SEED=true` e bloqueio automático em produção.

---

## Stack Tecnológica

- **Framework:** Next.js 16 (App Router, Server Components e Server Actions)
- **Linguagem:** TypeScript (Strict Mode)
- **Banco de Dados:** PostgreSQL
- **ORM & Driver:** Drizzle ORM com driver `postgres.js`
- **Precisão Financeira:** `decimal.js` (persistência via `NUMERIC` no PostgreSQL)
- **Validação de Esquemas:** Zod
- **Criptografia & Autenticação:** Argon2id e `node:crypto`
- **Linter & Formatação:** Biome
- **Testes Unitários e Integração:** Vitest
- **Testes End-to-End (E2E):** Playwright (Chromium, Firefox e WebKit)
- **Estilização & Visualização:** Tailwind CSS e Recharts

---

## Estrutura do Projeto

```text
carteiraexpert/
├── drizzle/                     # Migrações versionadas SQL (0000 a 0008)
│   └── migrations/
├── scripts/                     # Scripts de manutenção e infraestrutura
│   ├── ingest-market-data.ts    # Ingestão administrativa de dados de mercado (BRAPI / Manual)
│   ├── migrate.ts               # Execução controlada de migrações
│   ├── seed-dev.ts              # Seed determinístico de desenvolvimento (protegido)
│   └── verify-schema.ts         # Inspeção física do catálogo PostgreSQL (Schema Guardian)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Rotas públicas (login, register, forgot-password, reset-password)
│   │   ├── (dashboard)/         # Área autenticada protegida com verificação de termos
│   │   │   ├── dashboard/       # Dashboard consolidado de carteiras
│   │   │   ├── history/         # Extrato cronológico paginado com filtros avançados
│   │   │   └── portfolios/      # Listagem (/portfolios) e detalhes (/portfolios/[id])
│   │   ├── terms-acceptance/    # Tela isolada de consentimentos pendentes LGPD
│   │   ├── layout.tsx           # Layout raiz com script anti-FOUC e ThemeProvider
│   │   └── globals.css          # Variáveis CSS semânticas e Tailwind inline theme
│   ├── lib/
│   │   ├── db/                  # Cliente PostgreSQL, contratos canônicos, auditoria e schemas
│   │   └── theme/               # Provedor, hook useTheme, alternador e tokens semânticos
│   ├── middleware.ts            # Proteção de rotas no Edge
│   └── modules/
│       ├── identity/            # Módulo de autenticação, sessões, segurança e termos LGPD
│       ├── plans/               # Módulo de planos comerciais, entitlements, quotas e downgrade
│       ├── billing/             # Módulo de assinaturas comerciais, eventos de pagamento e gateways
│       ├── portfolio/           # Módulo de carteiras, ativos, motor de posições, valuation e gráficos
│       ├── corporate-actions/   # Módulo de ações corporativas (split, grupamento, bonificação, proventos e subscrições)
│       └── market-data/         # Módulo de cotações, câmbio, adaptadores (Manual, Mock, BRAPI) e ingestão
├── tests/
│   ├── unit/                    # Testes unitários puros (motores, schemas, tema, planos, billing, adaptadores)
│   ├── integration/             # Testes de integração com PostgreSQL real (carteiras, planos, billing, market data, subscrições)
│   └── types/                   # Fixtures de tipagem estática (database-contracts.test-d.ts)
├── e2e/                         # Testes end-to-end com Playwright (autenticação, termos, carteiras, planos, subscrições)
└── docs/                        # Documentação técnica, arquitetura, ADRs e status de entrega
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com base nas seguintes variáveis:

| Variável | Descrição | Obrigatório |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão com o PostgreSQL principal (desenvolvimento/produção). | Sim |
| `DATABASE_URL_TEST` | String de conexão dedicada para o banco de testes automatizados (isolado). | Sim (para testes) |
| `AUTH_SECRET` | Chave secreta de alta entropia para derivação de tokens e sessões. | Sim (em produção) |
| `AUTH_RATE_LIMIT_SECRET` | Chave secreta para cálculo de hash HMAC-SHA256 no limitador de taxa. | Sim (em produção) |
| `ALLOWED_ORIGINS` | Lista de origens permitidas separadas por vírgula para proteção CSRF. | Sim |
| `TRUSTED_PROXIES` | Lista de IPs de proxies reversos confiáveis para extração de cabeçalhos de IP do cliente. | Opcional |
| `BRAPI_TOKEN` | Token de autenticação da API pública BRAPI para ingestão de cotações. | Opcional |
| `ALLOW_DATABASE_MUTATION` | Defina como `true` para autorizar migrações na `DATABASE_URL` principal. | Sim (ao migrar) |
| `ALLOW_DEV_SEED` | Defina como `true` para autorizar a execução do seed de desenvolvimento. | Opcional em dev |
| `SECURE_COOKIES` | Em `development`, defina como `true` para forçar o atributo `Secure`. | Opcional em dev |
| `NODE_ENV` | Modo de execução (`development`, `production` ou `test`). | Automático |

---

## Comandos Disponíveis

```bash
# Desenvolvimento e Build
pnpm install          # Instalar dependências
pnpm dev              # Iniciar servidor de desenvolvimento
pnpm build            # Compilar para produção
pnpm start            # Iniciar servidor de produção

# Qualidade e Tipagem
pnpm typecheck        # Verificação de tipos TypeScript (inclui fixtures)
pnpm lint             # Executar linter (Biome)
pnpm lint:fix         # Corrigir problemas de lint automaticamente
pnpm format:fix       # Verificar e aplicar formatação

# Testes
pnpm test:unit        # Testes unitários (Vitest)
pnpm test:integration # Testes de integração com PostgreSQL (Vitest)
pnpm test:e2e         # Testes End-to-End no Chromium, Firefox e WebKit (Playwright)

# Banco de Dados e Migrações
pnpm db:verify        # Inspecionar catálogo físico no banco principal (17 tabelas)
pnpm db:verify -- --test # Inspecionar catálogo físico no banco de testes
pnpm db:migrate       # Executar migrações no banco principal (exige ALLOW_DATABASE_MUTATION=true)
pnpm db:migrate -- --test # Executar migrações no banco de testes
pnpm db:seed:dev      # Popular ativos de teste (exige ALLOW_DEV_SEED=true)

# Dados de Mercado
pnpm market:ingest    # Executar script administrativo de ingestão de dados de mercado (BRAPI / Manual)
```

---

## Capacidades Planejadas (Não Implementadas)

As seguintes funcionalidades representam direcionamentos no roadmap e permanecem como capacidades planejadas para fases futuras:

1. **Fase 05 (Expansão) — Pagamentos e Compartilhamento:** Gateways de pagamento (Stripe/Asaas/MercadoPago), webhooks, cron jobs de expiração de assinatura e gestão de grupos compartilhados com faturamento unificado e segregação estrita de dados financeiros (ADR-004).
2. **Fase 07 — Importações de Arquivos:** Upload e parsing de planilhas CSV/XLSX, extração assíncrona de notas de corretagem em PDF e armazenamento em bucket privado com URLs assinadas.
3. **Fase 09 — Opções e Módulo Fiscal Dedicado:** Cadastro e acompanhamento de contratos de opções, modelos teóricos de valuation (Bazin, Graham, Lynch, DCF), simulações de aportes futuros, módulo fiscal dedicado (`src/modules/tax/`) e relatórios anuais auxiliares para IRPF.
4. **Fase 10 — IA Editorial Interna:** Pipeline editorial interno com apoio de IA e revisão humana mandatória para elaboração de resumos corporativos.
5. **Gestão de Caixa e Custódia Institucional:** Saldos em moeda corrente, depósitos/retiradas bancárias e vinculação formal de corretoras e contas de custódia.
6. **Automação de Market Data:** Jobs assíncronos agendados (cron jobs) e streaming de cotações via WebSocket.
