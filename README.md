# carteiraexpert

> Sistema de Controle de Investimentos e Patrimônio — plataforma SaaS para
> consolidação e análise de investimentos para o investidor pessoa física brasileiro.

## Stack

- **Next.js 16** (App Router) + **React 19.1**
- **TypeScript** estrito
- **Tailwind CSS v4** (CSS-first, sem tailwind.config.ts)
- **Drizzle ORM** + **Neon Postgres**
- **pnpm 9** + **Node 20 LTS**
- **Biome** (linter + formatter)
- **Husky** + **lint-staged**
- **GitHub Actions** (CI)

## Setup local

Pré-requisitos: Node 20+, pnpm 9+, conta Neon (free tier).
powershell nvm use
pnpm install copy .env.example .env
pnpm db:push pnpm dev

App disponível em http://localhost:3000.

## Scripts

| Comando | Função |
| --- | --- |
| `pnpm dev` | Sobe Next.js em :3000 |
| `pnpm build` | Build de produção |
| `pnpm start` | Roda build de produção |
| `pnpm lint` | Biome check |
| `pnpm lint:fix` | Biome check + fix automático |
| `pnpm format` | Biome format |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Vitest (unit) |
| `pnpm db:push` | Sincroniza schema com banco |
| `pnpm db:studio` | Abre Drizzle Studio em :4983 |

## Estrutura
src/ ├── app/

Rotas (App Router)
├── components/

Componentes React
├── lib/

Utilitários, env, logger
└── …

db/ ├── schema/

Schemas Drizzle
└── migrations/

Migrations geradas
tests/ ├── unit/

Testes unitários
└── e2e/

Testes E2E (Playwright)

## Status atual

- Capítulo 1 — Stack e bootstrap

## Licença

Privado — todos os direitos reservados.