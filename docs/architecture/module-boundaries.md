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
- **Código Principal:** `src/modules/portfolio/` e `src/lib/db/schema/portfolio.ts`.
- **Responsabilidades:**
  - CRUD de carteiras patrimoniais com isolamento por usuário (`portfolios`);
  - Catálogo de ativos globais e ativos customizados (`assets`);
  - Lançamentos manuais de operações (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`);
  - Motor determinístico de cálculo de posições, custo médio ponderado e PnL realizado (`position-engine.ts`);
  - Motor de evolução patrimonial temporal com replay de eventos (`portfolio-evolution-engine.ts`);
  - Motor de renderização de gráficos de alocação e evolução (`chart-engine.ts`);
  - Extrato e visualização operacional da carteira selecionada em `/portfolios/[id]`.
- **Limitações e Capacidades Futuras:**
  - Não cobre eventos societários complexos (delegados ao módulo `corporate-actions`);
  - *Contas de Custódia e Corretoras:* Representam capacidades futuras aprovadas conceitualmente; não há entidades de custódia institucional no banco atual;
  - *Saldo de Caixa:* Controle de saldo de caixa monetário é uma regra aprovada com implementação pendente.

### 1.3. `corporate-actions`
- **Estado:** *Implementado e validado*.
- **Código Principal:** `src/modules/corporate-actions/` e `src/lib/db/schema/subscription.ts`.
- **Responsabilidades:**
  - Processamento auditável e idempotente dos eventos societários suportados: desdobramentos (`SPLIT`), grupamentos (`GROUPING`), bonificações de ações (`BONUS_SHARE`) e proventos em dinheiro (`DIVIDEND` e `JCP` com retenção na fonte de 15% de IRRF);
  - Gestão do ciclo de subscrições: ofertas de subscrição (`subscriptionOffers`), alocação de direitos por carteira (`subscriptionRights`) e exercício atômico com geração de evento `BUY` (`subscriptionExercises`).
- **Limitações:**
  - Não cobre outros eventos societários complexos (fusões, cisões, incorporações, amortizações ou OPAs);
  - Não recomenda adesão a eventos societários ou compra de direitos.

### 1.4. `market-data`
- **Estado:** *Parcialmente implementado por ausência de integração externa real*.
- **Código Principal:** `src/modules/market-data/` e `src/lib/db/schema/market-data.ts`.
- **Capacidades Implementadas e Validadas:**
  - Abstração de provedor de dados (`MarketDataProviderAdapter`);
  - Adaptadores internos: manual (`ManualPayloadAdapter`) e mock (`MockProviderAdapter`);
  - Ingestão em lote e normalização temporal em UTC (`MarketDataIngestionService`);
  - Persistência e consulta de cotações (`market_quotes`) e taxas de câmbio (`exchange_rates`);
  - Motor de valuation de posições com tratamento de moeda e defasagem (`valuation-engine.ts`).
- **Capacidades Pendentes / Não Verificadas:**
  - *Integração Externa Real:* Não implementada ou não verificada (sem chamadas HTTP a provedores externos);
  - *Camada de Cache:* As consultas são atendidas diretamente pelo banco PostgreSQL; não há camada de cache externo Redis confirmada.

## 2. Módulos Planejados (Sem Implementação Efetiva)

Os módulos abaixo possuem diretórios estruturais reservados em `src/modules/`, mas encontram-se sem código ou tabelas ativas no estado atual:

### 2.1. `subscriptions` (Planos e Assinaturas SaaS)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Gestão de planos comerciais (Free, planos superiores, plano compartilhado), controle de faturamento/assinaturas, atribuição de entitlements técnicos e gestão de convites do grupo compartilhado.
- **Ressalva:** A tabela `subscription_offers`/`subscription_rights` existente no banco refere-se a subscrição de ativos societários, não a assinaturas comerciais de software.

### 2.2. `imports` (Importações e Documentos)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Upload de extratos (CSV, XLSX) e notas de corretagem em PDF, processamento assíncrono de arquivos, tela de conferência/revisão antes da efetivação e rastreamento de documentos de origem.

### 2.3. `tax` (Módulo Tributário Dedicado)
- **Estado:** *Parcialmente implementado nos motores existentes / Módulo dedicado planejado*.
- **Escopo Previsto:** Relatórios anuais de IRPF auxiliares, fechamento de períodos fiscais e consolidação de apuração.
- **Realidade Atual:** O cálculo factual de PnL realizado por venda é executado no módulo `portfolio` e a retenção de IRRF em JCP é calculada no módulo `corporate-actions`. Não há módulo fiscal dedicado em `src/modules/tax/`.
- **Limites Permanentes:** A plataforma não emite DARF, não elabora declaração completa e não substitui serviços contábeis.

### 2.4. `options` (Módulo Operacional de Opções)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Acompanhamento operacional de travas, posições cobertas, alertas de exercício/vencimento e cálculo descritivo de gregas.
- **Realidade Atual:** Apenas a string `'option'` existe no catálogo cadastral de tipos de ativos (`asset_type`), sem lógica operacional.

### 2.5. `editorial-ai` (IA Editorial Interna)
- **Estado:** *Planejado, não implementado*.
- **Escopo Previsto:** Apoio interno à redação de resumos e relatórios analíticos a partir de documentos públicos de RI, sob fluxo estrito com revisão e aprovação humana obrigatória antes de qualquer publicação.
- **Limites Permanentes:** A IA não possui autonomia para publicar conteúdo, não calcula métricas financeiras oficiais e não interage com usuários finais através de chats.

## 3. Regras de Fronteira e Comunicação entre Módulos

1. **Acesso ao Banco de Dados:** Um módulo não deve acessar diretamente tabelas privadas de outro módulo sem contrato explícito de serviço ou schema compartilhado.
2. **Desacoplamento de Domínio:** Motores de cálculo financeiro são puros, isolados, determinísticos e independentes de componentes de interface ou de integrações de rede.
3. **Comunicação na Interface:** Componentes React devem acionar Server Actions específicas do módulo responsável, evitando composições diretas que violem os limites de domínio.