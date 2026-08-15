# Estado Atual do Projeto

## Última atualização

2026-08-15

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais, motor de posições e o dashboard geral consolidado com histórico encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais e customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação entre coordenadores e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture estática de contratos).
  - **Pacote 03.01-D — Carteiras, Ativos e Operações Manuais:** **ACEITO** (Server Actions autenticadas, interface de usuário responsiva e acessível, rotas `/portfolios` e `/portfolios/[id]`, autocomplete debounced de ativos, cadastro de ativos customizados, lançamento manual de compras e vendas, cancelamento auditado com justificativa obrigatória e seed de desenvolvimento protegido).
  - **Pacote 03.02 — Motor de Posição, Custo Médio e Validação Temporal de Vendas:** **ACEITO** (Cálculo determinístico de posição e quantidade em custódia, custo médio ponderado por ativo incluindo taxas, custo total investido, resultado realizado por venda com dedução de taxas, rejeição atômica de vendas a descoberto, validação de consistência da linha do tempo para eventos retroativos e cancelamentos, proteção de concorrência com bloqueio pessimista `FOR UPDATE`, interface com blocos verticais e suíte completa de testes aprovada).
  - **Pacote 03.03 — Histórico e Dashboard Básico:** **PRONTO PARA HOMOLOGAÇÃO** (Consolidação global patrimonial no servidor SSR em `/dashboard`, segregação estrita por moeda base sem conversão fictícia, agregação de custo total investido em posições ativas, PnL realizado acumulado de vendas, taxas totais, contagem de ativos em custódia e carteiras ativas, feed unificado e cronológico de atividades recentes com nomes de carteiras e ativos, proteção estrita anti-IDOR e exclusão de soft deletes).

---

## Componentes Implementados no Pacote 03.03

1. **Tipos e Contratos de Domínio (`dashboard.types.ts` e `dashboard.schema.ts`):**
   - Definição de `CurrencyGroupSummary` (moeda, custo investido, taxas, PnL realizado, contagem de ativos e carteiras);
   - Definição de `UserRecentEventItem` e `UserDashboardSummary`;
   - Definição das versões serializadas (`SerializedCurrencyGroupSummary`, `SerializedUserRecentEventItem`, `SerializedUserDashboardData`);
   - Schema Zod `listUserRecentEventsSchema` para validação de paginação e filtros de operações recentes.

2. **Motor de Domínio Puro de Consolidação (`position-engine.ts`):**
   - Função pura `calculateUserDashboardSummary`: agrupa sumários por moeda base, soma com `Decimal.plus()` os custos investidos das posições ativas ($Q > 0$), PnL realizado e taxas acumuladas, calcula totais globais e ordena moedas com BRL em prioridade;
   - Serializadores determinísticos `serializeCurrencyGroupSummary`, `serializeUserRecentEvent` e `serializeUserDashboardData`.

3. **Consultas e Serviços no Servidor (`portfolio-event.service.ts` e `dashboard.service.ts`):**
   - Função `listUserRecentEvents`: consulta transacional otimizada com INNER JOIN entre `portfolio_events`, `portfolios` e `assets`, filtrando estritamente por `portfolios.userId = user.id`, `portfolios.deletedAt IS NULL` e `portfolio_events.deletedAt IS NULL`, ordenada por `tradeDate DESC, createdAt DESC`;
   - Função `getUserDashboardData` e `getSerializedUserDashboardData`: orquestra a busca das carteiras do usuário, recupera posições consolidadas por carteira e gera o relatório completo de dashboard em SSR;
   - Server Action `getUserDashboardAction` e revalidação de rota `/dashboard` em todas as mutações patrimoniais.

4. **Componentes de Interface e SSR (`/dashboard` e `src/modules/portfolio/ui/`):**
   - **`DashboardMetricsCards`:** Cards visuais de métricas consolidadas (Total em Custódia, Resultado Realizado PnL com destaque positivo/negativo, Taxas Acumuladas, Ativos em Carteira e Carteiras Ativas) com seletor interativo de moedas base quando houver mais de uma moeda;
   - **`RecentActivityFeed`:** Tabela elegante com as últimas operações manuais ativas realizadas entre todas as carteiras, com badges de tipo, links diretos para as carteiras, identificação dos ativos e valores formatados com segurança sem ponto flutuante;
   - **Página `/dashboard`:** Transformada em Server Component (SSR) dinâmico, exibindo boas-vindas, cards consolidados, grade de carteiras ativas com saldos e o feed recente.

---

## O que Permanece Explicitamente Fora do Escopo do Pacote 03.03

- **Conversão Cambial Fictícia:** Nenhuma conversão monetária é realizada (moedas são estritamente segregadas por grupo).
- **Saldo Financeiro de Caixa:** Depósitos, retiradas, liquidação financeira em conta corrente e saldo monetário da carteira.
- **Marcação a Mercado e Rentabilidade Não Realizada:** Cotações de mercado em tempo real e variação patrimonial não realizada (pertencem à Fase 04).
- **Eventos Corporativos:** Splits, grupamentos, bonificações, dividendos e JCP.
- **Alterações de Schema de Banco de Dados:** Nenhuma migração ou alteração de schema (mantido o schema físico canônico de 9 tabelas).

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (21 arquivos, 259 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (13 arquivos, 117 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 11 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional e Auditoria:** Comprovados fisicamente no PostgreSQL.
- [x] **Isolamento Multiusuário e Anti-IDOR no Dashboard:** 100% validado no servidor e em testes E2E.

### Tabelas Físicas Validadas no Catálogo PostgreSQL (9 tabelas):
1. `audit_logs`
2. `users`
3. `sessions`
4. `password_reset_tokens`
5. `auth_rate_limits`
6. `user_consents`
7. `portfolios`
8. `assets`
9. `portfolio_events`
