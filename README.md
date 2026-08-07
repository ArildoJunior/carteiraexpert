# carteiraexpert

> Sistema de Controle de Investimentos e Patrimônio — plataforma SaaS para consolidação e análise de investimentos para o investidor pessoa física brasileiro.

## Visão geral

O carteiraexpert organiza contas, ativos, posições e movimentações, oferece consolidação de carteira e acompanha cotações, benchmarks e evolução patrimonial. A plataforma também possui importação manual de dados de corretoras por CSV/XLSX e base documental preparada para análise editorial e storage em Vercel Blob.

## Status atual

- Capítulos 1 a 9A concluídos.
- RBAC e permissões documentais concluídos no commit `83a8bb1`.
- Branch `main` sincronizada com `origin/main`.
- CI/GitHub Actions verde no fechamento do incremento.
- 19 permissões RBAC e 59 vínculos persistidos no banco.
- Próximo incremento: rota protegida de upload documental com validação, hash, storage e auditoria.

## Stack

- **Next.js 16.2.10** — App Router
- **React 19**
- **TypeScript** estrito
- **Tailwind CSS v4** — configuração CSS-first
- **Drizzle ORM** + **Neon Postgres**
- **Vercel Blob 2.7.0** — storage documental preparado
- **pnpm 9.12.3** + **Node.js 22**
- **Biome** — lint e formatação
- **Vitest** — testes unitários e de integração
- **Playwright** — testes E2E
- **Husky** + **lint-staged**
- **GitHub Actions** — CI
- **Inngest** — jobs de atualização e processamento

## Pré-requisitos

- Node.js 22
- pnpm 9+
- PostgreSQL compatível; o ambiente principal usa Neon Postgres
- Variáveis de ambiente configuradas
- Para desenvolvimento no Windows, nvm-windows é recomendado

## Setup local

```powershell
nvm use 22
pnpm install
Copy-Item .env.example .env
```

Preencha o `.env` com pelo menos:

```dotenv
DATABASE_URL="postgresql://..."
```

Para os recursos documentais preparados:

```dotenv
BLOB_READ_WRITE_TOKEN="..."
BLOB_STORE_ID="..."
```

Aplique as migrations e, quando necessário, os dados de desenvolvimento:

```powershell
pnpm drizzle-kit migrate
pnpm seed:rbac
pnpm seed:demo
```

Inicie a aplicação:

```powershell
pnpm dev
```

Aplicação disponível em [http://localhost:3000](http://localhost:3000).

## Usuário demo

O seed de demonstração cria ou atualiza um usuário para desenvolvimento:

- Login: `demo@carteiraexpert.com`
- Senha: `demo1234`

Não use essas credenciais em ambientes compartilhados ou de produção.

## Scripts principais

| Comando | Função |
| --- | --- |
| `pnpm dev` | Inicia o Next.js em `:3000` |
| `pnpm build` | Gera o build de produção |
| `pnpm start` | Executa o build de produção |
| `pnpm lint` | Verifica o projeto com Biome |
| `pnpm lint:fix` | Aplica correções automáticas do Biome |
| `pnpm format` | Formata o projeto com Biome |
| `pnpm typecheck` | Executa a verificação TypeScript |
| `pnpm test` | Executa a suite Vitest uma vez |
| `pnpm test:e2e` | Executa os testes E2E com Playwright |
| `pnpm drizzle-kit migrate` | Aplica migrations pendentes |
| `pnpm db:push` | Sincroniza o schema diretamente com o banco; use apenas quando apropriado |
| `pnpm db:studio` | Abre o Drizzle Studio em `:4983` |
| `pnpm seed:rbac` | Cria ou valida roles, permissões e vínculos RBAC |
| `pnpm validate:rbac` | Confere contagens, matriz e schema RBAC |
| `pnpm seed:demo` | Popula dados demonstrativos |

## Validação completa antes de commit

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
git diff --check
```

Para validar especificamente o RBAC:

```powershell
pnpm seed:rbac
pnpm validate:rbac
pnpm vitest run tests/unit/enums.test.ts
pnpm vitest run tests/integration/role-permission-matrix.test.ts
pnpm vitest run tests/integration/can-matrix.test.ts
pnpm vitest run tests/integration/rbac-no-legacy-usage.test.ts
```

Validação registrada no último incremento:

- 58 arquivos de teste e 336 testes aprovados;
- 15 testes E2E aprovados e 2 ignorados;
- lint, typecheck e build aprovados;
- migrations aplicadas;
- seed RBAC com 4 roles, 19 permissões e 59 vínculos.

## Funcionalidades concluídas

### Autenticação e segurança

- Auth.js v5 com Credentials e Google opcional.
- Argon2id, recuperação de senha, verificação de e-mail e TOTP.
- Códigos de recuperação e middleware de proteção de rotas.
- RBAC com permissões explícitas e cache TTL de 60 segundos.
- Auditoria de operações relevantes.

### Carteira e patrimônio

- Contas de corretora, ativos, posições e transações.
- Custo médio, lucro/prejuízo, rentabilidade e consolidação.
- Soft delete para preservação de histórico.
- Dashboard com overview, evolução, alocação, movers e heatmap.
- Benchmarks, CDI e snapshots de carteira.

### Cotações

- Providers Brapi e CoinGecko.
- Cascata de fallback.
- Ações brasileiras, FIIs, ETFs, BDRs, ações americanas, cripto, câmbio e indicadores.
- Leitura dos consumidores exclusivamente pelo banco em `asset_quotes`.
- Jobs Inngest para atualização.

### Importação manual

- Importação por CSV e XLSX.
- Parsers de encoding, números, datas, CSV e XLSX.
- Preview, revisão, aprovação e rejeição de itens.
- Hash canônico, advisory lock e deduplicação.
- APIs e páginas de integrações.

### Documentos

- Tabelas `documents`, `document_analyses` e `ai_costs`.
- Hash de conteúdo para deduplicação e cache.
- Análises versionadas por documento.
- `blob_url` e dependência Vercel Blob preparados.
- Permissões editoriais: `documents.read`, `documents.write`, `documents.delete`, `documents.review` e `documents.publish`.
- Rota de upload protegida ainda planejada para o próximo incremento.

## Estrutura principal

```text
src/
├── app/                    # App Router, páginas e APIs
├── components/             # Componentes React reutilizáveis
└── lib/                    # Auth, RBAC, domínio, integrações e utilitários

db/
├── schema/                 # Schemas Drizzle
└── migrations/             # Migrations SQL e metadados

scripts/                    # Seeds e validações operacionais
tests/
├── unit/                   # Testes unitários
├── integration/            # Testes de integração
└── e2e/                    # Testes Playwright
```

## Rotas principais

- `/login`
- `/cadastro`
- `/dashboard`
- `/carteira`
- `/contas`
- `/posicoes`
- `/movimentacoes`
- `/imports`
- `/integracoes`
- `/dev/components`

As APIs versionadas ficam em `src/app/api/v1`, incluindo autenticação, contas, posições, transações, cotações, dashboard, brokers e importações.

## Documentação adicional

- `src/lib/rbac/USAGE.md` — guia de autorização com `requirePermission`.
- `CHECKPOINT.MD` — histórico dos capítulos, decisões, commits e validações.

## Decisões importantes

- A interface e os consumidores internos não chamam providers externos diretamente; a leitura ocorre em `asset_quotes`.
- A importação manual substituiu OAuth para corretoras no pré-lançamento.
- O documento é imutável; análises são versionadas.
- O hash do conteúdo é a chave de deduplicação documental.
- `users.role` não é usado para autorização nos call sites de produção; a autorização canônica ocorre pelo RBAC.

## Licença

Privado — todos os direitos reservados.
