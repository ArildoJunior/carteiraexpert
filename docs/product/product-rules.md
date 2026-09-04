# Regras Centrais do Produto

## 1. Conceito e Finalidades de Carteira

- A carteira é a unidade patrimonial e analítica independente do usuário.
- Uma carteira não representa uma corretora nem uma conta bancária.
- A carteira consolida ativos, contas e saldos de caixa, eventos operacionais e posições com suporte à vinculação de contas e instituições de custódia.
- Como regra de produto, carteiras com finalidades distintas não são mescladas na visão patrimonial padrão. O dashboard contextual permite alternar entre o contexto consolidado da carteira `REAL` ou focar em uma carteira específica.

### Finalidades Aprovadas e Implementadas
As finalidades oficiais de carteira no produto são:
- `REAL`: carteira de patrimônio real e histórico operacional efetivo do usuário.
- `ESTUDO`: carteira hipotética para estudos, acompanhamento de teses e aprendizado.
- `ANALISE`: carteira aprovada para simulações, modelagem de cenários e análises comparativas.

### Regras de Negócio e Estado da Implementação
- **Múltiplas carteiras estruturais por usuário:** *Implementado e validado no código* (o modelo e as Server Actions permitem a criação de múltiplas carteiras independentes por usuário).
- **Finalidades `REAL`, `ESTUDO` e `ANALISE`:** *Implementado e validado no código* (coluna `purpose` com enum e constraint física `chk_portfolios_purpose` via migração `0018_add_portfolio_purpose.sql`).
- **Unicidade da carteira `REAL` ativa:** *Implementado e validado no banco* (o índice único parcial `idx_unique_user_real_portfolio` impõe no máximo uma carteira com `purpose = 'REAL'` ativa e não deletada por usuário; múltiplas carteiras de `ESTUDO` e `ANALISE` são permitidas).
- **Segregação patrimonial:** *Implementado e validado no código* (carteiras de estudo e análise não contaminam o cálculo patrimonial da carteira real).

## 2. Limites de Carteiras e Política de Downgrade

### Limites por Plano (Regras Aprovadas)
- **Plano Free:** até 2 carteiras ativas no total.
- **Planos superiores ao Free e plano compartilhado, conforme as regras comerciais aprovadas:** até 10 carteiras ativas no total.
- O limite é total e global por usuário, permitindo combinação livre entre carteiras `REAL`, `ESTUDO` e `ANALISE` dentro do limite contratado.
- Não existem limites segregados por finalidade.

### Política de Downgrade e Congelamento (Regras Aprovadas)
Quando um usuário possuir mais de 2 carteiras ativas e retornar ao plano Free (por cancelamento, término de período ou encerramento de plano compartilhado):
- **Preservação total de dados:** nenhum dado histórico, evento, transação ou posição será apagado, e nenhuma carteira será destruída fisicamente.
- **Seleção de carteiras ativas:** o usuário poderá escolher até 2 carteiras para permanecerem ativas no contexto operacional.
- **Congelamento das excedentes:** as carteiras excedentes serão preservadas, ficando congeladas e disponíveis exclusivamente para consulta (somente leitura).
- **Regras das carteiras congeladas:** não aceitarão novos lançamentos, edições ou exclusões, e não participarão do contexto operacional ativo.
- **Reativação:** uma carteira congelada poderá ser reativada após novo upgrade ou após a desativação ou remoção lógica explicitamente confirmada pelo usuário, observadas as regras de retenção histórica.
- **Formulação canônica:** *"Free: até 2 carteiras ativas. Carteiras excedentes: preservadas, congeladas e somente leitura."*

### Estado da Implementação
*Implementado e validado no código* (Fase 05 — Pacotes 05.01, 05.02 e 05.03). Quotas numéricas derivadas de `commercial_plans.max_active_portfolios`, validação server-side via `assertCanCreatePortfolio` com lock pessimista `FOR UPDATE`, transição atômica de downgrade via `applyPlanDowngradeInTransaction`, bloqueio rigoroso de mutações em carteiras `frozen` via `assertPortfolioWritable` e gerenciamento na página `/plans`.

## 3. Dashboard e Contexto Operacional

- **Regra de produto:** o dashboard padrão opera sobre uma **carteira selecionada** ou contexto selecionado, sem somar indevidamente carteiras de finalidades distintas.
- **Estado atual no código:** *Implementado e validado*. O seletor contextual (`DashboardContextSelector`) permite ao usuário alternar entre o contexto da carteira `REAL` ou visualizar uma carteira específica via parâmetro de URL (`/dashboard?portfolioId=...`), resolvendo deterministicamente para a carteira `REAL` ativa na ausência de parâmetro.
- **Visualização de carteira específica:** a rota `/portfolios/[id]` opera estritamente sobre uma carteira específica (*Implementado e validado no código*).
- **Terminologia oficial:** *carteira selecionada, contexto selecionado, dashboard da carteira, visão patrimonial da carteira, comparação explícita entre carteiras*.

## 4. Comparação entre Carteiras (Funcionalidade Planejada)

- A comparação entre carteiras é uma operação analítica explícita e sob demanda solicitada pelo usuário.
- Uma carteira `REAL` poderá ser comparada com outras carteiras `REAL`, `ESTUDO` ou `ANALISE`.
- A comparação:
  - Não cria uma nova carteira permanente;
  - Não altera patrimônio;
  - Não mistura nem funde eventos históricos;
  - Não altera saldos de caixa;
  - Não modifica posições em custódia;
  - Não transforma carteiras em uma carteira consolidada permanente.
- **Estado da implementação:** *Planejado, não implementado*. Não existem services, telas ou Server Actions de comparação entre carteiras. O modo "Mercado vs. Custo" da evolução patrimonial é uma comparação interna dentro da mesma carteira e não representa comparação entre carteiras distintas.

## 5. Saldo de Caixa (Módulo Implementado)

- A carteira contempla controle determinístico de saldo de caixa monetário (recursos aguardando investimento, depósitos, retiradas, liquidação financeira de operações e saldos por moeda).
- **Estado da implementação:** *Implementado e validado no código* (Etapa 4 — commit `40341ba`, migração `0019_add_cash_accounts_and_transactions.sql`).
  - Tabelas `cash_accounts` e `cash_transactions` com suporte multi-moeda e precisão `NUMERIC(28, 10)` com `Decimal`.
  - Operações de depósito (`DEPOSIT`), retirada (`WITHDRAWAL`), transferência (`TRANSFER`) e ajuste (`ADJUSTMENT`).
  - Vínculo opcional de liquidação com eventos operacionais de carteira via `portfolio_event_id`.
  - Vínculo opcional com contas de corretora/banco via `custody_account_id`.
  - Cálculo determinístico de saldo com bloqueio de concorrência e rejeição de saques sem saldo suficiente.

## 6. Custódia e Corretoras (Módulo Implementado)

- Corretora, custodiante e conta de origem são tratadas formalmente como entidades relacionais próprias vinculadas à carteira, superando a dependência exclusiva de campos textuais livres.
- **Estado da implementação:** *Implementado e validado no código* (Etapa 5 — commit `78f2a5c`, migração `0020_add_custody_entities.sql`, ADR-012).
  - Tabela `custody_institutions`: catálogo canônico pré-populado com instituições financeiras e corretoras nacionais e internacionais (XP Investimentos, BTG Pactual, NuInvest, Clear Corretora, Banco Inter, Avenue Securities, Interactive Brokers — IBKR, Binance, entre outras), com unicidade de código (`code`) e status (`active`, `inactive`).
  - Tabela `custody_accounts`: contas de custódia vinculadas a uma carteira (`portfolio_id`) e a uma instituição (`institution_id`), com identificador de conta (`account_number`), status (`active`, `archived`) e soft delete (`deleted_at`).
  - Contas inativas ou arquivadas (`archived`) preservam integralmente o histórico de eventos sem permitir novos lançamentos.
  - Vínculos opcionais em entidades do domínio patrimonial com regra de integridade `ON DELETE SET NULL`:
    - `portfolio_events.custody_account_id`
    - `cash_accounts.custody_account_id`
    - `import_batches.custody_account_id`
  - Filtro por instituição de custódia integrado e comprovado no extrato `/history`.
  - O campo textual complementar `source` em `portfolio_events` permanece como identificador descritivo ou de importação (`'manual'`, `'csv_import'`), enquanto a instituição de custódia formal é referenciada via chave estrangeira.

## 7. Análise, Screening e Valuations

- Ferramentas de análise, filtros e modelos teóricos de valuation não alteram a carteira nem afetam fatos patrimoniais.
- Projeções representam cenários hipotéticos, não promessas de resultado ou patrimônio real.
- Rankings são estritamente descritivos e refletem parâmetros definidos pelo usuário.
- O produto não recomenda compra, venda, manutenção ou troca de ativos e não fornece carteiras recomendadas.

## 8. Provedores Externos de Dados

- Quando houver integração externa, o fluxo previsto será: Provedor Externo → Adaptador Interno → Validação/Normalização → Banco Interno → Motores → Interface. No estado atual, o fluxo efetivamente validado utiliza ingestão manual e adaptadores mock; não há provedor externo real confirmado.
- **Estado da implementação:**
  - Abstração `MarketDataProviderAdapter`: *Implementado e validado no código*.
  - Adaptador manual (`ManualPayloadAdapter`): *Implementado e validado no código*.
  - Adaptador mock (`MockProviderAdapter`): *Implementado e validado no código*.
  - Ingestão interna para tabelas `market_quotes` e `exchange_rates`: *Implementado e validado no código*.
  - Integração automática com provedores externos reais: *Não implementada ou não verificada* (nenhum fornecedor exclusivo aprovado ou contratado neste momento).

## 9. Opções (Roadmap / Planejado)

- O módulo de opções está aprovado no roadmap para controle e acompanhamento operacional (compra, venda, lançamentos cobertos, exercício, vencimento, prêmios e alertas).
- **Estado da implementação:** *Planejado, não implementado*. O valor `option` existe apenas como tipo de ativo no catálogo cadastral (`ASSET_TYPES`), sem módulo operacional, cálculos de gregas, controle de exercício/vencimento ou telas dedicadas.

## 10. Apoio Tributário Informativo

- O produto prevê apoio tributário estritamente informativo e organizacional.
- **Estado da implementação:**
  - Apuração de PnL realizado por operação de venda: *Parcialmente implementado e validado* (no motor de posições).
  - Cálculo de proventos com retenção de IRRF sobre JCP e custo atribuído em bonificação: *Parcialmente implementado e validado* (no motor de ações corporativas).
  - Relatórios tributários específicos e exportações fiscais estruturadas: *Planejado ou implementação pendente*.
  - Módulo de apoio tributário completo: *Não implementado*.
- **Limites permanentes fora do escopo:** emissão de DARF, declaração completa de IRPF, aconselhamento tributário definitivo e substituição de profissional contábil habilitado.

## 11. Inteligência Artificial Editorial Interna

- O uso de IA é estritamente restrito ao fluxo editorial interno para apoio à equipe na redação de resumos e análises baseadas em documentos públicos de RI.
- A IA não calcula métricas financeiras oficiais, PnL, custo médio ou impostos.
- A IA não recomenda compra, venda ou estratégias de investimento.
- A IA não interage com usuários finais através de chats ou assistentes conversacionais.
- Conteúdo gerado com apoio de IA nunca é publicado automaticamente; revisão e aprovação humanas são obrigatórias com vínculo permanente ao documento-fonte.

## 12. Fora do Escopo Permanente da Plataforma

- Execução, roteamento ou transmissão de ordens para corretoras, bancos ou exchanges.
- Recomendação automática ou discricionária de investimentos.
- Carteiras recomendadas e relatórios de recomendação de analistas.
- Chat ou assistente conversacional de IA para o usuário final.
- Emissão de DARF ou processamento de pagamentos de tributos.
- Elaboração ou transmissão de declaração completa de IRPF.
- Substituição de contador, consultor, assessor ou analista de valores mobiliários credenciado.