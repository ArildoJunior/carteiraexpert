# CarteiraExpert

O **CarteiraExpert** é um SaaS brasileiro de consolidação patrimonial, inteligência financeira e apoio à gestão de investimentos para ativos brasileiros, internacionais, moedas estrangeiras, criptoativos e opções.

> **Finalidade e limites inegociáveis:** A plataforma tem finalidade estritamente informativa, organizacional e educacional. A plataforma **NÃO** recomenda compra, venda, manutenção, rolagem ou estratégias de investimento, **NÃO** envia, intermedia ou executa ordens para corretoras, bancos ou exchanges, **NÃO** executa rolagens de opções, **NÃO** emite DARF ou realiza pagamentos e **NÃO** substitui profissionais habilitados. Cálculos financeiros são determinísticos e isolados, sem dependência de IA.

---

## Estado Atual do Projeto

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, auditoria imutável e infraestrutura de testes).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, recuperação de senha atômica, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais/customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação de coordenadores públicos e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture de tipos).
- **Pacote 03.01-D:** **BLOQUEADO** (Aguardando próxima etapa formal de planejamento e autorização).

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

### 3. Carteiras, Ativos e Eventos Patrimoniais (Pacote 03.00-E)
- **Carteiras (`portfolios`):** Cadastro, listagem isolada por usuário, atualização de metadados e soft delete auditado.
- **Ativos Globais e Customizados (`assets`):** Suporte a ativos globais de mercado (B3, NYSE, NASDAQ, Crypto) e ativos customizados criados por usuários, com constraint de unicidade (`idx_assets_user_ticker_market`) e conversão para `DuplicateAssetError`.
- **Eventos Patrimoniais (`portfolio_events`):** Registro de movimentações (BUY, SELL, DIVIDEND, JCP, SPLIT, CONSOLIDATION, BONUS, TRANSFER_IN, TRANSFER_OUT, OTHER) com validação temporal (`tradeDate`, `settlementDate`), precisão decimal estrita, cancelamento auditado com soft delete e motivo obrigatório.
- **Isolamento Multiusuário e Proteção IDOR:** Validação rigorosa de propriedade no servidor com auditoria de tentativas indevidas de acesso cruzado (`FORBIDDEN_IDOR_ATTEMPT`).
- **Segregação Transacional e Injeção de Auditoria:** Separação entre coordenadores públicos (que recebem `database: Database = db`) e operações transacionais `...InTransaction` (que recebem `tx: DatabaseTransaction`), com injeção tipada de `auditLogger` para garantia física de rollback.

### 4. Integridade de Schema, Contratos e Banco de Dados
- **Schema Guardian:** Validação física em tempo de execução (`assertSchemaCompatible`) e via CLI (`db:verify`) inspecionando o catálogo PostgreSQL (9 tabelas validadas).
- **Contratos Drizzle Tipados:** Exportação canônica de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor`, com eliminação de `any` em assinaturas e callbacks.
- **Fixture Estática de Tipos:** Arquivo `tests/types/database-contracts.test-d.ts` validando compatibilidade estrutural e rejeição em tempo de compilação via `@ts-expect-error`.
- **Migrações Versionadas:** Script de migração (`scripts/migrate.ts`) com pre-flight check e trava de segurança exigindo `ALLOW_DATABASE_MUTATION=true` para o banco principal.

---

## Stack Tecnológica

- **Framework:** Next.js (App Router, Server Components e Server Actions)
- **Linguagem:** TypeScript (Strict Mode)
- **Banco de Dados:** PostgreSQL
- **ORM & Driver:** Drizzle ORM com driver `postgres.js`
- **Precisão Financeira:** `decimal.js` (persistência via `NUMERIC` no PostgreSQL)
- **Validação de Esquemas:** Zod
- **Criptografia & Autenticação:** Argon2id e `node:crypto`
- **Linter & Formatação:** Biome
- **Testes Unitários e Integração:** Vitest
- **Testes End-to-End (E2E):** Playwright
- **Estilização:** Tailwind CSS

---

## Estrutura do Projeto

```text
carteiraexpert/
├── drizzle/                     # Migrações versionadas SQL
│   └── migrations/
├── scripts/                     # Scripts de manutenção e infraestrutura
│   ├── migrate.ts               # Execução controlada de migrações
│   └── verify-schema.ts         # Inspeção física do catálogo PostgreSQL
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Rotas públicas (login, register, forgot-password, reset-password)
│   │   ├── (dashboard)/         # Área autenticada protegida com verificação de termos
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
│       └── portfolio/           # Módulo de carteiras, ativos e eventos patrimoniais
│           ├── domain/          # Schemas Zod de portfolios, assets e portfolio_events
│           └── server/          # Serviços (portfolio.service, asset.service, portfolio-event.service)
├── tests/
│   ├── unit/                    # Testes unitários puros (schemas, lógica, validações)
│   ├── integration/             # Testes de integração com PostgreSQL real (atomicidade, IDOR, rollback)
│   └── types/                   # Fixtures de tipagem estática (database-contracts.test-d.ts)
├── e2e/                         # Testes end-to-end com Playwright
└── docs/                        # Documentação técnica, arquitetura, ADRs e status de entrega
```

---

## Validações e Testes Comprovados

Todos os comandos de validação foram executados e aprovados com sucesso:

| Validação | Comando / Escopo | Resultado |
| :--- | :--- | :---: |
| **Typecheck** | `pnpm run typecheck` (`tsc --noEmit`) | **Aprovado** (0 erros, inclui fixture de tipos) |
| **Lint** | `pnpm run lint` (`biome lint ./src`) | **Aprovado** (0 violações) |
| **Testes Unitários** | `pnpm run test:unit` (`vitest run --exclude "tests/integration/**"`) | **Aprovado** (17 arquivos, 222 testes) |
| **Testes de Integração** | `pnpm run test:integration` (`vitest run tests/integration`) | **Aprovado** (10 arquivos, 90 testes com PostgreSQL) |
| **Build de Produção** | `pnpm run build` (`next build`) | **Aprovado** (rotas compiladas) |
| **Testes End-to-End** | Playwright Chromium | **Aprovado** (90 testes aprovados no total: 45 + 15 + 15 + 15) |
| **Inspeção Física do Schema** | `pnpm run db:verify -- --test` | **Aprovado** (9 tabelas físicas validadas) |

### Tabelas Físicas Validadas no PostgreSQL (9 tabelas):
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

## Evidências Comprovadas de Integridade e Rollback

Os testes automatizados de integração comprovam deterministicamente:

1. **Rollback físico na criação de carteira:** Quando a auditoria falha, a transação é abortada e a carteira não é persistida no PostgreSQL (`portfolios`).
2. **Rollback físico na criação de ativo customizado:** Falha de auditoria impede a persistência do ativo (`assets`).
3. **Rollback físico na criação de evento patrimonial:** Falha de auditoria aborta a inserção do evento (`portfolio_events`).
4. **Rollback no fluxo de identidade:** Aborto atômico de usuário, sessão, consentimentos e auditoria em caso de erro na transação.
5. **Uso de `auditLogger` injetado:** Funções aceitam a dependência injetada tipada como `typeof insertAuditLog`.
6. **Chamada da dependência injetada:** Comprovada execução com `toHaveBeenCalledTimes(1)`.
7. **Repasse de `DatabaseTransaction`:** A mesma instância `tx` recebida pelas funções `...InTransaction` é repassada ao `auditLogger` (`failingAuditLogger.mock.calls[0][3] === capturedTx`).
8. **Não instanciação de transações aninhadas:** Funções `...InTransaction` não iniciam transação própria e operam estritamente no `tx` recebido.
9. **Contratos estáticos validados:** `tests/types/database-contracts.test-d.ts` valida em compilação a correta atribuição de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor`, rejeitando tipos inválidos via `@ts-expect-error`.

---

## Avisos Não Bloqueantes Observados

Durante a execução das validações, os seguintes avisos informativos não impeditivos foram registrados pelo ambiente:
- **Convenção `middleware`:** O build do Next.js emite aviso informativo de depreciação da convenção `middleware`, recomendando futura migração para `proxy`.
- **Módulo `punycode`:** O runtime Node.js emite aviso de depreciação do módulo interno `punycode` durante a execução do Biome linter.
- **Variável `NODE_ENV`:** Uso de valor de ambiente não convencional durante a execução da suíte de testes E2E.

Nenhum desses avisos causa falha ou representa bloqueio para a operação do sistema.

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
| `TRUSTED_PROXIES` | Lista de IPs de proxies reversos confiáveis para extração de cabeçalhos de IP do cliente (para fins de auditoria/rate limiting). | Opcional |
| `ALLOW_DATABASE_MUTATION` | Defina como `true` para autorizar migrações na `DATABASE_URL` principal. | Sim (ao migrar) |
| `SECURE_COOKIES` | Em `development`, defina como `true` para forçar o atributo `Secure` (ex.: com TLS local). Em `production`, o padrão seguro é sempre `secure=true`. | Opcional em dev |
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
pnpm test:e2e         # Testes End-to-End (Playwright)

# Banco de Dados e Migrações
pnpm db:verify        # Inspecionar catálogo físico no banco principal
pnpm db:verify -- --test # Inspecionar catálogo físico no banco de testes
pnpm db:migrate       # Executar migrações no banco principal (exige ALLOW_DATABASE_MUTATION=true)
pnpm db:migrate -- --test # Executar migrações no banco de testes
```

---

## Limitações e Próximos Passos

1. **Consolidação e Posições (Pacotes futuros da Fase 03):** O cálculo de custo médio, consolidação patrimonial e posição atualizada por carteira dependem dos pacotes subsequentes (Pacote 03.01-D e seguintes, atualmente bloqueados).
2. **Eventos Corporativos e Cotações:** Módulos de splits, grupamentos, bonificações e adaptadores de mercado estão planejados para fases posteriores.
3. **IA Editorial Interna:** Módulo editorial em rascunho com apoio de IA e revisão humana mandatória ainda não iniciado (previsto para fase posterior).
4. **Isolamento Multiusuário:** A estrutura de titular pagante e membros em planos compartilhados mantém isolamento estrito de dados garantido por arquitetura desde a camada de banco de dados.
