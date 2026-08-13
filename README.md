# CarteiraExpert

O **CarteiraExpert** é um SaaS brasileiro de consolidação patrimonial, inteligência financeira e apoio à gestão de investimentos para ativos brasileiros, internacionais, moedas estrangeiras, criptoativos e opções.

> **Finalidade e limites inegociáveis:** A plataforma é estritamente informativa, organizacional e educacional. A plataforma **NÃO** recomenda compra, venda ou rolagem de ativos, **NÃO** envia ordens a corretoras ou exchanges, **NÃO** emite DARF ou realiza pagamentos e **NÃO** substitui profissionais habilitados. Cálculos financeiros são determinísticos e isolados, sem dependência de IA.

---

## Estado Atual do Projeto

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, auditoria imutável e testes).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída e auditada (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, recuperação de senha atômica, consentimentos versionados LGPD *append-only* e motor de validação física de schema).
- **Fase 03 — Carteiras e Ativos:** Próxima fase planejada.

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

### 3. Integridade de Schema e Banco de Dados
- **Schema Guardian:** Validação física em tempo de execução (`assertSchemaCompatible`) e via CLI (`db:verify`) que inspeciona tabelas, colunas, tipos, nulabilidade, chaves primárias, constraints únicas, defaults obrigatórios, chaves estrangeiras e triggers.
- **Migrações Versionadas com Trava de Segurança:** Script de migração (`scripts/migrate.ts`) com pre-flight check e exigência explícita de `ALLOW_DATABASE_MUTATION=true` para execução no banco principal.

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
│   │   └── db/                  # Cliente PostgreSQL, auditoria, schemas e verify-schema
│   ├── middleware.ts            # Proteção de rotas no Edge
│   └── modules/
│       └── identity/            # Módulo de domínio de identidade, segurança e consentimento
│           ├── domain/          # Entidades, esquemas Zod e contratos
│           ├── server/          # Serviços de autenticação, rate limit, sessões e consentimento
│           └── ui/              # Componentes de formulário React 19
├── tests/
│   ├── unit/                    # Testes unitários puros
│   └── integration/             # Testes de integração com PostgreSQL real
├── e2e/                         # Testes end-to-end com Playwright
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
| `TRUSTED_PROXIES` | Lista de IPs de proxies reversos confiáveis para extração de cabeçalhos de IP. | Opcional |
| `ALLOW_DATABASE_MUTATION` | Defina como `true` para autorizar migrações na `DATABASE_URL` principal. | Sim (ao migrar) |
| `SECURE_COOKIES` | Força o atributo `Secure` em cookies HTTP (`true` / `false`). | Opcional em dev |
| `NODE_ENV` | Modo de execução (`development`, `production` ou `test`). | Automático |

---

## Comandos Disponíveis

### Instalação e Desenvolvimento

```bash
# Instalar dependências
pnpm install

# Iniciar servidor de desenvolvimento
pnpm dev

# Compilar para produção
pnpm build

# Iniciar servidor de produção
pnpm start
```

### Qualidade e Tipagem

```bash
# Verificação de tipos TypeScript
pnpm typecheck

# Executar linter (Biome)
pnpm lint

# Corrigir problemas de lint automaticamente
pnpm lint:fix

# Verificar e aplicar formatação
pnpm format:fix
```

### Testes

```bash
# Testes unitários
pnpm test:unit

# Testes de integração (requer PostgreSQL em DATABASE_URL_TEST)
pnpm test:integration

# Testes End-to-End (Playwright)
pnpm test:e2e
```

### Banco de Dados e Migrações

```bash
# Inspecionar e validar conformidade do schema físico no banco principal
pnpm db:verify

# Inspecionar e validar conformidade do schema físico no banco de testes
pnpm db:verify -- --test

# Executar migrações versionadas no banco principal (exige ALLOW_DATABASE_MUTATION=true)
pnpm db:migrate

# Executar migrações versionadas no banco de testes
pnpm db:migrate -- --test
```

---

## Limitações e Próximos Passos

1. **Domínio Financeiro:** O cadastro de carteiras, consolidação de posições, cálculo de custo médio e cotações ainda não foram iniciados (previstos a partir da Fase 03).
2. **IA Editorial:** Módulo editorial em rascunho com apoio de IA e revisão humana mandatória ainda não iniciado (previsto para fase posterior).
3. **Isolamento Multiusuário:** A estrutura de titular pagante e membros em planos compartilhados mantém isolamento estrito de dados garantido por arquitetura desde a camada de banco.
