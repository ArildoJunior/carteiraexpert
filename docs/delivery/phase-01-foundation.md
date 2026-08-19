# Fase 01 — Fundação Técnica

## Objetivo

Criar uma base segura, padronizada, determinística e testável antes de desenvolver regras de negócio financeiras.

## Pacote 01.01 — Estrutura e Qualidade

### Incluído e Comprovado

- Estrutura de monólito modular em `src/modules/`;
- TypeScript estrito (`strict: true`, sem `any` implícito);
- Biome para linting e formatação automatizada de código;
- Vitest para testes unitários e de integração;
- Playwright para testes ponta a ponta (E2E) cross-browser;
- Validação de variáveis de ambiente com schemas tipados;
- Hierarquia padronizada de tratamento de erros de domínio;
- Alias de imports padronizados (`@/`);
- Documentação inicial de arquitetura e produto.

### Fora do Escopo deste Pacote

- Regras de negócio de carteira;
- Autenticação de usuários;
- Interface de usuário final;
- Operações financeiras.

### Critérios de Aceite

- [x] `pnpm lint` / `biome check` executa com zero violações;
- [x] `pnpm typecheck` / `tsc --noEmit` executa sem erros estáticos;
- [x] `pnpm test` executa suítes de testes automatizados com sucesso;
- [x] `pnpm test:e2e` possui testes de saúde e validação funcional;
- [x] `pnpm build` / `next build` compila com sucesso;
- [x] Estrutura modular isolada criada;
- [x] Documentos e diretrizes do projeto configurados.

## Pacote 01.02 — Banco, Decimal e Auditoria Base

### Incluído e Comprovado

- Banco de dados relacional PostgreSQL configurado;
- Drizzle ORM configurado com migrações versionadas;
- Biblioteca `Decimal` padronizada e centralizada em todos os cálculos matemáticos financeiros;
- Convenção obrigatória de persistência de valores financeiros via tipo `NUMERIC`;
- Tabela `audit_logs` para registro de alterações e eventos nos fluxos que utilizam o mecanismo de auditoria;
- Estratégia de timestamps UTC padronizada (`TIMESTAMPTZ`);
- Testes de persistência e validação de precisão matemática com `Decimal`.

### Fora do Escopo deste Pacote

- Entidades de carteira e ativos;
- Autenticação e sessão de usuários;
- Cobrança e planos comerciais.

### Critérios de Aceite

- [x] Migrações iniciais executam no PostgreSQL real de forma reprodutível;
- [x] Tabela `audit_logs` criada e integrada aos serviços auditados;
- [x] Uso da biblioteca `Decimal` centralizado e sem uso de `number` para valores monetários;
- [x] Testes unitários e de integração cobrindo precisão e serialização de `Decimal` aprovados.