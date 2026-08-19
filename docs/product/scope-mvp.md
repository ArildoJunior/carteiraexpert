# Escopo do MVP

## 1. Objetivo do MVP

Entregar uma base sólida, auditável e confiável de gestão patrimonial com suporte a múltiplas carteiras independentes, operações manuais, cálculo determinístico de posição e custo médio ponderado, apuração de PnL realizado, eventos corporativos, direitos de subscrição, dados de mercado internos e relatórios de acompanhamento por carteira específica.

## 2. Estado do Escopo do MVP

### 2.1. Funcionalidades Implementadas e Validadas

- **Identidade e Segurança:**
  - Cadastro, autenticação com hash Argon2id e gerenciamento de sessões em banco de dados;
  - Redefinição atômica de senha com tokens criptograficamente seguros;
  - Aceite de termos e registro de consentimentos LGPD versionados (*append-only*);
  - Verificação física de schema de banco de dados (14 tabelas oficiais validadas).
- **Núcleo de Carteira e Posições:**
  - Carteira como entidade estrutural no banco de dados;
  - Suporte à criação de múltiplas carteiras por usuário;
  - Lançamentos manuais de compras, vendas e taxas operacionais vinculadas a uma carteira;
  - Motor financeiro determinístico em `Decimal` para cálculo de custo médio ponderado e PnL realizado;
  - Extrato de operações paginado com filtros avançados;
  - Visualização de posições e extrato de carteira específica na rota `/portfolios/[id]`.
- **Eventos Corporativos e Ações Societárias:**
  - Processamento auditável e idempotente de desdobramentos (`SPLIT`) e grupamentos (`GROUPING`);
  - Bonificações de ações (`BONUS_SHARE`) com custo atribuído opcional e recálculo de custo médio;
  - Proventos em dinheiro: dividendos isentos (`DIVIDEND`) e Juros sobre Capital Próprio (`JCP`) com retenção de IRRF;
  - Gestão de Direitos e Ofertas de Subscrição (`subscription_offers`, `subscription_rights`, `subscription_exercises`).
- **Dados de Mercado e Gráficos:**
  - Abstração `MarketDataProviderAdapter` e adaptadores manual (`ManualPayloadAdapter`) e mock (`MockProviderAdapter`);
  - Ingestão interna em lote para persistência em `market_quotes` e `exchange_rates`;
  - Gráficos de alocação patrimonial por ativo e por classe de ativo;
  - Histórico patrimonial e evolução temporal por carteira específica em `/portfolios/[id]` com tratamento de cotações ausentes/obsoletas e conversão cambial.

### 2.2. Capacidades Aprovadas, mas Não Entregues no MVP Atual

- Finalidades formais `REAL`, `ESTUDO` e `ANALISE` — Regra de produto aprovada, implementação pendente.
- Múltiplas carteiras `REAL` formalmente diferenciadas — Regra aprovada, atributo de finalidade pendente.
- Limite Free de 2 carteiras — Regra aprovada, enforcement pendente.
- Limite de 10 carteiras em planos superiores — Regra aprovada, enforcement pendente.
- Planos, assinaturas e entitlements — Planejados, não implementados.
- Downgrade com preservação e congelamento — Regra aprovada, implementação pendente.
- Dashboard contextual selecionável — Regra aprovada, contradita pelo comportamento atual do dashboard principal.
- Carteira padrão configurável — Planejada, não implementada.
- Comparação explícita entre carteiras — Planejada, não implementada.
- Custódia como entidade própria — Aprovada conceitualmente, implementação pendente.
- Saldo de caixa — Aprovado conceitualmente, implementação pendente.
- Relatórios tributários específicos — Parciais ou planejados.
- Integrações com provedores externos reais — Não implementadas ou não verificadas.
- Operações completas com opções — Planejadas, não implementadas.
- Cobertura completa de ativos internacionais e criptoativos — Planejada, não implementada integralmente.

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