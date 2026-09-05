# Escopo do MVP

## 1. Objetivo do MVP

Entregar uma base sólida, auditável e confiável de gestão patrimonial com suporte a múltiplas carteiras independentes, operações manuais, cálculo determinístico de posição e custo médio ponderado, apuração de PnL realizado, eventos corporativos, direitos de subscrição, dados de mercado internos e relatórios de acompanhamento por carteira específica.

## 2. Estado do Escopo do MVP

### 2.1. Funcionalidades Implementadas e Validadas

- **Identidade e Segurança:**
  - Cadastro, autenticação com hash Argon2id e gerenciamento de sessões em banco de dados;
  - Redefinição atômica de senha com tokens criptograficamente seguros;
  - Aceite de termos e registro de consentimentos LGPD versionados (*append-only*);
  - Verificação física de schema de banco de dados (44 tabelas físicas no catálogo oficial validadas).
- **Núcleo de Carteira, Posições e Finalidades:**
  - Carteira como entidade estrutural no banco de dados com atributo formal de finalidade (`purpose`: `REAL`, `ESTUDO`, `ANALISE`);
  - Unicidade da carteira `REAL` ativa por usuário via índice único parcial no PostgreSQL;
  - Lançamentos manuais de compras, vendas e taxas operacionais vinculadas a uma carteira;
  - Motor financeiro determinístico em `Decimal` para cálculo de custo médio ponderado e PnL realizado;
  - Extrato de operações paginado com filtros avançados (inclusive por instituição de custódia);
  - Visualização de posições e extrato de carteira específica na rota `/portfolios/[id]`;
  - Dashboard contextual com seletor de carteira ou consolidado da carteira `REAL`.
- **Contas de Caixa e Movimentações Monetárias:**
  - Gestão de contas de caixa por carteira (`cash_accounts`);
  - Lançamentos de depósitos, retiradas, transferências e ajustes (`cash_transactions`);
  - Liquidação opcional vinculada a eventos operacionais de carteira e vínculo a contas de corretora.
- **Instituições e Contas de Custódia:**
  - Catálogo canônico de instituições de custódia (`custody_institutions`);
  - Contas de custódia vinculadas a carteiras (`custody_accounts`) com suporte a contas arquivadas;
  - Vínculos opcionais em eventos, contas de caixa e lotes de importação com `ON DELETE SET NULL`.
- **Planos Comerciais, Quotas e Entitlements:**
  - Catálogo de planos (`commercial_plans`, `plan_entitlements`, `user_plans`);
  - Quotas por plano (Free: 2 carteiras, Pro: 10 carteiras) com enforcement server-side;
  - Downgrade transacional com congelamento de carteiras excedentes (`frozen`) e proteção total de dados.
- **Importações Revisáveis:**
  - Módulo de importação CSV (`carteiraexpert_csv`, `b3_trades_csv`, `b3_movements_csv`) com limite de 5 MB;
  - Central de revisão de lotes (`/import/[id]`), deduplicação e confirmação transacional atômica em `portfolio_events`.
- **Eventos Corporativos e Ações Societárias:**
  - Processamento auditável e idempotente de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`);
  - Bonificações de ações (`BONUS_SHARE`) com custo atribuído opcional e recálculo de custo médio;
  - Proventos em dinheiro: dividendos isentos (`DIVIDEND`) e Juros sobre Capital Próprio (`JCP`) com retenção de IRRF;
  - Gestão de Direitos e Ofertas de Subscrição (`subscription_offers`, `subscription_rights`, `subscription_exercises`).
- **Dados de Mercado, Histórico B3 COTAHIST, CVM e Gráficos (Etapa 6):**
  - Abstração `MarketDataProviderAdapter` e adaptadores manual (`ManualPayloadAdapter`), mock (`MockProviderAdapter`) e conector público BRAPI;
  - Ingestão interna em lote para persistência em `market_quotes` e `exchange_rates`;
  - Ingestão de séries históricas B3 COTAHIST (`b3_cotahist_batches`, `b3_historical_quotes`);
  - Ingestão de companhias CVM e fundamentos contábeis (`cvm_companies`, `cvm_company_assets`, `asset_fundamentals`);
  - Modelos teóricos de valuation Bazin, Graham e DCF simplificado (`theoretical-valuation-engine.ts`);
  - Catálogo público de ativos por classe (`/acoes`, `/fiis`, `/etfs`, `/bdrs`, `/ativos`);
  - Gráficos de alocação patrimonial por ativo, classe e moeda, e evolução temporal "Mercado vs. Custo";
  - Persistência atômica de preferências visuais de gráficos por usuário e contexto (`user_chart_preferences`).
- **Simulador de Projeções e Juros Compostos (Etapa 7):**
  - Simulador determinístico em `Decimal` com aportes mensais, taxa e inflação configuráveis e efeito de proventos reinvestidos (`/simulador`).
- **Módulo Operacional de Opções e Derivativos (Etapa 8):**
  - Cadastro de opções (`options_contracts`), modelo Black-Scholes determinístico com cálculo de gregas fundamentais em `Decimal`, alertas de vencimento B3 e curvas de payoff na rota `/options`.
- **Módulo Fiscal Dedicado e Relatórios Auxiliares de IRPF (Etapa 9):**
  - Apuração determinística em `Decimal` de ganhos e perdas por classe, isenção de R$ 20k em ações (IN RFB 2054/2024), Day-Trade 20%, FIIs sem isenção, compensação FIFO de prejuízos acumulados e relatórios auxiliares anuais em `/fiscal` (`tax_calculation_runs`, `tax_monthly_summaries`, `tax_loss_credits`).
- **Workflow Editorial e Governança com IA (Etapa 10):**
  - Apoio à redação de análises baseado em documentos de RI com máquina de estados rigorosa, revisão/aprovação humana obrigatória, proibição de autoaprovação e guardrails regulatórios na rota `/editorial` (`editorial_documents`, `editorial_versions`, `editorial_reviews`, `editorial_ai_executions`).

### 2.2. Capacidades Aprovadas para Fases Futuras (Não Entregues no MVP)

- Automação contínua da ingestão B3/CVM via workers assíncronos/cron periódicos — Planejada.
- Gateways de pagamento reais com cartões/PIX no webhook (Stripe/Asaas) — Fora do escopo temporário.
- Comparação analítica sob demanda entre carteiras distintas — Planejada, não implementada.
- Suporte a planilhas binárias `.xlsx` e notas em PDF com bucket privado seguro — Planejado.

## 3. Não Incluído no MVP Inicial (Fora do Escopo)

- Integração direta via Open Finance ou APIs bancárias/corretoras para sincronização automática;
- Envio, roteamento ou execução de ordens em corretoras ou exchanges;
- Emissão de DARF ou cálculo definitivo para recolhimento fiscal;
- Declaração completa de IRPF ou substituição de serviços contábeis;
- Recomendações automáticas de ativos ou carteiras recomendadas;
- Assistente conversacional ou chat de IA para o usuário final;
- IA com autonomia para publicação de análises ou cálculos financeiros;
- Processamento automatizado de PDFs de todas as corretoras do mercado;
- Módulo avançado de precificação de opções (cálculo de gregas em tempo real);
- Aplicativo mobile nativo (foco inicial em web responsiva).