# Estado Atual do Projeto

## Última atualização

2026-08-16

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais, motor de posições, dashboard consolidado, extrato global de operações e o suporte a eventos corporativos de Split, Grupamento, Bonificação, Dividendos e Juros sobre Capital Próprio (JCP) encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:** Concluída e Publicada (Pacotes 03.00-E, 03.01-D, 03.02, 03.03 e 03.04 — Gestão de carteiras, ativos globais e customizados, lançamentos manuais, motor de custo médio ponderado, validação temporal de vendas, apuração de PnL realizado, dashboard global consolidado e extrato de histórico paginado com filtros avançados).
- **Fase 04 — Eventos Corporativos:**
  - **Pacote 04.01 — Split e Grupamento de Ativos:** **IMPLEMENTADO E HOMOLOGADO COM SUCESSO (`PASS`)** (Processamento determinístico, auditável e idempotente de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`), preservação rigorosa do custo total de aquisição invariante, identificação e preservação de frações residuais em `Decimal`, validação temporal retroativa, persistência compatível com schema existente sem migrations e integração total à interface, extrato `/history`, feed recente e detalhamento de ativo).
  - **Pacote 04.02 — Bonificação, Dividendos e JCP:** **IMPLEMENTADO E HOMOLOGADO COM SUCESSO (`PASS`)** (Processamento determinístico de bonificação de ações (`BONUS_SHARE`) com custo atribuído opcional e recálculo de custo médio, recebimento de proventos em dinheiro — dividendos isentos (`DIVIDEND`) e Juros sobre Capital Próprio (`JCP`) com apuração líquida e retenção de IRRF —, exigência mandatória de Data de Pagamento (`settlementDate`), validação de elegibilidade de custódia na Data-Com (`tradeDate`), totalização acumulada de proventos em `totalIncomeReceived`, preservação estrita de quantidade e custo em proventos, consolidação no dashboard e extrato multicarteiras, e correção de compatibilidade/foco e empilhamento de modais no Firefox).
- **Próximo Pacote:** **Pacote 04.03 — Subscrição e Eventos Societários**.

---

## Homologação Funcional do Pacote 04.02 (Veredicto: `PASS`)

A homologação funcional foi executada pela interface real da aplicação em ambiente local utilizando o runner Playwright Chromium e Firefox, exercitando todos os fluxos de usuário, atualizações visuais e probes de segurança:

### Fluxos Validados com Sucesso:
1. **Compra Inicial:** Cadastro de ativo customizado e compra de 100 unidades @ R$ 20,00 (Total investido: R$ 2.000,00).
2. **Bonificação de Ações (`BONUS_SHARE`):** Lançamento de bonificação de 10 ações com custo unitário atribuído de R$ 5,00, recalculando a posição para 110 unidades @ R$ 18,64 (R$ 18,63636364) e elevando o custo total para R$ 2.050,00.
3. **Dividendos em Dinheiro (`DIVIDEND`):** Registro de dividendo de R$ 1,50/ação sobre 110 ações elegíveis com Data de Pagamento preenchida, creditando R$ 165,00 em proventos e mantendo estritamente inalteradas a quantidade (110) e o custo total (R$ 2.050,00).
4. **Juros sobre Capital Próprio (`JCP`):** Registro de JCP bruto de R$ 0,80/ação sobre 110 ações (R$ 88,00 bruto) com desconto de IRRF de R$ 13,20 (15%), creditando rendimento líquido de R$ 74,80 e totalizando R$ 239,80 em proventos acumulados.
5. **Dashboard Consolidado (`/dashboard`):** Exibição em tempo real do card de métrica "Proventos Recebidos" consolidando R$ 239,80 em BRL.
6. **Extrato Cronológico Geral (`/history`):** Exibição correta dos badges `🎁 Bonificação`, `💵 Dividendo` e `🏛️ JCP`, com indicação de valor bruto por ação, quantidade elegível e discriminação de IRRF retido.
7. **Filtros Avançados:** Filtros específicos de extrato para isolar bonificações, dividendos e JCP funcionando com precisão.

### Probes Negativos e Segurança Validados:
1. **Data Inexistente/Sem Custódia:** Rejeitado no servidor com mensagem de domínio quando tentado provento em data anterior à compra ou com saldo zero.
2. **Quantidade Elegível Excessiva:** Rejeitado no servidor (*"Posição insuficiente para recebimento de dividendo. Posição disponível: 110, Elegível: 200."*).
3. **IRRF Superior ao Valor Bruto:** Rejeitado preventivamente no schema Zod (*"O IRRF retido não pode exceder o valor total bruto do JCP."*).
4. **Data de Pagamento Ausente:** Rejeitado pelo schema com obrigatoriedade de `settlementDate` para dividendos e JCP.
5. **Isolamento Multiusuário (Anti-IDOR):** Bloqueio de visualização e edição de eventos corporativos e proventos entre contas distintas.

### Evidências Visuais da Homologação:
- `0402_1_posicao_apos_compra.png`: Posição inicial de 100 ações @ R$ 20,00 (Total: R$ 2.000,00).
- `0402_2_posicao_apos_bonificacao.png`: Posição pós-Bonificação de 10 ações @ R$ 5,00 (110 ações @ R$ 18,64, Custo total: R$ 2.050,00).
- `0402_3_posicao_apos_proventos.png`: Posição pós-Dividendo (R$ 165,00) e pós-JCP (R$ 74,80 líquido), exibindo R$ 239,80 em proventos recebidos.
- `0402_4_historico_proventos_bonificacao.png`: Extrato geral `/history` exibindo todos os eventos com badges, datas de liquidação e valores.
- `0402_5_filtro_bonificacao.png`: Extrato filtrado por Bonificação.
- `0402_6_filtro_dividendos.png`: Extrato filtrado por Dividendos.
- `0402_7_filtro_jcp.png`: Extrato filtrado por JCP.
- `0402_8_dashboard_proventos.png`: Card de "Proventos Recebidos" no dashboard consolidado.
- `0402_9_probe_data_invalida.png`: Rejeição de lançamento em data anterior à compra (posição zero).
- `0402_10_probe_quantidade_excessiva.png`: Rejeição de provento para quantidade superior à custódia disponível na Data-Com.
- `0402_11_probe_irrf_excessivo.png`: Rejeição no formulário para IRRF maior que o valor bruto do JCP.

---

## Componentes Implementados no Pacote 04.02

1. **Tipos e Contratos de Domínio (`portfolio-event.schema.ts`, `portfolio-event.types.ts`, `position.types.ts`, `dashboard.types.ts`):**
   - Inclusão dos tipos `BONUS_SHARE`, `DIVIDEND` e `JCP` na união canônica `PORTFOLIO_EVENT_TYPES` e `CORPORATE_ACTION_TYPES`;
   - Schemas Zod `createBonusEventSchema` e `createIncomeEventSchema` com validação de `portfolioId`, `assetId`, `tradeDate` (Data-Com), `settlementDate` (Data de Pagamento obrigatória para proventos), `quantity`, `unitPrice` e `fees` (IRRF);
   - Campo de domínio `totalIncomeReceived: Decimal` integrado a `AssetPosition`, `PortfolioPositionsSummary` e `CurrencyGroupSummary`.

2. **Motor de Domínio Puro (`position-engine.ts`):**
   - Tratamento de `BONUS_SHARE`: soma de quantidade ($Q_{nova} = Q_{anterior} + Q_{bonus}$), incorporação de custo total ($Custo_{novo} = Custo_{anterior} + (Q_{bonus} \times Custo_{atribuido})$) e recálculo de custo médio ($CM = Custo_{novo} \div Q_{nova}$);
   - Tratamento de `DIVIDEND`: crédito de $Q_{elegivel} \times ValorPorAcao$ em `totalIncomeReceived`, preservando quantidade e custo;
   - Tratamento de `JCP`: crédito líquido $(Q_{elegivel} \times ValorPorAcao) - IRRF$ em `totalIncomeReceived`, com IRRF em `totalFees`/`fees`;
   - Validação temporal em `validateTimelineConsistency`: exigência de custódia positiva na Data-Com e $Q_{elegivel} \le Q_{disponivel}$.

3. **Consultas e Serviços no Servidor (`portfolio-event.service.ts` e `portfolio.actions.ts`):**
   - Funções `createBonusEvent` e `createIncomeEvent` com transação atômica, lock pessimista (`FOR UPDATE`), validação de ownership e registro imutável em `audit_logs`;
   - Server Actions `createBonusEventAction` e `createIncomeEventAction` com revalidação automática de rotas (`/dashboard`, `/history`, `/portfolios/[id]`).

4. **Componentes de Interface e SSR (`src/modules/portfolio/ui/` e `/history`):**
   - **`AssetPositionDetailModal`:** Abas para lançamento de Bonificação de Ações e Proventos em Dinheiro (Dividendo/JCP), cálculo em tempo real de proventos brutos, IRRF e valor líquido, e estimativa de novo custo médio;
   - **`PositionTable`:** Card métrico de "Proventos Recebidos" e coluna dedicada na listagem de posições ativas e encerradas;
   - **`DashboardMetricsCards`:** Card consolidado de "Proventos Recebidos" segregado por moeda;
   - **`HistoryFilterBar` e `/history`:** Badges dedicados (`🎁 Bonificação`, `💵 Dividendo`, `🏛️ JCP`), formatação de ações elegíveis e discriminação de IRRF;
   - **`RecentActivityFeed`:** Renderização de proventos e bonificações no dashboard;
   - **Compatibilidade Cross-Browser (`AssetSearchSelect` e `CustomAssetModal`):** Prevenção de perda de foco prematura em eventos `mousedown` e z-index `z-[60]` para empilhamento estrito de modais no Firefox e WebKit.

---

## O que Permanece Explicitamente Fora do Escopo do Pacote 04.02

- **Eventos Societários Complexos:** Subscrição, cisão, incorporação e troca de ticker (previstos para o Pacote 04.03).
- **Saldo de Caixa da Carteira:** Depósitos, retiradas e saldo monetário em conta corrente permanecem fora do escopo.
- **Marcação a Mercado e Rentabilidade Não Realizada:** Integração com cotações externas em tempo real e gráficos de rentabilidade previstos para fases futuras.
- **Ingestão Automática de Provedores Externos:** Pertence à Fase 06.
- **Alterações de Schema de Banco de Dados:** Nenhuma migração ou alteração DDL (mantido o schema físico canônico de 9 tabelas).

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (23 arquivos, 298 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (15 arquivos, 132 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com 12 rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados (51 testes aprovados no total):
  - **Chromium:** 17/17 testes aprovados;
  - **Firefox:** 17/17 testes aprovados;
  - **WebKit:** 17/17 testes aprovados.
- [x] **Homologação Funcional no Navegador:** Aprovada com veredicto `PASS` via Playwright local.
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
