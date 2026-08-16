# Estado Atual do Projeto

## Última atualização

2026-08-16

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais, motor de posições, dashboard consolidado, extrato global de operações e o suporte a eventos corporativos de Split e Grupamento encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:** Concluída e Publicada (Pacotes 03.00-E, 03.01-D, 03.02, 03.03 e 03.04 — Gestão de carteiras, ativos globais e customizados, lançamentos manuais, motor de custo médio ponderado, validação temporal de vendas, apuração de PnL realizado, dashboard global consolidado e extrato de histórico paginado com filtros avançados).
- **Fase 04 — Eventos Corporativos:**
  - **Pacote 04.01 — Split e Grupamento de Ativos:** **PRONTO PARA HOMOLOGAÇÃO** (Processamento determinístico, auditável e idempotente de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`), preservação rigorosa do custo total de aquisição invariante, identificação e preservação de frações residuais em `Decimal`, validação temporal retroativa, persistência compatível com schema existente sem migrations e integração total à interface, extrato `/history`, feed recente e detalhamento de ativo).

---

## Componentes Implementados no Pacote 04.01

1. **Tipos e Contratos de Domínio (`portfolio-event.schema.ts` e `portfolio-event.types.ts`):**
   - Inclusão dos tipos `SPLIT` e `GROUPING` na união canônica `PORTFOLIO_EVENT_TYPES` e `PortfolioEventType`;
   - Schema Zod `createCorporateActionEventSchema` com validação de `portfolioId`, `assetId`, `type` (`SPLIT` | `GROUPING`), `tradeDate` (ISO estrito com timezone), `factor` (positivo, não nulo e validado como Decimal) e `notes`;
   - Flag de domínio `hasFractionalShares: boolean` em `AssetPosition` e `SerializedAssetPosition`.

2. **Motor de Domínio Puro (`position-engine.ts`):**
   - Tratamento de `SPLIT`: multiplicação de quantidade ($Q \times F$) e divisão proporcional de custo médio ($P \div F$), com invariância estrita do custo total investido ($Q \times P$ constante);
   - Tratamento de `GROUPING`: divisão de quantidade ($Q \div F$) e multiplicação proporcional de custo médio ($P \times F$), com invariância do custo total;
   - Detecção e preservação exata de frações residuais sem arredondamento forçado e sem conversão compulsória em dinheiro;
   - Validação temporal em `validateTimelineConsistency`: rejeição de splits/grupamentos em datas com posição nula ou negativa, e reprocessamento cronológico correto de vendas posteriores.

3. **Consultas e Serviços no Servidor (`portfolio-event.service.ts` e `portfolio.actions.ts`):**
   - Função `createCorporateActionEvent`: criação transacional com lock pessimista (`FOR UPDATE`), validação de ownership, persistência na tabela física `portfolio_events` (com `quantity` contendo o fator, `unitPrice = 0`, `fees = 0` e `source = 'corporate_action'`) e gravação em `audit_logs`;
   - Server Action `createCorporateActionEventAction` com revalidação automática de rotas.

4. **Componentes de Interface e SSR (`src/modules/portfolio/ui/` e `/history`):**
   - **`AssetPositionDetailModal`:** Formulário recolhível para lançamento de split e grupamento, feedback visual de sucesso/erro e badge informativo de fração residual (`⚠️ Fração Residual`);
   - **`PositionTable`:** Identificação e badge de frações residuais na coluna de quantidade;
   - **`HistoryFilterBar`:** Opções de filtro por `SPLIT` (🔀 Desdobramento) e `GROUPING` (🔄 Grupamento);
   - **Página `/history`:** Badges visuais dedicados, formatação da coluna "Quantidade / Fator" (ex: `Fator 1:X` ou `Fator X:1`) e omissão de preço/taxas para eventos corporativos;
   - **`RecentActivityFeed`:** Renderização de badges e fatores no dashboard.

---

## O que Permanece Explicitamente Fora do Escopo do Pacote 04.01

- **Bonificação em Ações:** Pertence ao Pacote 04.02.
- **Proventos em Dinheiro:** Dividendos e Juros sobre Capital Próprio (JCP) pertencem ao Pacote 04.02.
- **Eventos Societários Complexos:** Subscrição, cisão, incorporação e troca de ticker.
- **Ingestão Automática de Provedores Externos:** Pertence à Fase 06.
- **Leilão de Frações da B3:** Venda compulsória em leilão não é realizada automaticamente.
- **Alterações de Schema de Banco de Dados:** Nenhuma migração ou alteração DDL (mantido o schema físico canônico de 9 tabelas).

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (23 arquivos, 281 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (15 arquivos, 126 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 12 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional e Auditoria:** Comprovados fisicamente no PostgreSQL.
- [x] **Isolamento Multiusuário e Anti-IDOR:** 100% validado no servidor e em testes E2E.

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
