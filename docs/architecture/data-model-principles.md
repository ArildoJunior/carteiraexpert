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

O banco de dados relacional é composto exatamente por **32 tabelas físicas de aplicação** (além da tabela de controle de migração `__drizzle_migrations`), organizadas nos seguintes domínios:

### 5.1. Domínio Patrimonial e Negócio (6 tabelas)
1. `portfolios` — Carteiras de investimento vinculadas individualmente aos usuários.
2. `assets` — Catálogo canônico de instrumentos financeiros (globais e customizados).
3. `portfolio_events` — Fatos históricos financeiros e operacionais imutáveis.
4. `subscription_offers` — Ofertas de subscrição de ativos reguladas pelo mercado.
5. `subscription_rights` — Lotes de direitos de subscrição atribuídos a carteiras.
6. `subscription_exercises` — Registros de exercício atômico de direitos de subscrição.

### 5.2. Dados de Mercado, Cotações e Fundamentos (7 tabelas)
7. `market_quotes` — Cotações consolidadas recentes com status de defasagem (EOD, realtime).
8. `exchange_rates` — Taxas de câmbio históricas e diárias entre pares de moedas.
9. `b3_historical_quotes` — Séries históricas de negociação B3 COTAHIST (granularidade de pregão).
10. `asset_fundamentals` — Demonstrações contábeis oficiais versionadas (DFP/ITR) da CVM.
11. `cvm_companies` — Cadastro oficial de companhias abertas da CVM (Resolução 80).
12. `cvm_company_assets` — De-Para auditado entre Companhias CVM e Ativos do Catálogo.
13. `user_chart_preferences` — Preferências de visualização gráfica por usuário e contexto.

### 5.3. Ingestão, Arquivos e Processamento em Lote (5 tabelas)
14. `b3_cotahist_batches` — Rastreabilidade e auditoria de arquivos COTAHIST da B3.
15. `cvm_source_files` — Rastreabilidade e integridade (SHA-256) de arquivos baixados da CVM.
16. `cvm_ingestion_runs` — Execuções de parsers CVM com controle de concorrência e lease locks.
17. `import_batches` — Lotes de importação de documentos de custódia e notas do usuário.
18. `import_batch_items` — Itens brutos extraídos para conciliação antes da criação de eventos.

### 5.4. Planos, Assinaturas e Grupos Multitenant (8 tabelas)
19. `commercial_plans` — Definição dos planos comerciais da plataforma.
20. `plan_entitlements` — Limites e capacidades operacionais por plano.
21. `user_plans` — Vínculo vigente do usuário com seu plano comercial.
22. `billing_subscriptions` — Assinaturas ativas integradas a gateway de pagamento.
23. `payment_events` — Histórico de cobranças, faturas e liquidações financeiras.
24. `billing_groups` — Grupos de faturamento compartilhado (Plano Família/Compartilhado).
25. `billing_group_members` — Membros participantes de um grupo de faturamento compartilhado.
26. `billing_group_invitations` — Convites formais emitidos para participação em grupos.

### 5.5. Identidade, Autenticação e Auditoria (6 tabelas)
27. `users` — Contas de usuários do sistema com credenciais e flags de segurança.
28. `sessions` — Sessões ativas de autenticação vinculadas a tokens opacos.
29. `password_reset_tokens` — Tokens temporários para redefinição de credenciais.
30. `auth_rate_limits` — Controle de taxa contra tentativas abusivas de autenticação.
31. `user_consents` — Registro de consentimento aos Termos de Uso e Políticas LGPD.
32. `audit_logs` — Trilha de auditoria transversal de segurança e mutações de dados.