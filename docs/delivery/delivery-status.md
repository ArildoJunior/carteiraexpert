# Estado Atual do Projeto

## Última atualização

2026-08-15

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais, motor de posições, o dashboard geral consolidado e o extrato global de operações com filtros avançados encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais e customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação entre coordenadores e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture estática de contratos).
  - **Pacote 03.01-D — Carteiras, Ativos e Operações Manuais:** **ACEITO** (Server Actions autenticadas, interface de usuário responsiva e acessível, rotas `/portfolios` e `/portfolios/[id]`, autocomplete debounced de ativos, cadastro de ativos customizados, lançamento manual de compras e vendas, cancelamento auditado com justificativa obrigatória e seed de desenvolvimento protegido).
  - **Pacote 03.02 — Motor de Posição, Custo Médio e Validação Temporal de Vendas:** **ACEITO** (Cálculo determinístico de posição e quantidade em custódia, custo médio ponderado por ativo incluindo taxas, custo total investido, resultado realizado por venda com dedução de taxas, rejeição atômica de vendas a descoberto, validação de consistência da linha do tempo para eventos retroativos e cancelamentos, proteção de concorrência com bloqueio pessimista `FOR UPDATE`, interface com blocos verticais e suíte completa de testes aprovada).
  - **Pacote 03.03 — Histórico e Dashboard Básico:** **ACEITO** (Consolidação global patrimonial no servidor SSR em `/dashboard`, segregação estrita por moeda base sem conversão fictícia, agregação de custo total investido em posições ativas, PnL realizado acumulado de vendas, taxas totais, contagem de ativos em custódia e carteiras ativas, feed unificado e cronológico de atividades recentes com nomes de carteiras e ativos, proteção estrita anti-IDOR e exclusão de soft deletes).
  - **Pacote 03.04 — Extrato Global de Operações, Filtros Avançados e Detalhamento de Histórico por Ativo:** **PRONTO PARA HOMOLOGAÇÃO** (Página SSR em `/history`, filtros combinados de carteira, tipo de operação, ticker e período, paginação controlada no servidor, visualização de notas de operações, modal de detalhamento de ativo na tabela de posições `AssetPositionDetailModal` e navegação integrada).

---

## Componentes Implementados no Pacote 03.04

1. **Tipos e Contratos de Domínio (`dashboard.types.ts` e `dashboard.schema.ts`):**
   - Schema Zod `listUserHistorySchema` com validação de `portfolioId`, `type`, `ticker` (transformação maiúscula e trim), `startDate`, `endDate`, `page` e `limit`;
   - Tipos de domínio `UserHistoryPaginatedResult` e versão serializada `SerializedUserHistoryPaginatedResult`.

2. **Motor de Domínio Puro e Serialização (`position-engine.ts`):**
   - Função pura `serializeUserHistoryPaginatedResult` para conversão de Decimals e datas em strings seguras para SSR e UI.

3. **Consultas e Serviços no Servidor (`portfolio-event.service.ts` e `dashboard.service.ts`):**
   - Função `listUserHistoryEvents`: consulta transacional paginada com contagem total (`count()`) e busca paginada com `limit` e `offset`, aplicando filtros combinados e respeitando exclusão lógica de carteiras e eventos cancelados;
   - Funções `getUserHistoryData` e `getSerializedUserHistoryData`;
   - Server Action `getUserHistoryAction` e revalidação de rotas `/dashboard`, `/history` e `/portfolios/[id]`.

4. **Componentes de Interface e SSR (`src/modules/portfolio/ui/` e `/history`):**
   - **`HistoryFilterBar`:** Formulário com filtros de Carteira, Tipo de Operação (Compra/Venda), Ticker, Data Inicial e Final, e botão para limpar filtros;
   - **`AssetPositionDetailModal`:** Modal responsivo e acessível para detalhamento do ativo com quantidade, custo médio com taxas, total investido, PnL realizado e histórico discriminado de cada venda realizada;
   - **`PositionTable`:** Integração de botões "Ver Trades" para abertura do `AssetPositionDetailModal` em posições ativas e encerradas;
   - **`RecentActivityFeed`:** Link "Ver extrato completo →" direcionando para `/history`;
   - **Página `/history`:** Server Component dinâmico com tabela paginada de operações, badges de tipo, exibição de notas, totalizadores e controles de paginação que preservam os parâmetros de busca;
   - **Layout (`/layout.tsx`):** Link de navegação "Histórico" na barra de menu superior.

---

## O que Permanece Explicitamente Fora do Escopo do Pacote 03.04

- **Conversão Cambial Fictícia:** Nenhuma conversão monetária é realizada (moedas são estritamente segregadas por grupo).
- **Saldo Financeiro de Caixa:** Depósitos, retiradas, liquidação financeira em conta corrente e saldo monetário da carteira.
- **Marcação a Mercado e Rentabilidade Não Realizada:** Cotações de mercado em tempo real e variação patrimonial não realizada (pertencem à Fase 04).
- **Eventos Corporativos:** Splits, grupamentos, bonificações, dividendos e JCP.
- **Alterações de Schema de Banco de Dados:** Nenhuma migração ou alteração de schema (mantido o schema físico canônico de 9 tabelas).

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (22 arquivos, 267 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (14 arquivos, 122 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 12 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional e Auditoria:** Comprovados fisicamente no PostgreSQL.
- [x] **Isolamento Multiusuário e Anti-IDOR no Extrato:** 100% validado no servidor e em testes E2E.

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
