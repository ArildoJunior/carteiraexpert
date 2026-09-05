# Limites dos Módulos

Este documento define os limites de responsabilidade, fronteiras arquiteturais e estado de implementação dos módulos do CarteiraExpert.

## 1. Módulos Implementados e Parcialmente Implementados

### 1.1. `identity`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/identity/` e `src/lib/db/schema/identity.ts`.
- **Responsabilidades:**
  - Cadastro de usuários e normalização de credenciais;
  - Autenticação e hash de senhas com Argon2id;
  - Gerenciamento de sessões com token SHA-256 no banco e cookies HttpOnly;
  - Controle de rate limiting stateless via banco (`authRateLimits`);
  - Fluxo de redefinição de senha com tokens de uso único (15 minutos);
  - Registro append-only de consentimentos e termos LGPD (`userConsents`).
- **Não é responsável por:**
  - Dados financeiros, carteiras ou planos comerciais.

### 1.2. `portfolio`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/portfolio/`, `src/lib/db/schema/portfolio.ts`, `src/lib/db/schema/cash.ts` e `src/lib/db/schema/custody.ts`.
- **Responsabilidades:**
  - CRUD de carteiras patrimoniais com isolamento por usuário e finalidades formais (`portfolios`, com `purpose: 'REAL' | 'ESTUDO' | 'ANALISE'` e unicidade da carteira `REAL` ativa);
  - Catálogo de ativos globais e ativos customizados (`assets`);
  - Lançamentos manuais de operações (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`);
  - Gestão de contas de caixa e movimentações monetárias (`cash_accounts`, `cash_transactions`);
  - Gestão de instituições de custódia e contas de corretora (`custody_institutions`, `custody_accounts`) com vínculos opcionais `ON DELETE SET NULL`;
  - Motor determinístico de cálculo de posições, custo médio ponderado e PnL realizado (`position-engine.ts`);
  - Motor de evolução patrimonial temporal com replay de eventos (`portfolio-evolution-engine.ts`);
  - Motor de renderização de gráficos de alocação e evolução (`chart-engine.ts`);
  - Extrato cronológico com filtros avançados (inclusive por instituição de custódia) em `/history`;
  - Visualização operacional da carteira selecionada em `/portfolios/[id]` e Dashboard contextual.
- **Limitações e Capacidades Futuras:**
  - Não cobre eventos societários complexos (delegados ao módulo `corporate-actions`);
  - Comparação analítica entre carteiras distintas sob demanda permanece planejada.

### 1.3. `corporate-actions`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/corporate-actions/` e `src/lib/db/schema/subscription.ts`.
- **Responsabilidades:**
  - Processamento auditável e idempotente dos eventos societários suportados: desdobramentos (`SPLIT`), grupamentos (`GROUPING`), bonificações de ações (`BONUS_SHARE`) e proventos em dinheiro (`DIVIDEND` e `JCP` com retenção na fonte de 15% de IRRF);
  - Gestão do ciclo de subscrições: ofertas de subscrição (`subscriptionOffers`), alocação de direitos por carteira (`subscriptionRights`) e exercício atômico com geração de evento `BUY` (`subscriptionExercises`).
- **Limitações:**
  - Não abrange eventos societários complexos (fusões, cisões, incorporações).

### 1.4. `market-data`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/market-data/` e `src/lib/db/schema/market-data.ts`.
- **Capacidades Implementadas e Validadas:**
  - Abstração de provedor de dados (`MarketDataProviderAdapter`);
  - Adaptadores internos: manual (`ManualPayloadAdapter`), mock (`MockProviderAdapter`) e conector público B3/BRAPI (`BrapiAdapter`);
  - Ingestão em lote e normalização temporal em UTC (`MarketDataIngestionService`);
  - Persistência de cotações (`market_quotes`) e taxas de câmbio (`exchange_rates`);
  - Ingestão de séries históricas B3 COTAHIST (`CotahistFixedLengthParser`, `CotahistIngestionService`, tabelas `b3_cotahist_batches` e `b3_historical_quotes`);
  - Ingestão de companhias abertas e demonstrações financeiras da CVM (`cvm_companies`, `cvm_company_assets`, `asset_fundamentals`);
  - Modelos teóricos de valuation Bazin, Graham e DCF simplificado (`theoretical-valuation-engine.ts`);
  - Motor de valuation de posições com tratamento de moeda e defasagem (`valuation-engine.ts`).
- **Capacidades Futuras / Fora do Escopo:**
  - Sincronização contínua em tempo real via WebSocket (plataforma opera com dados EOD e defasados);
  - Integrações com provedores comerciais pagos adicionais.

### 1.5. `plans`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/plans/` e `src/lib/db/schema/plans.ts`.
- **Responsabilidades:**
  - Catálogo de planos comerciais e quotas de carteiras (`commercial_plans`);
  - Entitlements por feature (`plan_entitlements`);
  - Associação e vigência por usuário (`user_plans`);
  - Resolução de plano efetivo e quotas (`getUserEffectivePlan`, `getPlanQuotaSummary`);
  - Enforcement server-side de limites (`assertCanCreatePortfolio`);
  - Downgrade transacional com congelamento de carteiras excedentes (`applyPlanDowngradeInTransaction`).

### 1.6. `billing`
- **Estado:** *Implementado e validado como estrutura interna*.
- **Código Principal:** `src/modules/billing/` e `src/lib/db/schema/billing.ts`.
- **Responsabilidades:**
  - Gestão de ciclo de vida de assinaturas (`billing_subscriptions`);
  - Processamento idempotente de eventos de pagamento (`payment_events`);
  - Estrutura de grupos comerciais de planos compartilhados (`billing_groups`, `billing_group_members`, `billing_group_invitations`);
  - Adaptação agnóstica de gateways de pagamento (`MockPaymentGateway`).
- **Limitações:**
  - Não conecta diretamente com credenciais reais de produção de adquirentes (Stripe/Asaas); opera com gateway mock em ambiente de homologação.

### 1.7. `catalog`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/catalog/`.
- **Responsabilidades:**
  - Descoberta pública de ativos por classe (`/acoes`, `/fiis`, `/etfs`, `/bdrs`, `/ativos`);
  - Páginas públicas individuais por ticker com cálculo de variação diária no fuso São Paulo com `Decimal`;
  - Badge de frescor de cotação (`QuoteFreshnessBadge`);
  - SEO com geração de `sitemap.ts` e `robots.ts`;
  - Ação de lançamento em carteira autenticado com ativo pré-selecionado (`TransactionModal`).

### 1.8. `imports`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/imports/` e `src/lib/db/schema/imports.ts`.
- **Responsabilidades:**
  - Parser e detecção de layout CSV (`carteiraexpert_csv`, `b3_trades_csv`, `b3_movements_csv`);
  - Validação de limite de 5 MB e rejeição de arquivos vazios;
  - Deduplicação inteligente por hash de arquivo SHA-256 e por linha (`raw_line_hash`);
  - Central de revisão de lotes em `/import/[id]` com KPIs em tempo real, filtros por status e edição manual de itens com `Decimal`;
  - Resolução explícita de ativos não identificados (`select_existing` / `create_custom`);
  - Confirmação transacional atômica com bloqueio pessimista `FOR UPDATE`, gravação em `portfolio_events` com `source = 'csv_import'` e bloqueio de edição pós-finalização;
  - Proteção IDOR estrita e isolamento multitenant.
- **Limitações e Expansão Futura:**
  - Suporte a planilhas binárias `.xlsx` e extração de notas em PDF com bucket privado permanecem planejados no roadmap expandido.

### 1.9. `projections`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/projections/` e rota `/simulador`.
- **Responsabilidades:**
  - Simulador determinístico de juros compostos e acumulação patrimonial em `Decimal` (`compound-interest.ts`);
  - Projeção de aportes mensais com parâmetros configuráveis de rentabilidade e inflação;
  - Simulação de fluxo de proventos com premissa explícita de reinvestimento de dividendos;
  - Aviso legal proeminente de finalidade exclusivamente informativa e educacional.
- **Limites Permanentes:** Projeções não constituem garantia ou promessa de rentabilidade futura.

### 1.10. `options`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/options/`, tabela `options_contracts` e rota `/options`.
- **Responsabilidades:**
  - Cadastro e acompanhamento operacional de opções de compra (`CALL`) e venda (`PUT`), estilos Americano e Europeu, posições compradas (`BUY`) e vendidas (`SELL`);
  - Cálculo descritivo de sensibilidades e gregas fundamentais pelo modelo de Black-Scholes em `Decimal` (Delta, Gamma, Theta diário, Vega por 1% e Rho por 1%);
  - Calendário de vencimentos B3 com alertas temporais (D-5 a D-1 e D-0);
  - Simulação gráfica de payoff no vencimento por faixa de preço do ativo-objeto;
  - Banner regulatório obrigatório permanente (`id="options-regulatory-disclaimer"`).
- **Limites Permanentes:** A plataforma não recomenda estratégias, não executa rolagens e não envia ordens a corretoras.

### 1.11. `tax`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/tax/`, tabelas `tax_calculation_runs`, `tax_monthly_summaries`, `tax_loss_credits` e rota `/fiscal`.
- **Responsabilidades:**
  - Apuração mensal determinística de ganhos e perdas líquidas por classe de ativo (Ações, FIIs, ETFs, BDRs);
  - Aplicação estrita da isenção de R$ 20.000,00 para ações no mercado à vista (IN RFB 2054/2024), com regra de não compensação de prejuízos em meses isentos;
  - Segregação de operações Day-Trade (alíquota padrão de 20%, sem isenção de R$ 20k);
  - Segregação de Fundos Imobiliários (ganho de capital tributável sem isenção; proventos mensais isentos);
  - Controle e compensação de prejuízos fiscais acumulados em ordem cronológica (FIFO) por até 5 anos-calendário;
  - Geração de relatórios anuais auxiliares para a Declaração de Ajuste Anual do IRPF (Fichas: Bens e Direitos em 31/12, Rendimentos Isentos e Rendimentos Sujeitos à Tributação Exclusiva);
  - Exportação em formato CSV e visualização para impressão/PDF;
  - Banner regulatório RFB/CVM permanente (`id="tax-regulatory-disclaimer"`).
- **Limites Permanentes:** A plataforma não emite DARF, não preenche declaração oficial da Receita Federal e não substitui profissional habilitado de contabilidade.

### 1.12. `editorial`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/editorial/`, tabelas `editorial_documents`, `editorial_versions`, `editorial_reviews`, `editorial_ai_executions` e rota `/editorial`.
- **Responsabilidades:**
  - Fluxo editorial interno restrito para apoio à redação de análises e resumos baseados em documentos públicos oficiais de empresas (RI);
  - Máquina de estados estrita: `DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> PUBLISHED -> ARCHIVED`;
  - Segregação de funções obrigatória: proibição de autoaprovação (o autor não pode aprovar seu próprio documento);
  - Revisão e aprovação humana obrigatórias antes de qualquer publicação;
  - Vínculo permanente e auditável entre o conteúdo publicado e o documento público de origem;
  - Guardrails regulatórios automatizados bloqueando termos proibidos (promessas de ganho, recomendações de investimento, garantias de retorno e emissão de DARF);
  - Provedor de IA desacoplado (`MockEditorialAiProvider` em homologação) com sanitização de prompts e respostas;
  - Banner regulatório obrigatório permanente (`id="editorial-regulatory-disclaimer"`).
- **Limites Permanentes:** A IA não possui interface conversacional/chat para o usuário final, não calcula métricas financeiras oficiais e não publica conteúdo de forma autônoma.

## 2. Capacidades Futuras Planejadas (Sem Implementação Efetiva)

As seguintes funcionalidades encontram-se especificadas como expansões futuras e não possuem código ativo:

### 2.1. Comparação Explícita entre Carteiras Distintas
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Ferramenta analítica sob demanda para confrontar métricas e curvas de rentabilidade entre duas ou mais carteiras (`REAL`, `ESTUDO` ou `ANALISE`), sem fundir eventos nem alterar saldos.

### 2.2. Ingestão Automatizada de Notas em PDF e Planilhas XLSX
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Extração assistida de notas de corretagem em PDF via bucket privado seguro com URLs temporárias assinadas e processamento de planilhas binárias `.xlsx`.

### 2.3. Análise Técnica Descritiva Avançada
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Cálculo e plotagem de indicadores técnicos puramente descritivos (médias móveis, volatilidade histórica, drawdown acumulado) em interface interativa, sem geração de sinais de compra/venda.

## 3. Regras de Fronteira e Comunicação entre Módulos

1. **Acesso ao Banco de Dados:** Um módulo não deve acessar diretamente tabelas privadas de outro módulo sem contrato explícito de serviço ou schema compartilhado.
2. **Desacoplamento de Domínio:** Motores de cálculo financeiro são puros, isolados, determinísticos e independentes de componentes de interface ou de integrações de rede.
3. **Comunicação na Interface:** Componentes React devem acionar Server Actions específicas do módulo responsável, evitando composições diretas que violem os limites de domínio.