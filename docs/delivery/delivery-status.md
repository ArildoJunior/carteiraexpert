# Estado Atual do Projeto

## Última atualização

2026-08-15

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, a camada de entrega manual de carteiras e a implementação do motor de posições, custo médio e resultado realizado encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais e customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação entre coordenadores e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture estática de contratos).
  - **Pacote 03.01-D — Carteiras, Ativos e Operações Manuais:** **ACEITO** (Server Actions autenticadas, interface de usuário responsiva e acessível, rotas `/portfolios` e `/portfolios/[id]`, autocomplete debounced de ativos, cadastro de ativos customizados, lançamento manual de compras e vendas, cancelamento auditado com justificativa obrigatória e seed de desenvolvimento protegido).
  - **Pacote 03.02 — Motor de Posição, Custo Médio e Validação Temporal de Vendas:** **PRONTO PARA HOMOLOGAÇÃO** (Cálculo determinístico de posição e quantidade em custódia, custo médio ponderado por ativo incluindo taxas, custo total investido, resultado realizado por venda com dedução de taxas, rejeição atômica de vendas a descoberto, validação de consistência da linha do tempo para eventos retroativos e cancelamentos, proteção de concorrência com bloqueio pessimista `FOR UPDATE`, interface com blocos verticais e suíte completa de testes aprovada).

---

## Componentes Implementados no Pacote 03.02

1. **Motor Puro de Domínio (`position-engine.ts`):**
   - Ordenação determinística de eventos: `tradeDate ASC`, `createdAt ASC`, `id ASC`;
   - Cálculo de posição por ativo (`calculateAssetPosition`): acumulação de compras com taxas, custo médio ponderado unitário, abate proporcional em vendas com manutenção de custo médio, zeragem de custo total em caso de liquidação total e apuração de PnL realizado por venda ($NetProceeds - CostBasis$);
   - Validação de consistência temporal (`validateTimelineConsistency`): projeta a linha do tempo completa ao inserir evento prospectivo ou omitir evento cancelado, disparando `InsufficientPositionError` ou `RetroactiveInconsistencyError` caso a posição fique negativa em qualquer ponto cronológico;
   - Agregação consolidada de carteira (`calculatePortfolioPositionsSummary`): consolidação de posições ativas ($Q > 0$), posições encerradas ($Q = 0$ com histórico), custo total investido, taxas acumuladas e PnL realizado global;
   - Serialização determinística de valores para `string` nas camadas externas.

2. **Serviço de Posições (`position.service.ts`):**
   - `getPortfolioPositions` e `getAssetPositionInPortfolio` com isolamento multiusuário e validação de titularidade da carteira;
   - `getSerializedPortfolioPositions` e `getSerializedAssetPositionInPortfolio` para consumo direto em Server Actions e Server Components (SSR).

3. **Validação Temporal Integrada a Eventos (`portfolio-event.service.ts`):**
   - Lock pessimista na carteira (`tx.select().from(portfolios)...for('update')`) em `createPortfolioEventInTransaction` e `cancelPortfolioEventInTransaction` para serializar operações concorrentes;
   - Rejeição atômica e rollback de vendas com quantidade superior à posição disponível na data;
   - Rejeição de cancelamento de compras que tenham servido de lastro para vendas posteriores;
   - Suporte completo a compras e vendas retroativas que respeitem a consistência temporal.

4. **Server Actions de Posição (`portfolio.actions.ts`):**
   - `getPortfolioPositionsAction`: Retorna resumo consolidado de posições e PnL da carteira;
   - `getAssetPositionAction`: Retorna posição detalhada e histórico de trades de um ativo;
   - Tratamento de `InsufficientPositionError` e `RetroactiveInconsistencyError` com mensagens de erro amigáveis para a interface.

5. **Interface do Usuário e Visualização (`src/modules/portfolio/ui/`):**
   - **`PositionTable`:** Cards de métricas financeiras (Total em Custódia, Resultado Realizado PnL, Taxas Acumuladas, Ativos em Carteira), tabela detalhada de posições ativas em custódia (Ticker, Nome, Quantidade, Custo Médio, Total Investido, Taxas Totais, PnL Realizado) e seção retrátil de posições encerradas, com formatação e checagens 100% em `Decimal`;
   - **`PortfolioDetailView`:** Renderização estruturada em blocos verticais na mesma página (Cabeçalho da Carteira, Posições Consolidadas e Extrato de Operações);
   - **`TransactionModal`:** Indicação em tempo real de posição disponível em custódia ao selecionar operação de VENDA (`SELL`), com validação puramente decimal;
   - **Página `/portfolios/[id]`:** Carregamento de posições no SSR via Server Component com suporte a renderização rápida.

---

## O que Permanece Explicitamente Fora do Escopo do Pacote 03.02

- **Saldo Financeiro de Caixa:** Depósitos, retiradas, liquidação financeira em conta corrente e saldo monetário da carteira.
- **Marcação a Mercado e Rentabilidade Não Realizada:** Integração com cotações de mercado em tempo real, variação patrimonial não realizada e gráficos de rentabilidade histórica.
- **Provedores Externos:** Integração com APIs externas de mercado (BRAPI, HG Brasil, B3, CVM).
- **Eventos Corporativos:** Splits, grupamentos, bonificações, dividendos e JCP.
- **Alterações de Schema de Banco de Dados:** Nenhuma migração ou alteração de schema (mantido o schema físico canônico de 9 tabelas).

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (19 arquivos, 249 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (12 arquivos, 112 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 11 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional e Auditoria:** Comprovados fisicamente no PostgreSQL.
- [x] **Validação Temporal de Vendas:** Testada e comprovada em testes unitários, de integração e E2E.
- [x] **Isolamento Multiusuário e IDOR:** 100% validado no servidor.

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
