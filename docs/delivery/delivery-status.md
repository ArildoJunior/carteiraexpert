# Estado Atual do Projeto

## Última atualização

2026-08-19

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança, o módulo de carteiras com operações manuais, motor de posições, dashboard consolidado, extrato de histórico, o suporte completo a eventos corporativos (Split, Grupamento, Bonificação, Dividendos, JCP e Subscrições) e a infraestrutura interna de dados de mercado, valuation e evolução temporal encontram-se no seguinte status:

- **Fase 01 — Fundação Técnica:** **IMPLEMENTADA E VALIDADA** (Arquitetura modular monolítica, motor financeiro determinístico baseado em `Decimal`, persistência `NUMERIC`, infraestrutura de testes unitários, integração e E2E, e registro em `audit_logs` nos fluxos auditados).
- **Fase 02 — Identidade, Acesso e Segurança:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS** (Cadastro, login com hash Argon2id com parâmetros seguros, sessões com hash SHA-256 no banco, controle de taxa stateless com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD com trigger append-only em `user_consents`. As rotas e operações analisadas utilizam o identificador autenticado do usuário para restringir o acesso aos dados, com a cobertura completa de todas as rotas e serviços sujeita à validação contínua).
- **Fase 03 — Carteiras, Ativos e Posições:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS** (Gestão de múltiplas carteiras estruturais, catálogo de ativos, quatro tipos operacionais com processamento no motor de posições comprovado por testes — `BUY`, `SELL`, `TRANSFER_IN` e `TRANSFER_OUT` —, tipos `MANUAL_ADJUSTMENT` e `REVERSAL` presentes no schema, enum e mecanismos de auditoria com cálculo contábil no motor classificado como não verificado / pendente de detalhamento, motor de custo médio ponderado, validação temporal de vendas com bloqueio de saldo descoberto via `InsufficientPositionError`, apuração de PnL realizado por venda, cancelamento lógico com justificativa, extrato `/history` paginado com filtros avançados e visualização contextual em `/portfolios/[id]`).
- **Fase 04 — Ações Corporativas e Subscrições:** **IMPLEMENTADA E VALIDADA NOS FLUXOS COMPROVADOS**
  - **Pacote 04.01 — Split e Grupamento de Ativos:** Processamento determinístico de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`), preservação do custo total de aquisição invariante, identificação de frações em `Decimal`, validação temporal e integração à interface e extrato.
  - **Pacote 04.02 — Bonificação, Dividendos e JCP:** Processamento de bonificação de ações (`BONUS_SHARE`) com custo atribuído opcional e recálculo de custo médio, proventos em dinheiro — dividendos isentos (`DIVIDEND`) e Juros sobre Capital Próprio (`JCP`) com retenção de 15% de IRRF —, exigência de Data de Pagamento (`settlementDate`), validação de custódia na Data-Com (`tradeDate`) e totalização em `totalIncomeReceived`.
  - **Pacote 04.03 — Subscrições e Direitos Societários:** Modelo relacional composto por 3 tabelas (`subscription_offers`, `subscription_rights`, `subscription_exercises`), controle de prazos e direitos por carteira, liquidação financeira com geração atômica de evento operacional `BUY` com chave `idempotencyKey`, e cobertura comprovada por testes unitários, integração e E2E (`e2e/subscription.spec.ts`).
- **Fase 05 — Planos, Entitlements e Compartilhamento:** **PLANEJADA, NÃO IMPLEMENTADA** (Regras de produto e isolamento aprovadas em ADR-004; sem tabelas comerciais, gateways de pagamento, quotas ou entitlements ativos no código).
- **Fase 06 — Dados de Mercado e Gráficos:** **PARCIALMENTE IMPLEMENTADA** (Infraestrutura interna entregue: tabelas `market_quotes` e `exchange_rates`, adaptadores `ManualPayloadAdapter` e `MockProviderAdapter`, serviço de ingestão `MarketDataIngestionService` com ranking de qualidade, motores de valuation, evolução temporal diária e gráficos Recharts; provedores externos reais, sincronização automática e WebSockets permanecem planejados).
- **Fase 07 — Importações Revisáveis:** **PLANEJADA, NÃO IMPLEMENTADA** (Upload, parsing de planilhas CSV/XLSX, extração assistida de notas em PDF e storage privado permanecem no roadmap).
- **Fase 08 — Ativos Internacionais e Criptoativos:** **PARCIALMENTE IMPLEMENTADA** (Multi-moeda, `exchange_rates`, conversão cambial determinística no valuation e precisão `NUMERIC(28, 10)` para criptoativos entregues; swaps, exchanges via API e custódia on-chain permanecem planejados).
- **Fase 09 — Projeções, Opções e Apoio Tributário:** **PARCIALMENTE IMPLEMENTADA NAS BASES** (Bases factuais de PnL realizado e IRRF sobre JCP entregues nos motores existentes; modelos teóricos Bazin/Graham/DCF, módulo operacional de opções e módulo fiscal dedicado permanecem planejados; DARF e IRPF completo estão fora do escopo permanente).
- **Fase 10 — IA Editorial e Preparação de Lançamento:** **PLANEJADA, NÃO IMPLEMENTADA** (Diretrizes de governança editorial aprovadas; infraestrutura de LLM e preparação operacional permanecem planejadas).

---

## Catálogo Físico de Tabelas Validadas no PostgreSQL (14 tabelas)

O banco de dados relacional oficial do CarteiraExpert é composto exatamente pelas seguintes 14 tabelas físicas:

1. `audit_logs`: Trilha de auditoria e registro de alterações sensíveis;
2. `users`: Contas de usuários autenticados;
3. `sessions`: Sessões ativas com token em hash SHA-256;
4. `password_reset_tokens`: Tokens temporários para redefinição atômica de senha;
5. `auth_rate_limits`: Registros de controle de taxa de requisições de autenticação;
6. `user_consents`: Registro versionado de termos LGPD com trigger *append-only*;
7. `portfolios`: Carteiras de investimento estruturais;
8. `assets`: Catálogo unificado de ativos cadastrados e customizados;
9. `portfolio_events`: Eventos operacionais de carteira (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `MANUAL_ADJUSTMENT`, `REVERSAL`);
10. `subscription_offers`: Ofertas societárias de direitos de subscrição;
11. `subscription_rights`: Custódia de direitos de subscrição alocados por carteira;
12. `subscription_exercises`: Exercício liquidado de direitos gerando evento `BUY`;
13. `market_quotes`: Histórico e cotações locais de ativos;
14. `exchange_rates`: Histórico e taxas de conversão cambial UTC.

*Nota:* As tabelas `subscription_offers`, `subscription_rights` e `subscription_exercises` tratam estritamente de direitos societários de ativos de renda variável e não constituem planos de assinatura comercial SaaS.

---

## Capacidades Pendentes ou no Roadmap

Permanecem como regras de negócio aprovadas ou capacidades planejadas:

- **Gestão de Caixa e Contas Bancárias:** Saldos em moeda, depósitos, saques, aportes em dinheiro e liquidação de caixa;
- **Custódia Institucional:** Vinculação formal de corretoras, contas institucionais e custodiantes;
- **Finalidades Formais de Carteira:** Atributo formal `purpose` (`REAL`, `ESTUDO`, `ANALISE`) e suporte a múltiplas carteiras `REAL`;
- **Governança de Planos:** Quotas de carteiras por plano, downgrade e status `frozen`;
- **Dashboard Contextual:** Transição do agregador atual de `/dashboard` para seleção contextual de carteira única;
- **Conectores Externos:** Integração com provedores externos reais de cotações e câmbio;
- **Módulo Operacional de Opções:** Cadastro de derivativos, gregas, alertas e acompanhamento de vencimentos;
- **Módulo Fiscal Dedicado:** Apuração mensal, compensação de prejuízos e relatórios auxiliares para IRPF;
- **IA Editorial Interna:** Pipeline editorial interno com revisão humana obrigatória.

---

## Validações no Ambiente

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (23 arquivos, suítes de motores e schemas).
- [x] **Testes de Integração:** Aprovados (15 arquivos em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` com rotas estáticas e dinâmicas compiladas).
- [x] **Testes End-to-End (E2E):** Aprovados via Playwright (incluindo autenticação, consentimento LGPD, carteiras e subscrições).
- [x] **Verificação Física do Schema:** 14 tabelas físicas catalogadas e validadas.
