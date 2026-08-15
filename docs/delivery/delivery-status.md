# Estado Atual do Projeto

## Última atualização

2026-08-15

---

## Estado Geral

A fundação técnica, a camada de identidade, segurança, governança e o núcleo de carteiras, ativos e eventos patrimoniais foram concluídos e testados com sucesso:

- **Fase 01 — Fundação Técnica:** Concluída (Arquitetura modular, motor financeiro baseado em `Decimal`, persistência `NUMERIC`, auditoria imutável e testes de infraestrutura).
- **Fase 02 — Identidade, Acesso e Segurança:** Concluída (Cadastro, login com Argon2id, sessões em banco com SHA-256, controle de taxa com HMAC-SHA256, redefinição atômica de senha, logout auditado, consentimentos versionados LGPD *append-only* e motor de verificação física de schema).
- **Fase 03 — Carteiras, Ativos e Posições:**
  - **Pacote 03.00-E — Carteiras, Ativos, Eventos e Qualidade:** **ACEITO** (Modelagem de carteiras, ativos globais e customizados, eventos patrimoniais, contratos canônicos Drizzle tipados sem `any`, segregação entre coordenadores e funções `...InTransaction`, injeção explícita de `auditLogger`, isolamento multiusuário, proteção contra IDOR e fixture estática de contratos).
  - **Pacote 03.01-D:** **BLOQUEADO** (Aguardando autorização explícita para início do planejamento e execução).

---

## Componentes Entregues no Pacote 03.00-E

1. **Carteiras (`portfolios`):**
   - Criação (`createPortfolio`), listagem (`listPortfolios`), consulta por ID (`getPortfolioById`), atualização (`updatePortfolio`) e soft delete (`deletePortfolio`);
   - Coordenadores públicos com segregação de operações atômicas (`createPortfolioInTransaction`, `updatePortfolioInTransaction`, `deletePortfolioInTransaction`).
2. **Ativos Globais e Customizados (`assets`):**
   - Busca unificada (`searchAssets`), consulta por ID (`getAssetById`), criação de ativos customizados (`createCustomAsset` / `createCustomAssetInTransaction`) e listagem (`listCustomAssets`);
   - Tratamento da constraint física `idx_assets_user_ticker_market` com conversão para `DuplicateAssetError`.
3. **Eventos Patrimoniais (`portfolio_events`):**
   - Lançamento de eventos (`createPortfolioEvent` / `createPortfolioEventInTransaction`) com tipos canônicos (BUY, SELL, DIVIDEND, JCP, SPLIT, CONSOLIDATION, BONUS, TRANSFER_IN, TRANSFER_OUT, OTHER);
   - Listagem ordenada (`listPortfolioEventsByPortfolio`), consulta por ID (`getPortfolioEventById`) e cancelamento auditado com motivo (`cancelPortfolioEvent` / `cancelPortfolioEventInTransaction`).
4. **Isolamento de Dados e Proteção contra IDOR:**
   - Validação de propriedade no servidor com registro obrigatório de auditoria para tentativas de acesso indevido (`FORBIDDEN_IDOR_ATTEMPT`).
5. **Tipagem e Contratos Canônicos Drizzle:**
   - Definição estrita de `Database`, `DatabaseTransaction`, `DbExecutor`, `SchemaQueryExecutor` e `AuditExecutor` em `src/lib/db/index.ts`, eliminando `any` de executores e callbacks transacionais;
   - Fixture de contratos em `tests/types/database-contracts.test-d.ts` validada em tempo de compilação.
6. **Injeção de Auditoria e Atomicidade Transacional:**
   - Injeção tipada de `auditLogger: typeof insertAuditLog` para viabilizar simulação determinística de falhas de I/O e comprovação física de rollback no PostgreSQL.

---

## Validações Comprovadas no Ambiente

Todas as validações abaixo foram executadas e aprovadas com sucesso no ambiente real:

- [x] **Typecheck:** Aprovado (`tsc --noEmit` — 0 erros estáticos de tipagem, incluindo a fixture de tipos).
- [x] **Lint:** Aprovado (`biome lint ./src` — 0 violações de regras ou formatação).
- [x] **Testes Unitários:** Aprovados (17 arquivos, 222 testes unitários aprovados).
- [x] **Testes de Integração:** Aprovados (10 arquivos, 90 testes de integração aprovados em PostgreSQL real).
- [x] **Build de Produção:** Aprovado (`pnpm run build` / `next build` gerado com sucesso).
- [x] **Testes End-to-End (E2E):** 90 testes aprovados no total com Playwright Chromium:
  - 45 testes aprovados em uma execução;
  - 15 testes aprovados em uma segunda execução;
  - 15 testes aprovados em uma terceira execução;
  - 15 testes aprovados em uma quarta execução.
- [x] **Verificação Física do Schema:** Aprovada (`pnpm run db:verify -- --test` — 9 tabelas físicas validadas).
- [x] **Rollback Transacional:** Comprovado fisicamente no banco de dados.
- [x] **Injeção Explícita de `auditLogger`:** Comprovada com rastreamento de chamadas.
- [x] **Fixture de Contratos TypeScript:** Incluída no typecheck principal.

### Tabelas Físicas Validadas no Catálogo PostgreSQL (9 tabelas):
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

## Evidências Específicas Comprovadas por Testes

Os testes de integração comprovam deterministicamente os seguintes comportamentos:

1. **Rollback físico na criação de carteira:** Falha de auditoria aborta a transação e impede a persistência do registro em `portfolios`.
2. **Rollback físico na criação de ativo customizado:** Falha de auditoria aborta a transação e impede a persistência do registro em `assets`.
3. **Rollback físico na criação de evento patrimonial:** Falha de auditoria aborta a transação e impede a persistência do registro em `portfolio_events`.
4. **Rollback no fluxo de identidade:** Falha transacional reverte atomicamente criação de usuário, sessão, consentimentos e log de auditoria.
5. **Uso explícito de `auditLogger` injetado:** Funções de serviço aceitam parâmetro tipado como `typeof insertAuditLog`.
6. **Chamada efetiva da dependência injetada:** Comprovada com `toHaveBeenCalledTimes(1)`.
7. **Repasse do `DatabaseTransaction`:** A mesma instância `tx` recebida pelas funções `...InTransaction` é repassada como 4º argumento ao `auditLogger` (`failingAuditLogger.mock.calls[0][3] === capturedTx`).
8. **Não instanciação de transações aninhadas:** As funções `...InTransaction` operam estritamente dentro da transação `tx` recebida sem disparar transações próprias.
9. **Validação estática de contratos:** `tests/types/database-contracts.test-d.ts` valida compatibilidade estrutural de tipos e comprova a rejeição de tipos inválidos via diretivas `@ts-expect-error`.

---

## Avisos Não Bloqueantes Observados

Durante os ciclos de validação, os seguintes avisos informativos foram observados no ambiente:

- **Convenção `middleware`:** O build do Next.js emite aviso informativo de depreciação da convenção `middleware`, recomendando futura migração para `proxy`.
- **Módulo `punycode`:** O Node.js emite aviso informativo de depreciação do módulo interno `punycode` durante a execução do Biome linter.
- **Variável `NODE_ENV`:** Uso de valor de ambiente não convencional durante os testes E2E.

Esses avisos não causaram falhas em nenhuma etapa e não representam bloqueios.

---

## Estado da Working Tree

Nenhum commit ou push foi realizado nesta etapa. A working tree permanece com alterações locais. AGENTS.md possui uma alteração local intencional do usuário e não deve ser modificado nem revertido. tests/types/database-contracts.test-d.ts está criado, mas ainda não rastreado pelo Git.

> **Nota de governança:** A alteração em `AGENTS.md` não é tratada como parte da implementação do Pacote 03.00-E.

---

## Próxima Etapa

- **Pacote 03.01-D:** BLOQUEADO (Aguardando planejamento formal e autorização de execução).
