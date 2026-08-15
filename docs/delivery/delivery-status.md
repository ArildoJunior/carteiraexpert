# Estado Atual do Projeto

## Última atualização

2026-08-15

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança e a camada de entrega manual de carteiras, ativos e eventos patrimoniais foram concluídas e testadas com sucesso:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais e customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação entre coordenadores e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture estática de contratos).
  - **Pacote 03.01-D — Carteiras, Ativos e Operações Manuais:** **ACEITO** (Server Actions autenticadas, interface de usuário responsiva e acessível, rotas `/portfolios` e `/portfolios/[id]`, autocomplete debounced de ativos, cadastro de ativos customizados, lançamento manual de compras e vendas, cancelamento auditado com justificativa obrigatória e seed de desenvolvimento protegido).
  - **Pacote 03.02 — Motor de Posição, Custo Médio e Saldo:** **BLOQUEADO** (Aguardando planejamento formal e autorização de execução).

---

## Componentes Entregues no Pacote 03.01-D

1. **Server Actions de Portfólio (`portfolio.actions.ts`):**
   - Ações tipadas e autenticadas via `requireAuth()`: `createPortfolioAction`, `updatePortfolioAction`, `deletePortfolioAction`, `searchAssetsAction`, `createCustomAssetAction`, `createPortfolioEventAction` e `cancelPortfolioEventAction`;
   - Mapeamento uniforme de erros de domínio para `ActionResult<T>` serializável;
   - Suporte a `safeRevalidatePath` para integridade em execução de testes fora do ciclo HTTP tradicional do Next.js.
2. **Interface do Usuário e Modais (`src/modules/portfolio/ui/`):**
   - **`PortfolioModal`:** Criação e edição de carteira com validação em tempo real;
   - **`CustomAssetModal`:** Cadastro desacoplado de ativos customizados por usuário;
   - **`AssetSearchSelect`:** Autocomplete com busca debounced no servidor, feedback de carregamento em tempo real (`#asset-search-loading` com ARIA), controle de concorrência (`requestIdRef`) e atalho para criação de ativo customizado;
   - **`TransactionModal`:** Lançamento manual de ordens de compra (`BUY`) e venda (`SELL`) com seleção de tipo, datas (`tradeDate`/`settlementDate`), quantidade, preço unitário, taxas e notas;
   - **`CancelEventModal`:** Cancelamento de operação com justificativa obrigatória (mínimo de 5 caracteres) e aviso de integridade histórica;
   - **`PortfolioEventTable`:** Extrato cronológico das movimentações ativas com badges visuais de tipo e ação de cancelamento;
   - **`PortfolioHeader`:** Cabeçalho da carteira com métricas e ações de edição/exclusão lógica;
   - **`PortfolioList`:** Grid responsivo de carteiras com empty state e gatilho de criação;
   - **`PortfolioDetailView`:** Coordenador cliente integrando tabela, cabeçalho e modais.
3. **Páginas e Rotas do Next.js App Router:**
   - `/portfolios`: Listagem de carteiras do usuário autenticado;
   - `/portfolios/[id]`: Visão detalhada da carteira, extrato de eventos e ações de lançamento;
   - `/dashboard`: Atualizado com contadores reais de carteiras ativas, atalhos rápidos e listagem recente;
   - Layout de navegação (`/dashboard/layout.tsx`): Atualizado com links diretos "Dashboard" e "Carteiras".
4. **Seed de Desenvolvimento Protegido (`scripts/seed-dev.ts`):**
   - Script determinístico para popular ativos globais de teste (PETR4, VALE3, ITUB4, BBDC4, KNIP11, IVVB11, BTC);
   - Proteção estrita com trava `ALLOW_DEV_SEED=true` e bloqueio incondicional em ambiente de produção (`NODE_ENV === 'production'`);
   - Disponibilizado via comando `pnpm run db:seed:dev`.

---

## O que Ficou Explicitamente Fora do Escopo do Pacote 03.01-D

- **Motor de Posição, Custo Médio e Saldo:** Validação de consistência temporal de vendas, consolidação patrimonial, rentabilidade e cálculo de custo médio (escopo reservado ao **Pacote 03.02**).
- **Provedores Externos de Mercado:** Integração com APIs externas (BRAPI, HG Brasil, B3, CVM) ou cotações em tempo real.
- **Alterações de Banco de Dados:** Nenhuma alteração estrutural, migration ou nova tabela (mantido o schema canônico de 9 tabelas).

---

## Validações Comprovadas no Ambiente

Todas as validações abaixo foram executadas e aprovadas com 100% de sucesso no ambiente real:

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (18 arquivos, 235 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (11 arquivos, 105 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 11 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional e Auditoria:** Comprovados fisicamente no PostgreSQL.
- [x] **Cobertura Original de Consentimento:** Totalmente preservada (anonimização de IP, motivo de auditoria, vigência e idempotência).

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

---

## Próxima Etapa

- **Pacote 03.02 — Motor de Posição, Custo Médio e Saldo:** BLOQUEADO (Aguardando planejamento técnico formal e autorização para execução).
