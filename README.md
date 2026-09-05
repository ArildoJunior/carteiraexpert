# CarteiraExpert

O **CarteiraExpert** é um SaaS brasileiro de consolidação patrimonial, inteligência financeira e apoio à gestão de investimentos para ativos brasileiros, internacionais, moedas estrangeiras, criptoativos e opções.

> **Finalidade e limites inegociáveis:** A plataforma tem finalidade estritamente informativa, organizacional e educacional. A plataforma **NÃO** recomenda compra, venda, manutenção, rolagem ou estratégias de investimento, **NÃO** envia, intermedia ou executa ordens para corretoras, bancos ou exchanges, **NÃO** executa rolagens de opções, **NÃO** emite DARF ou realiza pagamentos e **NÃO** substitui profissionais habilitados. Cálculos financeiros são determinísticos e isolados, sem dependência de IA.

---

## Estado Atual do Projeto

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, auditoria imutável e infraestrutura de testes).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, recuperação de senha atômica, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:** Concluída e Publicada (Pacotes 03.00-E, 03.01-D, 03.02, 03.03 e 03.04 — Gestão de carteiras com finalidade explícita, ativos globais e customizados, lançamentos manuais de Compra, Venda e Ajustes Manuais (`MANUAL_ADJUSTMENT`) com direção explícita (`IN` e `OUT`), motor de custo médio ponderado, validação temporal de vendas e saídas com bloqueio de saldo descoberto, apuração de PnL realizado, tratamento de `REVERSAL` como evento neutro no cálculo contábil, dashboard consolidado e extrato de histórico paginado com filtros avançados).
- **Fase 04 — Eventos Corporativos e Subscrições:** Concluída e Homologada (Split, grupamento, bonificação de ações, proventos em dinheiro — dividendos isentos e JCP líquido com retenção de 15% de IRRF —, e ciclo de vida completo de direitos e subscrições societárias).
- **Fase 05 — Planos Comerciais, Assinaturas e Entitlements:** Parcialmente Implementada (Pacotes 05.01, 05.02 e 05.03 homologados — catálogo comercial Free/Pro, quotas de carteiras ativas com lock pessimista, downgrade idempotente com congelamento `frozen`, eventos de faturamento e página `/plans`).
- **Fase 06 — Dados de Mercado, Valuation e Gráficos:** Parcialmente Implementada (Pacotes 06.01 e 06.02 homologados — cotações, taxas de câmbio, adaptadores BRAPI/Manual/Mock, valuation determinístico, gráficos Recharts e persistência atômica de preferências em `user_chart_preferences`).
- **Fase 06.5 — Alinhamento do MVP e Catálogo Público de Ativos:** Concluída e Homologada (Camada pública de descoberta com rotas `/acoes`, `/fiis`, `/etfs`, `/bdrs`, busca global `/ativos`, SEO e Landing Page `/`).
- **Fase 07 — Importações Revisáveis:** Concluída e Homologada (ADR-007, parsers CSV com auto-detecção para B3 e formato canônico, limite de 5 MB, deduplicação em 2 níveis, central de revisão `/import/[id]`, resolução explícita de ativos e confirmação atômica em `portfolio_events`).
- **Plano Mestre de Conclusão Funcional (Etapas 1 a 10 Concluídas):**
  - **Etapa 1 — Resiliência Operacional, Segurança e Health Check:** Concluída (Commit `c4ee5cf`, Route Handler `/api/health`, error boundaries, headers HTTP de segurança, runner `/api/jobs/ingest` e scripts de backup/restore).
  - **Etapa 2 — Documentação Operacional de Ingestão e Backup:** Concluída (Commit `64cc2e8`, playbooks operacionais `docs/operations/backup-and-restore.md` e `docs/operations/market-data-ingestion.md`).
  - **Etapa 3 — Finalidades de Carteira (`REAL`, `ESTUDO`, `ANALISE`) e Dashboard Contextual:** Concluída (Commit `f30faf8`, migração `0018_add_portfolio_purpose.sql`, atributo `purpose: 'REAL' | 'ESTUDO' | 'ANALISE'`, índice único parcial `idx_unique_user_real_portfolio` e `DashboardContextSelector`).
  - **Etapa 4 — Gestão de Caixa e Movimentações Monetárias:** Concluída e Publicada (Commit `40341ba`, migração `0019_add_cash_accounts_and_transactions.sql`, tabelas `cash_accounts` e `cash_transactions`, saldos determinísticos em `Decimal`, validação de saldo não negativo, tela `/portfolios/[id]/cash`).
  - **Etapa 5 — Instituições e Contas de Custódia:** Concluída e Publicada (Commit `78f2a5c`, migração `0020_add_custody_entities.sql`, ADR-012, tabelas `custody_institutions` com seed canônico e `custody_accounts`, associação opcional `ON DELETE SET NULL` em eventos, contas de caixa e importações, proteção IDOR e filtro de custódia em `/history`).
  - **Etapa 6 — Modelos Teóricos de Valuation (Bazin, Graham, DCF):** Concluída e Validada (Motores matemáticos puros determinísticos em `Decimal` para Preço Teto de Bazin, Fórmula de Graham e DCF Simplificado em `src/modules/market-data/domain/theoretical-valuation-engine.ts`, componente interativo `TheoreticalValuationCard` nas rotas públicas `/acoes` e `/fiis`, com avisos regulatórios CVM).
  - **Etapa 7 — Simulador de Aportes, Juros Compostos e Projeções:** Concluída e Validada (Módulo `src/modules/projections/`, motor puramente determinístico em `Decimal`, taxas nominais e reais descontadas pela inflação, componente visual `CompoundInterestSimulator`, rota `/simulador`, aviso regulatório CVM, sem persistência nem contaminação da carteira real).
  - **Etapa 8 — Módulo Operacional de Opções:** Concluída e Validada (Módulo `src/modules/options/`, migração `0021_add_options_contracts.sql`, tabela `options_contracts`, motor determinístico Black-Scholes em `Decimal`, cálculo de gregas informativas Delta, Gamma, Theta base 252, Vega e Rho, monitoramento de vencimentos D-5/D-0, tela analítica `/options` com avisos regulatórios formais CVM/ANBIMA, sem envio de ordens nem rolagem automatizada).
  - **Etapa 9 — Módulo Fiscal Dedicado e Relatórios Auxiliares de IRPF:** Concluída e Validada (Módulo `src/modules/tax/`, migração `0022_add_tax_calculation_tables.sql`, tabelas `tax_calculation_runs`, `tax_monthly_summaries` e `tax_loss_credits`, motor determinístico em `Decimal`, isenção de R$ 20k em ações com regra de perda em meses isentos conforme IN RFB 2054/2024, segregação de day-trade 20%, FIIs 20%, JCP 15%, retenção de IRRF na fonte sobre alienações (antecipação), créditos de prejuízo acumulado compensados via FIFO em até 5 anos, relatório anual IRPF, aviso regulatório obrigatório `id="tax-regulatory-disclaimer"` e tela `/fiscal`).
  - **Etapa 10 — IA Editorial Interna com Fluxo de Revisão Humana Obrigatória:** Concluída e Validada (Módulo `src/modules/editorial/`, migração `0023_add_editorial_workflow_tables.sql`, 4 tabelas `editorial_documents`, `editorial_versions`, `editorial_reviews`, `editorial_ai_executions`, máquina de estados rigorosa `DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> PUBLISHED -> ARCHIVED`, segregação de funções obrigatória com bloqueio de autoaprovação, guardrails regulatórios determinísticos CVM/ANBIMA, provedor desacoplado `MockEditorialAiProvider` com sanitização preventiva e interface administrativa `/editorial`).
- **Próximas Etapas no Roadmap:** Com as Etapas 1 a 10 do plano mestre funcional concluídas e homologadas (44 tabelas de aplicação + 1 tabela técnica `__drizzle_migrations`, totalizando 45 tabelas no PostgreSQL), os próximos passos técnicos incluem automação contínua de ingestão de dados de mercado (cron jobs / workers assíncronos pós-fechamento B3/CVM), integração de gateways de pagamento reais (Stripe/Asaas) com webhooks ativos e expansão de parsers para planilhas binárias (`.xlsx`) e notas de corretagem em PDF via bucket privado.

---

## Prontidão Operacional, Riscos Técnicos e Pendências de Produção

> [!IMPORTANT]
> **Status de Homologação:** A conclusão e validação integral das **Etapas 1 a 10 no plano funcional** comprova a maturidade das regras de negócio, a integridade matemática determinística em `Decimal` e a aprovação das suítes de teste (1.223 testes unitários, 499 de integração e 172 E2E). Contudo, **isto NÃO equivale a prontidão irrestrita para publicação imediata em produção aberta**.
>
> Para a liberação segura em ambiente de produção, devem ser atendidas as seguintes pendências técnicas e operacionais identificadas na auditoria interna:
>
> 1. **Startup Guard para Segredos Críticos:** Implementar validação mandatória na inicialização da aplicação (startup guard) que exija strings aleatórias de alta entropia (mínimo de 32 caracteres) para `CRON_SECRET` e `AUTH_RATE_LIMIT_SECRET`, impedindo o boot do serviço em modo de produção com segredos fracos ou ausentes.
> 2. **Endurecimento de RBAC no Módulo Editorial:** O módulo editorial (`/editorial`) implementa máquina de estados rigorosa, segregação de funções e bloqueio de autoaprovação entre autor e revisor, mas a rota HTTP e as Server Actions admitem qualquer usuário autenticado. É necessário implementar controle de acesso baseado em papéis (RBAC com atributo `role` no usuário) para restringir o acesso exclusivamente à equipe interna de redação/revisão.
> 3. **Definição do Orquestrador de Ingestão:** Definir e configurar o serviço oficial de orquestração em nuvem (ex.: GCP Cloud Scheduler, AWS EventBridge ou cron do servidor) responsável por acionar autenticadamente a rota `/api/jobs/ingest` pós-fechamento B3/CVM.
> 4. **Limpeza de Dependência Residual:** Remover a dependência órfã `"biome": "0.3.3"` do `package.json`, preservando unicamente a ferramenta oficial `@biomejs/biome: 2.5.7`.

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
- **Finalidade da Carteira (`purpose`):** Classificação obrigatória entre `REAL` (carteira de patrimônio real), `ESTUDO` (carteira de simulação/estudo) e `ANALISE` (análise de carteira hipotética), com restrição física única de carteira ativa `REAL` por usuário (`idx_unique_user_real_portfolio`).
- **Visão Detalhada da Carteira (`/portfolios/[id]`):** Cabeçalho com métricas da carteira, quadro de posições consolidadas em custódia, extrato cronológico de operações ativas e ações de lançamento.
- **Ativos Globais e Customizados:** Autocomplete debounced com busca server-side no lançamento de operações e modal para cadastro rápido de ativos customizados por usuário com ticker único.
- **Registro Manual de Operações e Ajustes:** Modal para lançamento de ordens de Compra (`BUY`), Venda (`SELL`) e Ajuste Manual (`MANUAL_ADJUSTMENT`) com seleção condicional obrigatória de direção (`IN` ou `OUT`), indicação em tempo real de quantidade disponível em custódia para vendas e ajustes de saída, datas de negociação/liquidação, quantidade, preço unitário, taxas e notas.
- **Associação com Conta de Custódia:** Suporte a vínculo opcional de eventos operacionais a uma conta de custódia cadastrada (`custodyAccountId`), com desvinculação graciosa (`ON DELETE SET NULL`) em caso de exclusão da conta.
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
- **Dashboard Contextual SSR (`/dashboard`):** Exibição automática e contextual da carteira com finalidade `REAL` do usuário autenticado. Caso o usuário possua apenas carteiras de estudo/análise ou nenhuma carteira, um banner contextual convida à criação da carteira Real ou direciona para `/portfolios`.
- **Segregação por Moeda Base:** Agrupamento estrito de métricas por moeda (`BRL`, `USD`, `EUR`), sem conversão cambial fictícia.
- **Métricas Consolidadas:** Custo total de aquisição em custódia, PnL realizado acumulado de vendas, taxas acumuladas, proventos acumulados, contagem de ativos distintos e carteiras ativas.
- **Feed Unificado e Extrato Geral (`/history`):** Extrato cronológico multicarteiras de compras, vendas, ajustes e eventos corporativos, com filtros avançados por carteira, conta de custódia (`custodyAccountId`), tipo de operação, ativo e período de datas.
- **Exclusão de Soft Deletes:** Desconsideração estrita de eventos e carteiras canceladas/excluídas em todas as consultas e agregações.

### 6. Eventos Corporativos e Subscrições (Fase 04)
- **Desdobramentos (SPLIT) e Grupamentos (GROUPING):** Ajuste proporcional de quantidade e custo médio unitário mantendo o custo total de aquisição invariante, com identificação e preservação de frações residuais em `Decimal`.
- **Bonificação em Ações (BONUS_SHARE):** Adição de cotas bonificadas com custo atribuído opcional e recálculo determinístico do custo médio unitário.
- **Proventos em Dinheiro (DIVIDEND e JCP):** Dividendos isentos e Juros sobre Capital Próprio com retenção de 15% de IRRF, validação de Data-Com e exigência obrigatória de Data de Pagamento (`settlementDate`).
- **Ofertas e Direitos de Subscrição:** Gestão de ofertas (`subscription_offers`), custódia de direitos alocada por carteira (`subscription_rights`), controle de status (`ACTIVE`, `PARTIALLY_EXERCISED`, `FULLY_EXERCISED`, `EXPIRED`, `CANCELLED`) e liquidação do exercício (`subscription_exercises`) gerando atomicamente evento operacional `BUY` com chave `idempotencyKey`.

### 7. Dados de Mercado, Valuation, Séries Temporais e Preferências de Gráficos (Fase 06)
- **Banco Interno de Mercado:** Tabelas dedicadas `market_quotes` (cotações de ativos) e `exchange_rates` (taxas de conversão cambial) consultadas localmente sem sobrecarga de rede durante a navegação.
- **Adaptadores de Ingestão:** Contrato abstrato `MarketDataProviderAdapter` com implementações funcionais para `ManualPayloadAdapter`, `MockProviderAdapter` (testes/desenvolvimento) e `BrapiAdapter` (provedor externo público para cotações brasileiras via API).
- **Ranking de Qualidade de Dados:** Hierarquia `DELAY_STATUS_QUALITY_RANK` (`realtime` > `delayed_15m` > `eod` > `manual` > `unknown`) garantindo que apenas dados de qualidade igual ou superior substituam cotações existentes.
- **Motor de Valuation e Evolução Temporal:** Motor determinístico (`valuation-engine.ts` e `portfolio-evolution-engine.ts`) com política de tolerância a cotações obsoletas (até 7 dias civis UTC), identificação de ativos não cotados e conversão cambial multi-moeda.
- **Gráficos e Visualizações:** Gráficos de alocação por ativo, por classe e por moeda com Recharts, além de gráfico comparativo de evolução temporal "Mercado vs. Custo" com suporte a múltiplos períodos (`1M`, `3M`, `6M`, `YTD`, `1Y`, `ALL`) e fallback inicial `YTD`.
- **Persistência de Preferências por Usuário e Área:** Tabela dedicada `user_chart_preferences` (migração `0010_add_user_chart_preferences.sql`) armazenando preferências visuais do usuário para `portfolio_evolution` (`period`, `view_mode`), `dashboard_allocation` (`grouping_type`, `basis`) e `portfolio_allocation` (`grouping_type`, `basis`).
- **Arquitetura Anti-Concorrência e Coalescência:** Sincronização assíncrona orientada a fila (`ChartPreferenceSyncQueue` / `useChartPreferenceSync`) que consolida cliques rápidos, elimina race conditions de closure e garante que a última escolha do usuário seja gravada atomicamente via upsert no PostgreSQL (`saveUserChartPreference`).
- **Segregação entre Dados Financeiros e Escolhas Visuais:** Atualizações de dados derivados e mutações de carteira (compras, vendas, cancelamentos) acionam `router.refresh()` e atualizam o resumo financeiro (`initialSummary`) sem jamais reverter os seletores visuais locais escolhidos pelo usuário.
- **Isolamento Multitenant Estrito:** As preferências são vinculadas e consultadas exclusivamente pelo `userId` derivado da sessão autenticada no servidor (`requireAuth()`), com proteção IDOR total.

### 8. Planos Comerciais, Quotas e Assinaturas (Fase 05 — Pacotes 05.01, 05.02 e 05.03)
- **Catálogo de Planos Comerciais:** Tabelas `commercial_plans` e `plan_entitlements` com os planos padrão `free` (2 carteiras ativas) e `pro` (10 carteiras ativas).
- **Fonte Única de Quota:** Limite numérico de carteiras derivado exclusivamente de `commercial_plans.max_active_portfolios`, sem duplicações inconsistentes.
- **Associação Vigente:** Tabela `user_plans` com vínculo único por usuário (`UNIQUE(user_id)`) e fallback em tempo de execução sem efeitos colaterais para o plano `free` quando inexistente.
- **Enforcement Server-Side de Quotas:** Validação estrita antes de inserções via `assertCanCreatePortfolio` com bloqueio concorrente pessimista (`FOR UPDATE`) no usuário.
- **Downgrade com Congelamento Seguro (`frozen`):** Operação transacional e idempotente (`applyPlanDowngradeInTransaction`) que congela carteiras excedentes sem exclusão de dados financeiros históricos, gerando trilha em `audit_logs`.
- **Bloqueio Integral de Mutações em Carteiras Congeladas:** Centralizado em `assertPortfolioWritable`, impedindo criação/cancelamento de eventos operacionais, eventos corporativos, subscrições ou edições simples, enquanto permite soft delete para liberação voluntária de quota.
- **Estrutura de Assinaturas e Eventos de Pagamento:** Tabelas `billing_subscriptions` e `payment_events`, controle de status do ciclo de vida, idempotência estrita por `idempotency_key`, sincronização transacional com `user_plans` e interface agnóstica de gateways (`PaymentGatewayAdapter`).
- **Experiência Comercial e Gestão de Planos:** Página dedicada `/plans` com visão comparativa de recursos, quotas em tempo real, status da assinatura e governança transparente sem cobrança real.

### 9. Sistema Global de Tema e Identidade Visual
- **Temas Disponíveis:** Suporte nativo aos modos **Claro** (paleta suave `#F8FAFC` com cards brancos), **Escuro** (fundo `#0B1120` com superfícies `#1E293B`) e **Automático/System** (sincronizado dinamicamente com o sistema operacional via `prefers-color-scheme`).
- **Acessibilidade e Controle:** Componente `ThemeToggle` com teclado acessível (`Escape`, clique fora, `aria-expanded`), sem FOUC (flash de tema incorreto) via script síncrono injetado no `<head>` e persistência sob a chave `carteiraexpert_theme`.
- **Tokens Semânticos:** Matriz padronizada de cores funcionais (textos, bordas, superfícies, ações, gráficos positivos/negativos e custos).

### 10. Módulo de Importações Revisáveis (Fase 07)
- **Formatos CSV Suportados com Auto-Detecção:** Parser canônico `StandardCsvParserAdapter` (`carteiraexpert_csv`) com suporte a colunas flexíveis em português ou inglês e separadores (`,`, `;`, `\t`), além de adaptadores dedicados para relatórios B3: `B3TradesCsvParserAdapter` (`b3_trades_csv`) e `B3MovementsCsvParserAdapter` (`b3_movements_csv`).
- **Limite Uniforme de Upload:** Limite de 5 MB (`5_242_880` bytes) e rejeição impeditiva de arquivos vazios (0 bytes), validados no client-side (`ImportUploadZone`), nos schemas Zod e no serviço server-side.
- **Deduplicação Inteligente em Dois Níveis:** Hash SHA-256 de arquivo (`raw_content_hash`) para alertar sobre arquivos já confirmados anteriormente e hash de linha (`raw_line_hash`) com detecção automática de operações idênticas na carteira, marcando-as como duplicadas e desmarcando-as preventivamente por padrão.
- **Revisão Humana Mandatória (ADR-007):** Tela central `/import/[id]` em status `pending_review` com painel de KPIs em tempo real (*Total de Linhas*, *Válidos*, *Alertas/Avisos*, *Erros Bloqueantes*, *Duplicados*), abas de filtro por status e tabela detalhada de conferência.
- **Edição Manual e Exclusão de Linhas:** Retificação de quantidades, preços e taxas com precisão `Decimal` via modal dedicado (`EditBatchItemModal`), além de exclusão/reativação voluntária de linhas via checkbox.
- **Resolução Explícita de Ativos Não Mapeados:** Ativos com tickers não cadastrados recebem status `warning` e impedem a confirmação até resolução explícita do usuário: associação a ativo existente no catálogo ou criação de ativo customizado restrito ao usuário (`select_existing` / `create_custom`).
- **Confirmação Transacional Atômica:** Execução sob lock pessimista `FOR UPDATE` no lote e na carteira, validação de carteira ativa (rejeitando carteiras congeladas `frozen` ou arquivadas), ordenação cronológica determinística e gravação em `portfolio_events` com `source = 'csv_import'` e vínculo bidirecional em `imported_portfolio_event_id`. Rollback total em qualquer falha.
- **Imutabilidade e Rejeição de Lote:** Transição para estados terminais (`confirmed` ou `rejected`) com bloqueio estrito de novas alterações (`ImportBatchNotEditableError`) e registro em `audit_logs`.
- **Proteção IDOR e Isolamento:** Todas as rotas `/import` e `/import/[id]`, Server Actions e consultas validam autenticação e posse exclusiva do usuário autenticado no servidor.

### 11. Gestão de Caixa e Movimentações Monetárias (Etapa 4 — Commit `40341ba`)
- **Contas de Caixa por Carteira (`cash_accounts`):** Suporte a múltiplas contas monetárias por carteira, com identificação de nome, moeda (`currency`), tipo (`CHECKING`, `INVESTMENT`, `SAVINGS`, `OTHER`), status (`ACTIVE`, `ARCHIVED`), saldo inicial e saldo acumulado determinístico. Migração `0019_add_cash_accounts.sql`.
- **Transações de Caixa (`cash_transactions`):** Registro de aportes (`DEPOSIT`), retiradas (`WITHDRAWAL`), transferências entre contas (`TRANSFER_IN`, `TRANSFER_OUT`), proventos recebidos (`INCOME`), despesas/taxas (`EXPENSE`) e ajustes manuais (`ADJUSTMENT`).
- **Precisão e Integridade:** Cálculos executados exclusivamente em `Decimal` e persistidos em `NUMERIC(18, 4)`. Validação temporal e bloqueio estrito de saldo negativo em contas que não permitem cheque especial.
- **Interface e Operações (`/portfolios/[id]/cash`):** Visão consolidada de saldos por moeda e conta, extrato de transações monetárias com paginação, filtros e modais de lançamento e transferência entre contas.

### 12. Instituições e Contas de Custódia (Etapa 5 — Commit `78f2a5c`)
- **Catálogo Canônico de Instituições (`custody_institutions`):** Tabela pública/canônica com identificação padronizada de bancos, corretoras e exchanges (nome, código de compensação B3/Febraban, país de origem, tipo de instituição). Seed inicial com 8 instituições brasileiras e globais (XP, BTG Pactual, NuInvest, Clear, Banco Inter, Avenue Securities, Interactive Brokers, Binance). Migração `0020_add_custody_entities.sql` e ADR-012.
- **Contas de Custódia por Carteira (`custody_accounts`):** Vínculo de custódia no âmbito de cada carteira com identificador da instituição parceira, código/número da conta, apelido amigável e status (`ACTIVE`, `ARCHIVED`).
- **Vínculos Opcionais e Desacoplamento Gracioso:** Suporte a chave estrangeira opcional `custody_account_id` em eventos operacionais (`portfolio_events`), contas de caixa (`cash_accounts`) e lotes de importação (`import_batches`), configurada com `ON DELETE SET NULL` para preservar o histórico contábil caso uma conta de custódia seja excluída.
- **Segurança e Auditoria:** Proteção IDOR mandatória validada no servidor (`assertPortfolioOwnership`) e rastreabilidade total de criações, alterações e arquivamentos em `audit_logs`.
- **Filtro de Custódia Integrado:** Extrato multicarteiras `/history` com seletor de filtro por conta de custódia, permitindo conferência isolada por instituição.

### 13. Integridade de Schema, Contratos e Banco de Dados
- **Schema Guardian:** Validação física em tempo de execução (`assertSchemaCompatible`) e via CLI (`db:verify`) inspecionando o catálogo PostgreSQL (**44 tabelas de aplicação + 1 tabela técnica `__drizzle_migrations`, totalizando 45 tabelas físicas validadas**).
- **Contratos Drizzle Tipados:** Exportação canônica de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor`, com eliminação de `any` em assinaturas e callbacks.
- **Fixture Estática de Tipos:** Arquivo `tests/types/database-contracts.test-d.ts` validando compatibilidade estrutural e rejeição em tempo de compilação via `@ts-expect-error`.
- **Migrações Versionadas:** Script de migração (`scripts/migrate.ts`) com pre-flight check e trava de segurança exigindo `ALLOW_DATABASE_MUTATION=true` para o banco principal.
- **Seed de Desenvolvimento Protegido:** Script `scripts/seed-dev.ts` com trava obrigatória `ALLOW_DEV_SEED=true` e bloqueio automático em produção.

### 14. Módulo Fiscal Dedicado e Relatórios Auxiliares de IRPF (Etapa 9)
- **Aviso Regulatório Obrigatório:** Elemento `id="tax-regulatory-disclaimer"` presente em todas as telas, cards e relatórios informando a natureza estritamente auxiliar e informativa, sem emissão de DARF, sem retenção tributária e sem intermediação junto à Receita Federal.
- **Motor Matemático em Decimal:** Cálculo determinístico de custo médio ponderado por ativo, segregação de day-trade (20%) vs swing-trade (15%), FIIs (20%) e JCP (15%).
- **Isenção de R$ 20k em Ações:** Regra de isenção mensal para vendas normais de ações até R$ 20.000,00, com perda sem direito a crédito futuro em meses isentos (conforme IN RFB 2054/2024).
- **Compensação de Prejuízos:** Histórico de créditos fiscais (`tax_loss_credits`) segregados por categoria (swing-trade, day-trade, FIIs), com dedução estrita FIFO e validade de 5 anos fiscais.
- **Retenção de IRRF na Fonte:** Rastreabilidade e segregação de IRRF retido na fonte sobre alienações (antecipação) e proventos tributados.
- **Relatório Anual e Fichas IRPF:** Posição em 31/12 (Bens e Direitos com código e discriminação), Rendimentos Isentos (dividendos e alienação isenta) e Rendimentos Sujeitos à Tributação Exclusiva (JCP e ganhos líquidos mensais).
- **Exportação e Impressão:** Geração de arquivo CSV estruturado e impressão formatada (`window.print()`) otimizada para consulta visual no momento da declaração manual.

### 15. Modelos Teóricos de Valuation (Etapa 6)
- **Motores Matemáticos Determinísticos:** Implementação pura em `Decimal` (`theoretical-valuation-engine.ts`) cobrindo Preço Teto pelo Método Décio Bazin (dividend yield mínimo configurável), Preço Justo pela Fórmula de Benjamin Graham (equilíbrio P/L e P/VP) e Fluxo de Caixa Descontado (DCF) simplificado em 2 estágios.
- **Dados Contábeis Padronizados:** Integração com demonstrativos financeiros oficiais da CVM (`asset_fundamentals`) e cotações de fechamento B3 COTAHIST.
- **Componente Visual Interativo:** Card interativo `TheoreticalValuationCard` nas páginas públicas de ações (`/acoes/[ticker]`) e FIIs (`/fiis/[ticker]`), permitindo ajuste de premissas em tempo real pelo usuário.
- **Neutralidade Regulatória CVM:** Avisos formais de que os valores apresentados são modelos matemáticos teóricos baseados em dados públicos e premissas definidas pelo usuário, não configurando recomendação de investimento.

### 16. Simulador de Projeções e Juros Compostos (Etapa 7)
- **Motor Determinístico de Projeções:** Módulo `src/modules/projections/` com cálculos matemáticos em `Decimal` para acumulação patrimonial, aportes periódicos e reinvestimento de proventos.
- **Desconto Inflacionário:** Simulação em termos nominais e reais (descontando inflação acumulada via taxa de juros real).
- **Componente Visual e Rota Dedicada:** Interface interativa `CompoundInterestSimulator` na rota `/simulador` com gráficos Recharts e tabelas de evolução ano a ano.
- **Isolamento de Carteiras:** Execução em memória no client/server sem persistência no banco e sem qualquer contaminação contábil nas carteiras reais do usuário.

### 17. Módulo Operacional de Opções (Etapa 8)
- **Cadastro e Gestão de Derivativos:** Tabela `options_contracts` (migração `0021_add_options_contracts.sql`) com rastreabilidade de strike, data de vencimento, estilo (Americana/Européia), tipo (Call/Put) e ativo subjacente.
- **Modelo Black-Scholes em Decimal:** Implementação determinística com aproximação polinomial de alta precisão (Abramowitz & Stegun) para cálculo de volatilidade implícita e gregas informativas (Delta, Gamma, Theta anualizado em base 252 dias úteis, Vega e Rho).
- **Calendário B3 e Alertas:** Detecção automatizada de vencimentos próximos com alertas operacionais em D-5 e D-0 baseados no calendário oficial de negociação da B3.
- **Interface e Gráfico de Payoff:** Rota analítica `/options` com visualização de curvas de payoff de vencimento, decomposição entre valor intrínseco e extrínseco e aviso regulatório CVM/ANBIMA obrigatório (sem envio de ordens nem execução de rolagem automatizada).

### 18. IA Editorial Interna e Governança com Revisão Humana Obrigatória (Etapa 10)
- **Módulo Editorial Desacoplado:** Módulo `src/modules/editorial/` com tabelas `editorial_documents`, `editorial_versions`, `editorial_reviews` e `editorial_ai_executions` (migração `0023_add_editorial_workflow_tables.sql`).
- **Máquina de Estados Rigorosa:** Ciclo de vida estrito `DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> PUBLISHED -> ARCHIVED`, com bloqueio de transições inválidas e versões imutáveis indexadas por hash SHA-256.
- **Segregação de Funções e Bloqueio de Autoaprovação:** O autor de um rascunho é impedido de atuar como revisor/aprovador do mesmo documento (`author_id !== reviewer_id`).
- **Guardrails Regulatórios Determinísticos CVM/ANBIMA:** Filtros preventivos pré e pós-geração que bloqueiam promessas de rentabilidade garantida, alegações de ausência de risco e recomendações diretas de compra/venda de ativos.
- **Provedor Desacoplado via Adapter:** Arquitetura limpa com sanitização de dados sensíveis antes de qualquer chamada e provedor mock (`MockEditorialAiProvider`).
- **Interface Administrativa:** Painel `/editorial` com banner regulatório CVM/ANBIMA permanente (`id="editorial-regulatory-disclaimer"`), histórico de revisões humanas e rastreabilidade total em `audit_logs`.

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
├── drizzle/                     # Migrações versionadas SQL (0000_rich_anita_blake.sql a 0023_add_editorial_workflow_tables.sql)
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
│   │   │   ├── dashboard/       # Dashboard contextual de carteira REAL (/dashboard)
│   │   │   ├── editorial/       # Gestão editorial interna, revisão humana e IA (/editorial)
│   │   │   ├── fiscal/          # Módulo fiscal e relatórios de IRPF (/fiscal)
│   │   │   ├── history/         # Extrato cronológico paginado com filtros avançados (carteira, custódia, tipo, ativo, datas)
│   │   │   ├── import/          # Listagem de lotes (/import) e central de revisão (/import/[id])
│   │   │   ├── options/         # Módulo operacional de opções, Black-Scholes e gregas (/options)
│   │   │   ├── plans/           # Página de planos, quotas e transparência comercial
│   │   │   ├── portfolios/      # Listagem (/portfolios), detalhes (/portfolios/[id]) e gestão de caixa (/portfolios/[id]/cash)
│   │   │   └── simulador/       # Simulador de juros compostos e projeções patrimoniais (/simulador)
│   │   ├── (public)/            # Catálogo público de ativos (/acoes, /fiis, /etfs, /bdrs, /ativos)
│   │   ├── terms-acceptance/    # Tela isolada de consentimentos pendentes LGPD
│   │   ├── layout.tsx           # Layout raiz com script anti-FOUC e ThemeProvider
│   │   └── globals.css          # Variáveis CSS semânticas e Tailwind inline theme
│   ├── lib/
│   │   ├── db/                  # Cliente PostgreSQL, contratos canônicos, auditoria e schemas (44 tabelas de aplicação + 1 técnica __drizzle_migrations)
│   │   └── theme/               # Provedor, hook useTheme, alternador e tokens semânticos
│   ├── middleware.ts            # Proteção de rotas no Edge
│   └── modules/
│       ├── identity/            # Módulo de autenticação, sessões, segurança e termos LGPD
│       ├── plans/               # Módulo de planos comerciais, entitlements, quotas e interface
│       ├── billing/             # Módulo de assinaturas comerciais, eventos de pagamento e gateways
│       ├── portfolio/           # Módulo de carteiras, ativos, motor de posições, valuation, caixa, custódia e gráficos
│       ├── corporate-actions/   # Módulo de ações corporativas (split, grupamento, bonificação, proventos e subscrições)
│       ├── market-data/         # Módulo de cotações, câmbio, adaptadores (Manual, Mock, BRAPI, COTAHIST, CVM) e valuation teórico
│       ├── catalog/             # Módulo do catálogo público de ativos, SEO e páginas por categoria
│       ├── imports/             # Módulo de importações revisáveis (parsers CSV, deduplicação, revisão e confirmação)
│       ├── projections/         # Módulo de simulação de juros compostos e projeções patrimoniais
│       ├── options/             # Módulo operacional de opções, Black-Scholes e gregas informativas
│       ├── tax/                 # Módulo fiscal dedicado e relatórios auxiliares de IRPF
│       └── editorial/           # Módulo editorial interno, máquina de estados, revisão humana mandatória e IA
├── tests/
│   ├── unit/                    # Testes unitários puros (Snapshot auditado em 2026-09-04: 104 arquivos, 1.223 testes)
│   ├── integration/             # Testes de integração com PostgreSQL (Snapshot auditado em 2026-09-04: 53 arquivos, 499 testes)
│   └── types/                   # Fixtures de tipagem estática (database-contracts.test-d.ts)
├── e2e/                         # Testes end-to-end com Playwright (Snapshot auditado em 2026-09-04: 13 arquivos, 172 testes em Chromium, Firefox e WebKit)
└── docs/                        # Documentação técnica, arquitetura, ADRs (001 a 012) e status de entrega
```

### Módulos de Domínio (12 Módulos Independentes)

A plataforma adota a convenção canônica de **12 módulos de domínio independentes**, correspondendo exatamente aos 12 subdiretórios presentes em `src/modules/`:

1. **`identity`**: Autenticação, sessões em banco com SHA-256, controle de força bruta com HMAC, termos e consentimentos LGPD.
2. **`plans`**: Catálogo comercial de planos, controle de quotas de carteiras ativas, entitlements funcionais e grupos compartilhados.
3. **`billing`**: Assinaturas comerciais, ciclo de vida contratual, idempotência de eventos de pagamento e adaptadores de gateway.
4. **`portfolio`**: Gestão de carteiras, ativos, motor de posições e custo médio em `Decimal`, contas de caixa, contas de custódia e gráficos.
5. **`corporate-actions`**: Desdobramentos, grupamentos, bonificações, proventos (dividendos e JCP) e ofertas/direitos de subscrição.
6. **`market-data`**: Cotações de mercado, taxas de câmbio, adaptadores (Manual, Mock, BRAPI, COTAHIST, CVM) e modelos de valuation teórico.
7. **`catalog`**: Catálogo canônico público de instrumentos financeiros (Ações, FIIs, ETFs, BDRs), páginas por categoria e SEO.
8. **`imports`**: Importações em lote (extratos CSV e B3), deduplicação inteligente em 2 níveis e revisão humana obrigatória.
9. **`projections`**: Simulador de aportes, acumulação patrimonial e juros compostos com desconto inflacionário em `Decimal`.
10. **`options`**: Cadastro de derivativos, modelo Black-Scholes em `Decimal`, cálculo de gregas informativas e calendário de vencimentos B3.
11. **`tax`**: Apuração auxiliar de IRPF, segregação de operações, compensação FIFO de prejuízos e relatórios anuais de Bens e Direitos.
12. **`editorial`**: Workflow editorial interno assistido por IA sanitizada, máquina de estados com segregação de funções e guardrails CVM/ANBIMA.

> **Distinção entre `plans` e `billing`:** Embora ambos componham a camada comercial (Fase 05), são mantidos como módulos físicos e conceituais separados. O módulo `plans` governa as regras de produto (planos, limites de carteiras e grupos de membros), enquanto o módulo `billing` governa o ciclo financeiro externo de cobrança (faturamento, eventos transacionais de pagamento e integração com gateways).

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
pnpm dev              # Iniciar servidor de desenvolvimento (Next.js)
pnpm build            # Compilar para produção (Next.js Turbopack)
pnpm start            # Iniciar servidor de produção

# Qualidade e Tipagem
pnpm typecheck        # Verificação de tipos TypeScript (inclui fixtures)
pnpm lint             # Executar linter (Biome)
pnpm lint:fix         # Corrigir problemas de lint automaticamente
pnpm format:fix       # Verificar e aplicar formatação

# Testes
pnpm test:unit        # Testes unitários (Vitest — snapshot auditado em 2026-09-04: 104 arquivos, 1.223 testes)
pnpm test:integration # Testes de integração com PostgreSQL (Vitest — snapshot auditado em 2026-09-04: 53 arquivos, 499 testes)
pnpm test:e2e         # Testes End-to-End no Chromium, Firefox e WebKit (Playwright — snapshot auditado em 2026-09-04: 13 arquivos, 172 testes)

# Banco de Dados e Migrações
# Inspecionar catálogo físico no banco de desenvolvimento/produção (44 tabelas de aplicação + 1 tabela técnica __drizzle_migrations)
pnpm db:verify
# Inspecionar catálogo físico no banco de testes automatizados (44 tabelas de aplicação + 1 tabela técnica __drizzle_migrations)
pnpm db:verify -- --test
# Executar migrações pendentes no banco principal (PowerShell no Windows)
$env:ALLOW_DATABASE_MUTATION="true"; pnpm db:migrate
# Executar migrações pendentes no banco principal (Bash no Linux/macOS)
ALLOW_DATABASE_MUTATION=true pnpm db:migrate
# Executar migrações no banco de testes
pnpm db:migrate -- --test
# Popular ativos de teste no ambiente de desenvolvimento
pnpm db:seed:dev

# Dados de Mercado
pnpm market:ingest    # Executar script administrativo de ingestão de dados de mercado (BRAPI / Manual)
```

---

## Capacidades Planejadas (Não Implementadas)

As seguintes funcionalidades representam direcionamentos no roadmap e permanecem como capacidades planejadas para expansões futuras:

1. **Fase 05 (Expansão) — Pagamentos Reais e Grupos Compartilhados:** Gateways de pagamento reais (Stripe/Asaas), webhooks ativos e cobrança compartilhada de grupos (ADR-004).
2. **Fase 07 (Expansão) — Importações Avançadas:** Upload de planilhas binárias `.xlsx`, extratos bancários/corretora (OFX) e extração assistida de notas de corretagem em PDF com bucket privado e URLs temporárias assinadas.
3. **Fase 08 (Expansão) — Conexão Direta a Exchanges e Custódia On-Chain:** Integração via API de leitura com corretoras e exchanges cripto, além de rastreamento de carteiras on-chain públicas.
4. **Automação Contínua da Ingestão de Mercado:** Rotinas agendadas em background (cron jobs / workers) para execução periódica pós-fechamento B3/CVM e streaming de cotações via WebSocket.
5. **Screening de Ativos e Métricas Customizadas:** Filtros avançados de mercado e fórmulas parametrizadas por usuário, mantendo neutralidade analítica sem recomendação de investimentos.
