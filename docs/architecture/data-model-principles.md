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
- `OPTION_EXERCISE` e `OPTION_EXPIRATION` (*Planejados, não implementados*).

*Nota:* As movimentações financeiras de caixa (`DEPOSIT`, `WITHDRAWAL`, `TRANSFER`, `ADJUSTMENT`) possuem modelo relacional próprio em `cash_transactions` (`src/lib/db/schema/cash.ts`), e as contas e instituições de custódia são gerenciadas nas entidades `custody_institutions` e `custody_accounts` (`src/lib/db/schema/custody.ts`), associadas opcionalmente a eventos patrimoniais via `custody_account_id`.

## 2. Preservação e Rastreabilidade de Fatos Históricos

- Fatos históricos são preservados por padrão e corrigidos por cancelamento lógico, reversão, ajuste manual ou novo lançamento corretivo. A imutabilidade lógica e a rastreabilidade são princípios do modelo; isso não significa que todas as linhas sejam fisicamente imutáveis.
- A tabela `audit_logs` registra alterações críticas (`INSERT`, `UPDATE`, `DELETE`, `REVERSAL`, `ADJUSTMENT`) contendo ator, tipo de ator, identificador de correlação e snapshots sanitizados do estado anterior e posterior.

## 3. Projeções e Cálculos Derivados

Para garantir desempenho e evitar inconsistências, posições e métricas analíticas são calculadas sob demanda ou projetadas a partir dos eventos:

- **Posição Atual e Custo Médio Ponderado:** Calculados deterministicamente pelo motor de posições (`position-engine.ts`) a partir da sequência cronológica de eventos.
- **PnL Realizado:** Cálculo derivado apurado a cada operação de venda (`SELL`), confrontando o preço líquido de venda com o custo médio ponderado vigente. Não constitui tabela física persistida.
- **Evolução Patrimonial Temporal:** Gerada sob demanda pelo motor de evolução (`portfolio-evolution-engine.ts`) via replay temporal de eventos até a data de avaliação.
- **Saldo de Caixa Monetário:** Calculado deterministicamente pelo motor de caixa (`cash.service.ts`) a partir das transações em `cash_transactions`, garantindo concorrência segura com lock `FOR UPDATE`.
- **Resumo Tributário:** *Parcialmente implementado*. Bases factuais disponíveis através de PnL realizado e proventos apurados nos motores de domínio.
- **Custódia Institucional:** Gerenciada através das tabelas relacionais `custody_institutions` (catálogo canônico global) e `custody_accounts` (contas vinculadas a carteira), com integridade referencial `ON DELETE SET NULL` em `portfolio_events`, `cash_accounts` e `import_batches`. A estrutura `custodyMap` em memória nos motores é uma estrutura utilitária para consolidação de ativos durante o cálculo contábil.

## 4. Precisão Numérica e Tipagem

- **Valores Monetários e Cotações:** Obrigatoriamente `NUMERIC(20, 8)` no PostgreSQL e classe `Decimal` no TypeScript.
- **Quantidades de Ativos e Criptoativos:** Obrigatoriamente `NUMERIC(28, 10)` no PostgreSQL e classe `Decimal` no TypeScript.
- **Proibição de Ponto Flutuante:** É terminantemente proibido o uso de `number`, `FLOAT`, `REAL` ou `DOUBLE PRECISION` para valores monetários, taxas, cotações, preços médios ou quantidades.
- **Datas e Fusos Horários:** Todas as colunas temporais utilizam `TIMESTAMP WITH TIME ZONE` (`TIMESTAMPTZ`) persistidas com referência horária UTC.

## 5. Estrutura Física do Banco de Dados

O banco de dados relacional oficial do CarteiraExpert é composto exatamente por **36 tabelas físicas de aplicação** (além da tabela técnica de controle `__drizzle_migrations`, totalizando 37 tabelas no PostgreSQL), validadas pelo Schema Guardian (`src/lib/db/verify-schema.ts`).

### 5.1. Catálogo Físico Canônico das 36 Tabelas (Paridade Estrita com Schema Guardian e Delivery Status)

1. `audit_logs` — Trilha de auditoria transversal de segurança e mutações de dados;
2. `users` — Contas de usuários autenticados com credenciais seguras;
3. `sessions` — Sessões ativas de autenticação com token criptográfico SHA-256;
4. `password_reset_tokens` — Tokens temporários de uso único para redefinição atômica de senha;
5. `auth_rate_limits` — Controle de taxa contra força bruta com HMAC-SHA256;
6. `user_consents` — Registro versionado de consentimentos LGPD com trigger *append-only*;
7. `portfolios` — Carteiras de investimento com atributo de finalidade (`purpose`: `REAL`, `ESTUDO`, `ANALISE`), unicidade da carteira `REAL` e isolamento multitenant;
8. `assets` — Catálogo canônico de instrumentos financeiros globais e customizados;
9. `portfolio_events` — Fatos históricos financeiros e operacionais (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`), com coluna `direction` e chave estrangeira `custody_account_id` (`ON DELETE SET NULL`);
10. `subscription_offers` — Ofertas de subscrição de ativos reguladas pelo mercado;
11. `subscription_rights` — Lotes de custódia de direitos de subscrição alocados por carteira;
12. `subscription_exercises` — Exercício liquidado de direitos gerando evento operacional `BUY` com chave `idempotencyKey`;
13. `market_quotes` — Cotações consolidadas locais com status de defasagem (EOD, realtime);
14. `exchange_rates` — Taxas de câmbio históricas e diárias entre pares de moedas;
15. `commercial_plans` — Catálogo de planos comerciais e quotas numéricas (`max_active_portfolios`);
16. `plan_entitlements` — Chaves de autorização funcional (flags) por plano;
17. `user_plans` — Vínculo vigente do usuário com seu plano comercial;
18. `billing_subscriptions` — Assinaturas comerciais e ciclo de vida de faturamento;
19. `payment_events` — Histórico de cobranças e liquidações com chave de idempotência (`idempotency_key`);
20. `billing_groups` — Grupos de faturamento compartilhado (Plano Família/Compartilhado);
21. `billing_group_members` — Membros participantes de grupo compartilhado com isolamento estrito de carteiras;
22. `billing_group_invitations` — Convites formais emitidos para participação em grupos com token único;
23. `user_chart_preferences` — Preferências de visualização gráfica por usuário e contexto;
24. `import_batches` — Lotes de importação CSV com status, deduplicação e chave estrangeira `custody_account_id`;
25. `import_batch_items` — Linhas brutas do lote para conciliação antes da criação de eventos;
26. `b3_cotahist_batches` — Lotes de ingestão de séries históricas e arquivos diários B3 COTAHIST;
27. `b3_historical_quotes` — Cotações históricas oficiais de fechamento (EOD) da B3;
28. `asset_fundamentals` — Demonstrações contábeis oficiais versionadas (DFP/ITR) da CVM;
29. `cvm_companies` — Cadastro oficial de companhias abertas da CVM (Resolução 80);
30. `cvm_source_files` — Rastreabilidade e integridade (SHA-256) de arquivos baixados da CVM;
31. `cvm_ingestion_runs` — Execuções de parsers CVM com controle de concorrência e lease locks;
32. `cvm_company_assets` — De-Para auditado entre Companhias CVM e Ativos do Catálogo Canônico;
33. `cash_accounts` — Contas de caixa monetário por carteira, vinculáveis a contas de custódia (`custody_account_id`);
34. `cash_transactions` — Movimentações de caixa (`DEPOSIT`, `WITHDRAWAL`, `TRANSFER`, `ADJUSTMENT`) com vínculo opcional a eventos de carteira;
35. `custody_institutions` — Catálogo canônico pré-populado de corretoras, bancos e exchanges nacionais e globais;
36. `custody_accounts` — Contas de custódia vinculadas à carteira e à instituição (`active`, `archived`) com desvinculação `ON DELETE SET NULL`.

### 5.2. Mapeamento por Domínio Arquitetural

| Domínio Arquitetural | Quantidade | Tabelas Físicas (Índices Canônicos) |
|---|:---:|---|
| **Identidade, Acesso e Auditoria** | 6 | `audit_logs` (1), `users` (2), `sessions` (3), `password_reset_tokens` (4), `auth_rate_limits` (5), `user_consents` (6) |
| **Patrimônio, Ativos, Custódia e Caixa** | 10 | `portfolios` (7), `assets` (8), `portfolio_events` (9), `subscription_offers` (10), `subscription_rights` (11), `subscription_exercises` (12), `cash_accounts` (33), `cash_transactions` (34), `custody_institutions` (35), `custody_accounts` (36) |
| **Dados de Mercado, Cotações e Fundamentos** | 7 | `market_quotes` (13), `exchange_rates` (14), `user_chart_preferences` (23), `b3_historical_quotes` (27), `asset_fundamentals` (28), `cvm_companies` (29), `cvm_company_assets` (32) |
| **Ingestão, Arquivos e Processamento em Lote** | 5 | `import_batches` (24), `import_batch_items` (25), `b3_cotahist_batches` (26), `cvm_source_files` (30), `cvm_ingestion_runs` (31) |
| **Planos, Assinaturas e Faturamento** | 8 | `commercial_plans` (15), `plan_entitlements` (16), `user_plans` (17), `billing_subscriptions` (18), `payment_events` (19), `billing_groups` (20), `billing_group_members` (21), `billing_group_invitations` (22) |