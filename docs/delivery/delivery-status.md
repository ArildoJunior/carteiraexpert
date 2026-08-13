# Estado Atual do Projeto

## Última atualização

2026-08-13

## Estado geral

A fundação técnica e a camada de identidade, segurança e governança foram concluídas e testadas com sucesso:

- **Fase 01 (Foundation):** Concluída com as entregas dos Pacotes 01.01 e 01.02. A infraestrutura de banco de dados, o Decimal e a auditoria base estão validados.
- **Fase 02 (Identidade e Segurança):** Concluída com as entregas dos Pacotes 02.01 e 02.02. Os fluxos de cadastro, login com Argon2id, sessões em banco, controle de taxa, redefinição de senha atômica, logout auditado, consentimentos versionados LGPD *append-only* e o motor de verificação física de schema estão implementados e comprovados por testes automatizados.

Nenhuma funcionalidade de domínio financeiro (carteiras, ativos, cotações, importações ou IA editorial) foi implementada até o momento.

## Branch e versão

- **Branch de trabalho:** `feature/foundation-quality`
- **Último commit base:** `913ade3` (`fix: harden authentication consent and schema validation`)

## Stack definida

- Next.js (App Router, Server Components e Server Actions);
- React 19;
- TypeScript (Strict Mode);
- PostgreSQL;
- Drizzle ORM com driver `postgres.js`;
- Zod;
- Decimal (`decimal.js`) para cálculos financeiros;
- Vitest para testes unitários e de integração;
- Playwright para testes End-to-End (E2E);
- Biome para linting e formatação;
- Tailwind CSS;
- Radix UI;
- Recharts para dashboards;
- Armazenamento privado de documentos.

## ADRs aceitos

- ADR-001 — Monólito modular;
- ADR-002 — Carteira orientada a eventos;
- ADR-003 — Motor financeiro isolado;
- ADR-004 — Privacidade no plano compartilhado;
- ADR-005 — Governança de IA editorial;
- ADR-006 — Dados de mercado internos;
- ADR-007 — Importação revisável;
- ADR-008 — Adaptadores para provedores de dados.

## Concluído

### Fase 01 — Fundação Técnica

- **Pacote 01.01 — Estrutura, qualidade e testes**:
  - Configuração da estrutura modular do projeto em `src/modules`;
  - Configuração do Biome para linting e formatação;
  - Configuração do TypeScript em modo estrito;
  - Configuração do Vitest e do Playwright;
  - Configuração do pipeline de build do Next.js.

- **Pacote 01.02 — Banco, Decimal e auditoria base**:
  - Instalação e configuração do Drizzle ORM com PostgreSQL;
  - Centralização do `Decimal` (`decimal.js`) com bloqueio de tipos `float`/`real` para valores financeiros e persistência em `NUMERIC`;
  - Migration inicial com a tabela `audit_logs`;
  - Implementação de helper de auditoria imutável com allowlist e sanitização contra vazamento de segredos;
  - Testes unitários do Decimal e do sanitizador de auditoria.

### Fase 02 — Identidade, Acesso e Segurança

- **Pacote 02.01 — Cadastro, login, logout e sessão**:
  - Tabela `users` com hash Argon2id (parâmetros de tempo e memória alinhados às diretrizes OWASP), status e e-mail único;
  - Tabela `sessions` com tokens criptográficos SHA-256, TTL fixo de 7 dias, cookie `ce_session` com flags `HttpOnly`, `SameSite=Lax` e `Secure` estrito em produção;
  - Tabela `password_reset_tokens` com consumo atômico via PostgreSQL e expiração em 15 minutos;
  - Tabela `auth_rate_limits` com controle progressivo de tentativas via chaves HMAC-SHA256 derivadas de IP e e-mail;
  - Proteção CSRF com validação de origens e cabeçalhos de proxy reverso;
  - Logout com revogação física de sessão (`revoked_at`), exclusão segura de cookies e registro obrigatório de auditoria (`reason: 'user_requested'`);
  - Tratamento de exceções nas Server Actions com sanitização de logs e relançamento do `NEXT_REDIRECT`.

- **Pacote 02.02 — Consentimentos (LGPD), autorização e verificação de schema**:
  - Tabela `user_consents` protegida por trigger físico PostgreSQL (`enforce_append_only_user_consents`) que bloqueia `UPDATE` e `DELETE`;
  - Versionamento explícito de Termos de Uso, Política de Privacidade e Comunicações de Marketing;
  - Rota isolada `/terms-acceptance` para atualização de termos por usuários autenticados sem colisão com o layout de autenticação;
  - Proteção e enforçamento no `DashboardLayout` com redirecionamento automático de usuários com termos desatualizados;
  - Motor de validação física do catálogo do PostgreSQL (`inspectPhysicalSchema` e `assertSchemaCompatible`) validando tabelas, colunas, tipos, nulabilidade, chaves primárias, constraints únicas, defaults obrigatórios, chaves estrangeiras e triggers;
  - Script de migração (`scripts/migrate.ts`) com pre-flight check e trava de segurança exigindo `ALLOW_DATABASE_MUTATION=true` para execução no banco principal.

## Validações comprovadas no ambiente

Todos os itens abaixo foram executados e aprovados com 100% de sucesso:

- [x] `pnpm run typecheck` — 0 erros de tipagem TypeScript;
- [x] `pnpm run lint` — 0 violações no Biome linter;
- [x] `pnpm run test:unit` — 94/94 testes unitários aprovados (10 arquivos);
- [x] `pnpm run test:integration` — 32/32 testes de integração aprovados em PostgreSQL real (6 arquivos);
- [x] `pnpm run test:e2e` — 15/15 testes End-to-End aprovados com Playwright Chromium;
- [x] `pnpm run db:verify -- --test` — Schema físico do banco local validado conforme a Matriz Canônica (6 tabelas);
- [x] `pnpm run db:verify` — Schema físico do banco Neon validado conforme a Matriz Canônica (6 tabelas);
- [x] `pnpm run build` — Build de produção do Next.js gerado com sucesso (10 rotas estáticas e dinâmicas).

## Não iniciado

- Fase 03 — Carteiras e Ativos;
- Fase 04 — Operações e Transações;
- Fase 05 — Cálculo de Posição e Custo Médio;
- Fase 06 — Eventos Corporativos;
- Fase 07 — Dados de Mercado e Cotações;
- Fase 08 — Gráficos e Visualizações;
- Fase 09 — Importações de Documentos (CSV, XLSX, PDF);
- Fase 10 — Ativos Internacionais, Câmbio e Criptoativos;
- Fase 11 — Opções e Alertas;
- Fase 12 — Apoio Tributário, IA Editorial e Lançamento.

## Próxima entrega

**Fase 03 / Pacote 03.01 — Estrutura de Carteiras e Ativos**:
- Modelagem das entidades de carteira (`portfolios`) e posições;
- Criação de eventos canônicos de movimentação;
- Isolamento estrito de dados entre usuários e membros de planos compartilhados.

## Regras e princípios preservados

- A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens.
- O titular pagante de plano compartilhado não acessa nem infere dados financeiros dos demais membros.
- Todos os cálculos financeiros utilizam Decimal no código e persistência `NUMERIC` no PostgreSQL.
- Os dados importados são revisáveis e exigem confirmação explícita para gerar eventos financeiros.
- A IA é destinada exclusivamente ao apoio editorial interno com revisão humana mandatória antes de qualquer publicação.
