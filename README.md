# CarteiraExpert

O **CarteiraExpert** é um SaaS brasileiro de consolidação patrimonial, inteligência financeira e apoio à gestão de investimentos para ativos brasileiros, internacionais, moedas estrangeiras, criptoativos e opções.

> **Finalidade e limites inegociáveis:** A plataforma tem finalidade estritamente informativa, organizacional e educacional. A plataforma **NÃO** recomenda compra, venda, manutenção, rolagem ou estratégias de investimento, **NÃO** envia, intermedia ou executa ordens para corretoras, bancos ou exchanges, **NÃO** executa rolagens de opções, **NÃO** emite DARF ou realiza pagamentos e **NÃO** substitui profissionais habilitados. Cálculos financeiros são determinísticos e isolados, sem dependência de IA.

---

## Estado Atual do Projeto

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, auditoria imutável e infraestrutura de testes).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, recuperação de senha atômica, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais/customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação de coordenadores públicos e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture de tipos).
  - **Pacote 03.01-D — Carteiras, Ativos e Operações Manuais:** **ACEITO** (Camada de entrega manual: Server Actions autenticadas, rotas `/portfolios` e `/portfolios/[id]`, autocomplete debounced de ativos, cadastro de ativo customizado, lançamento manual de compras/vendas, cancelamento auditado com justificativa obrigatória e seed de desenvolvimento protegido).
  - **Pacote 03.02 — Motor de Posição, Custo Médio e Validação Temporal de Vendas:** **ACEITO** (Cálculo determinístico de posição e quantidade em custódia, custo médio ponderado por ativo incluindo taxas, custo total investido, resultado realizado por venda com dedução de taxas, rejeição atômica de vendas a descoberto, validação de consistência da linha do tempo para eventos retroativos e cancelamentos, proteção de concorrência com bloqueio pessimista `FOR UPDATE`, interface com blocos verticais e suíte completa de testes aprovada).
  - **Pacote 03.03 — Histórico e Dashboard Básico:** **PRONTO PARA HOMOLOGAÇÃO** (Consolidação patrimonial global SSR em `/dashboard`, segregação estrita por moeda base sem conversão fictícia, agregação de custo total investido em posições ativas, PnL realizado acumulado de vendas, taxas totais, contagem de ativos em custódia e carteiras ativas, feed unificado e cronológico de atividades recentes com nomes de carteiras e ativos, proteção estrita anti-IDOR e exclusão de soft deletes).

---

## Funcionalidades Implementadas

### 1. Identidade e Controle de Acesso
- **Cadastro de Usuários:** Validação robusta de dados via Zod e hashing de senhas via Argon2id (parâmetros de memória e tempo alinhados às diretrizes OWASP).
- **Login e Sessões:** Sessões persistidas na tabela `sessions` com tokens criptográficos SHA-256, TTL fixo de 7 dias, proteção contra enumeração de e-mails com hash dummy e anonimização de IP.
- **Cookies de Sessão:** Cookie `ce_session` com flags `HttpOnly`, `SameSite=Lax` e `Secure` obrigatório em produção.
- **Proteção Contra Força Bruta (Rate Limiting):** Tabela `auth_rate_limits` com bloqueio progressivo por chaves HMAC-SHA256 derivadas de IP e e-mail.
- **Recuperação de Senha Segura:** Tokens de uso único com expiração em 15 minutos e consumo transacional via PostgreSQL.
- **Logout Seguro e Auditado:** Revogação imediata da sessão no banco de dados (`revoked_at`), auditoria obrigatória em `audit_logs` (`reason: 'user_requested'`) e limpeza de cookies.

### 2. Governança e Consentimentos (LGPD)
- **Tabela `user_consents` Append-Only:** Trigger físico PostgreSQL (`enforce_append_only_user_consents`) que bloqueia `UPDATE` e `DELETE`.
- **Versionamento de Termos:** Suporte a versões independentes para Termos de Uso, Política de Privacidade e Comunicações de Marketing.
- **Enforçamento de Termos Vigentes:** Interceptação automática no `DashboardLayout` e redirecionamento para `/terms-acceptance` quando o usuário possuir termos desatualizados ou pendentes.

### 3. Carteiras, Ativos e Eventos Patrimoniais (Pacotes 03.00-E e 03.01-D)
- **Gestão de Carteiras via UI (`/portfolios`):** Criação, edição, listagem em grade e exclusão lógica auditada de carteiras por usuário.
- **Visão Detalhada da Carteira (`/portfolios/[id]`):** Cabeçalho com métricas da carteira, quadro de posições consolidadas em custódia, extrato cronológico de operações ativas e ações de lançamento.
- **Ativos Globais e Customizados:** Autocomplete debounced com busca server-side no lançamento de operações e modal para cadastro rápido de ativos customizados por usuário com ticker único.
- **Registro Manual de Operações:** Modal para lançamento de ordens de Compra (`BUY`) e Venda (`SELL`) com indicação em tempo real de quantidade disponível em custódia, datas de negociação/liquidação, quantidade, preço unitário, taxas e notas.
- **Cancelamento Auditado com Justificativa:** Cancelamento seguro com exclusão lógica (`deletedAt: NOW()`), motivo obrigatório (mínimo de 5 caracteres), validação de linha temporal e registro em `audit_logs`.
- **Isolamento Multiusuário e Proteção IDOR:** Bloqueio e auditoria de qualquer tentativa de acesso a carteiras, ativos, posições ou extratos de outros usuários.
- **Segregação Transacional e Injeção de Auditoria:** Arquitetura com separação estrita entre coordenadores e transações atômicas `...InTransaction`, com rollback físico comprovado no PostgreSQL.

### 4. Motor de Posições, Custo Médio e Validação Temporal (Pacote 03.02)
- **Cálculo Determinístico de Posição:** Quantidade acumulada em custódia calculada a partir do histórico de compras e vendas ativas.
- **Custo Médio Ponderado Unitário:** Incorporação automática de taxas e emolumentos no custo de aquisição ($CM = \frac{Custo_{total}}{Quantidade}$).
- **Apuração de Resultado Realizado ($PnL$):** Cálculo de lucro ou prejuízo realizado em cada operação de venda ($Receita_{liquida} - Custo_{base}$), abatendo taxas operacionais e preservando o custo médio unitário remanescente.
- **Validação Temporal de Vendas:** Rejeição atômica e rollback de vendas a descoberto ($Q_{venda} > Q_{disponível}$ na data de negociação).
- **Consistência da Linha do Tempo:** Rejeição de eventos retroativos fora de ordem ou cancelamento de compras antigas que invalidem vendas posteriores na linha do tempo.
- **Proteção Contra Concorrência:** Bloqueio pessimista no PostgreSQL (`FOR UPDATE`) para serialização de transações na carteira.

### 5. Histórico e Dashboard Básico Consolidado (Pacote 03.03)
- **Dashboard Consolidado SSR (`/dashboard`):** Visão geral patrimonial em Server Component com cálculo em tempo real e revalidação sob demanda.
- **Segregação por Moeda Base:** Agrupamento estrito de métricas por moeda (`BRL`, `USD`, `EUR`), sem conversão cambial fictícia.
- **Métricas Consolidadas:** Custo total de aquisição em custódia, PnL realizado acumulado de vendas, taxas acumuladas, contagem de ativos distintos e carteiras ativas.
- **Feed Unificado de Atividades Recentes:** Histórico cronológico multicarteiras de compras e vendas com identificação de carteira, ativo, datas, quantidades e taxas.
- **Exclusão de Soft Deletes:** Desconsideração estrita de eventos e carteiras canceladas/excluídas em todas as consultas e agregações.

### 6. Integridade de Schema, Contratos e Banco de Dados
- **Schema Guardian:** Validação física em tempo de execução (`assertSchemaCompatible`) e via CLI (`db:verify`) inspecionando o catálogo PostgreSQL (9 tabelas validadas).
- **Contratos Drizzle Tipados:** Exportação canônica de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor`, com eliminação de `any` em assinaturas e callbacks.
- **Fixture Estática de Tipos:** Arquivo `tests/types/database-contracts.test-d.ts` validando compatibilidade estrutural e rejeição em tempo de compilação via `@ts-expect-error`.
- **Migrações Versionadas:** Script de migração (`scripts/migrate.ts`) com pre-flight check e trava de segurança exigindo `ALLOW_DATABASE_MUTATION=true` para o banco principal.
- **Seed de Desenvolvimento Protegido:** Script `scripts/seed-dev.ts` com trava obrigatória `ALLOW_DEV_SEED=true` e bloqueio automático em produção.

---

## Stack Tecnológica

- **Framework:** Next.js 16 (App Router, Server Components e Server Actions)
- **Linguagem:** TypeScript (Strict Mode)
- **Banco de Dados:** PostgreSQL
- **ORM & Driver:** Drizzle ORM com driver `postgres.js`
- **Precisão Financeira:** `decimal.js` (persistência via `NUMERIC` no PostgreSQL)
- **Validação de Esquemas:** Zod
- **Criptografia & Autenticação:** Argon2id e `node:crypto`
- **Linter & Formatação:** Biome
- **Testes Unitários e Integração:** Vitest
- **Testes End-to-End (E2E):** Playwright (Chromium, Firefox e WebKit)
- **Estilização:** Tailwind CSS

---

## Estrutura do Projeto

```text
carteiraexpert/
├── drizzle/                     # Migrações versionadas SQL
│   └── migrations/
├── scripts/                     # Scripts de manutenção e infraestrutura
│   ├── migrate.ts               # Execução controlada de migrações
│   ├── seed-dev.ts              # Seed determinístico de desenvolvimento (protegido)
│   └── verify-schema.ts         # Inspeção física do catálogo PostgreSQL
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Rotas públicas (login, register, forgot-password, reset-password)
│   │   ├── (dashboard)/         # Área autenticada protegida com verificação de termos
│   │   │   ├── dashboard/       # Dashboard principal com resumo de carteiras
│   │   │   └── portfolios/      # Listagem (/portfolios) e detalhes (/portfolios/[id])
│   │   ├── terms-acceptance/    # Tela isolada de consentimentos pendentes
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   └── db/                  # Cliente PostgreSQL, contratos canônicos, auditoria, schemas e verify-schema
│   │       ├── schema/          # Schemas Drizzle (identity, portfolio, audit)
│   │       ├── audit.ts         # Auditoria imutável com AuditExecutor tipado
│   │       ├── index.ts         # Contratos canônicos (Database, DatabaseTransaction, DbExecutor, etc.)
│   │       └── verify-schema.ts # Motor Schema Guardian
│   ├── middleware.ts            # Proteção de rotas no Edge
│   └── modules/
│       ├── identity/            # Módulo de identidade, segurança e consentimento
│       │   ├── domain/          # Entidades, esquemas Zod e contratos de usuário/consentimento
│       │   ├── server/          # Serviços de autenticação, rate limit, sessões e consentimento
│       │   └── ui/              # Componentes de autenticação
│       └── portfolio/           # Módulo de carteiras, ativos, posições e eventos patrimoniais
│           ├── domain/          # Motor puro de posições (position-engine.ts) e schemas
│           ├── server/          # Serviços (position.service.ts) e Server Actions (portfolio.actions.ts)
│           └── ui/              # Componentes (PositionTable, PortfolioDetailView, TransactionModal, etc.)
├── tests/
│   ├── unit/                    # Testes unitários puros (motor de posição, schemas, validações)
│   ├── integration/             # Testes de integração com PostgreSQL real (posições, atomicidade, IDOR, rollback)
│   └── types/                   # Fixtures de tipagem estática (database-contracts.test-d.ts)
├── e2e/                         # Testes end-to-end com Playwright (Chromium, Firefox, WebKit)
└── docs/                        # Documentação técnica, arquitetura, ADRs e status de entrega
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com base nas seguintes variáveis:

| Variável | Descrição | Obrigatório |
| :--- | :--- | :--- |
| `DATABASE_URL` | String de conexão com o PostgreSQL principal (desenvolvimento/produção). | Sim |
| `DATABASE_URL_TEST` | String de conexão dedicada para o banco de testes automatizados (isolado). | Sim (para testes) |
| `AUTH_SECRET` | Chave secreta de alta entropia para derivação de tokens e sessões. | Sim (em produção) |
| `AUTH_RATE_LIMIT_SECRET` | Chave secreta para cálculo de hash HMAC-SHA256 no limitador de taxa. | Sim (em produção) |
| `ALLOWED_ORIGINS` | Lista de origens permitidas separadas por vírgula para proteção CSRF. | Sim |
| `TRUSTED_PROXIES` | Lista de IPs de proxies reversos confiáveis para extração de cabeçalhos de IP do cliente. | Opcional |
| `ALLOW_DATABASE_MUTATION` | Defina como `true` para autorizar migrações na `DATABASE_URL` principal. | Sim (ao migrar) |
| `ALLOW_DEV_SEED` | Defina como `true` para autorizar a execução do seed de desenvolvimento. | Opcional em dev |
| `SECURE_COOKIES` | Em `development`, defina como `true` para forçar o atributo `Secure`. | Opcional em dev |
| `NODE_ENV` | Modo de execução (`development`, `production` ou `test`). | Automático |

---

## Comandos Disponíveis

```bash
# Desenvolvimento e Build
pnpm install          # Instalar dependências
pnpm dev              # Iniciar servidor de desenvolvimento
pnpm build            # Compilar para produção
pnpm start            # Iniciar servidor de produção

# Qualidade e Tipagem
pnpm typecheck        # Verificação de tipos TypeScript (inclui fixtures)
pnpm lint             # Executar linter (Biome)
pnpm lint:fix         # Corrigir problemas de lint automaticamente
pnpm format:fix       # Verificar e aplicar formatação

# Testes
pnpm test:unit        # Testes unitários (Vitest)
pnpm test:integration # Testes de integração com PostgreSQL (Vitest)
pnpm test:e2e         # Testes End-to-End no Chromium, Firefox e WebKit (Playwright)

# Banco de Dados e Migrações
pnpm db:verify        # Inspecionar catálogo físico no banco principal
pnpm db:verify -- --test # Inspecionar catálogo físico no banco de testes
pnpm db:migrate       # Executar migrações no banco principal (exige ALLOW_DATABASE_MUTATION=true)
pnpm db:migrate -- --test # Executar migrações no banco de testes
pnpm db:seed:dev      # Popular ativos de teste (exige ALLOW_DEV_SEED=true)
```

---

## Limitações e Escopo Fora do Pacote 03.02

1. **Saldo de Caixa da Carteira:** Depósitos, retiradas, liquidação financeira em conta corrente e saldo monetário da carteira permanecem fora do escopo.
2. **Marcação a Mercado e Rentabilidade Não Realizada:** Integração com cotações externas em tempo real, variação patrimonial não realizada e gráficos de rentabilidade permanecem fora do escopo.
3. **Eventos Corporativos e Provedores Externos:** Módulos de proventos, splits, grupamentos e integração com APIs de mercado (BRAPI, HG Brasil, B3, CVM) permanecem fora do escopo.
4. **IA Editorial Interna:** Módulo editorial com apoio de IA e revisão humana mandatória previsto para fases futuras.
