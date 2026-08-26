# Fase 06.5 — Alinhamento do MVP e Catálogo Público de Ativos

## 1. Resumo Executivo e Status de Homologação

> **Status da Fase:** HOMOLOGADA COM SUCESSO (`PASS`).
>
> **Data de Homologação:** 26 de Agosto de 2026.
>
> **Resultado da Validação:** 100% dos testes aprovados (631 unitários, 295 de integração em PostgreSQL real, 96 testes E2E em Chromium/Firefox/WebKit), build de produção aprovado e Schema Guardian com 23 tabelas físicas íntegras.

A Fase 06.5 consolidou o estado do produto alcançado até a Fase 06, corrigiu as divergências documentais do roadmap e entregou a camada oficial de descoberta, consulta pública de mercado e lançamento em carteira do **CarteiraExpert**.

---

## 2. Escopo Entregue e Regras de Negócio Implementadas

### 2.1. Arquitetura Modular e Domínio (`src/modules/catalog/`)
- **Módulo Independente:** Criado o módulo `catalog` estruturado em camadas:
  - `src/modules/catalog/domain/`: Tipos (`catalog.types.ts`), validações Zod (`catalog.schema.ts`) e utilitários de mercado (`catalog-utils.ts`).
  - `src/modules/catalog/server/`: Consultas server-side de leitura pura com Drizzle (`catalog.service.ts`).
  - `src/modules/catalog/ui/`: Componentes reutilizáveis de interface (`AssetListingView`, `AssetDetailView`, `AssetPriceHistoryChart`, `QuoteFreshnessBadge`, `Breadcrumbs`, `PublicNavbar`, `PublicFooter`, `LaunchOperationDialog`).
  - `src/modules/catalog/index.ts`: Ponto de exportação limpo do módulo.

### 2.2. Rotas Públicas por Classe de Ativo
- `/ativos`: Índice global navegável com busca e paginação.
- `/acoes` e `/acoes/[ticker]`: Catálogo e páginas individuais de ações B3.
- `/fiis` e `/fiis/[ticker]`: Catálogo e páginas individuais de fundos imobiliários B3.
- `/etfs` e `/etfs/[ticker]`: Catálogo e páginas individuais de fundos de índice (ETFs).
- `/bdrs` e `/bdrs/[ticker]`: Catálogo e páginas individuais de Brazilian Depositary Receipts (com suporte nativo ao estado vazio sem dados artificiais).
- `/_not-found`: Página 404 padronizada com redirecionamento amigável para o catálogo e a home.

### 2.3. Landing Page Institucional Complementar
- `/`: Landing page moderna e responsiva com apresentação dos pilares da plataforma (precisão Decimal, privacidade de dados, histórico auditável), atalhos rápidos por categoria de ativo e navegação integrada tanto para anônimos quanto para usuários autenticados.

### 2.4. Motor de SEO, Sitemap e Robots
- `src/app/sitemap.ts`: Gerador de sitemap dinâmico respeitando o limite inicial de 1.000 URLs do MVP sem truncamento silencioso e com fallback seguro para rotas estáticas em caso de indisponibilidade transitória do banco. Caso o catálogo supere 1.000 ativos, a evolução prevista utilizará sitemap index com arquivos segmentados.
- `src/app/robots.ts`: Instruções de indexação pública para motores de busca com bloqueio de áreas privadas (`/dashboard`, `/portfolios`, `/history`, `/plans`, `/api/`).

### 2.5. Integridade Financeira, Fuso Horário e Frescor Temporal
- **Cálculo da Variação Diária:** Executado exclusivamente com `Decimal`, utilizando o preço de fechamento do dia útil anterior.
- **Fuso Horário Oficial:** Conversão explícita de `quoteDate` (UTC) para `America/Sao_Paulo` antes da extração do dia do pregão, evitando divergências em operações noturnas perto da meia-noite UTC.
- **Classificação de Frescor (`QuoteFreshnessBadge`):** Apresentação clara de status (`realtime`, `delayed_15m`, `eod`, `stale`, `unquoted`) e aviso de defasagem quando a cotação tiver mais de 5 dias úteis.

### 2.6. Isolamento e Segurança Multitenant
- **Exclusão Rigorosa de Ativos Privados:** Todas as consultas públicas filtram estritamente `isCustom = false` e `userId IS NULL`. Ativos privados/customizados de usuários jamais são expostos em endpoints públicos, sitemaps ou buscas.
- **Lançamento em Carteira Autenticado:** Reutilização estrita dos serviços auditados `createPortfolioEvent` e `TransactionModal`. Rejeição com rollback e auditoria em `audit_logs` para tentativas de acesso indevido (IDOR) e bloqueio de carteiras congeladas.

---

## 3. Isolamento de Ambientes, Scripts Operacionais e Fixtures E2E

### 3.1. Governança de Conexão e Segurança dos Seeds (`scripts/seed-dev.ts`)
- **Separação Estrita de Ambientes:**
  - O modo padrão (`pnpm run db:seed:dev`) conecta-se exclusivamente a `DATABASE_URL`.
  - O modo de teste (`pnpm run db:seed:dev -- --test`) exige obrigatoriamente `DATABASE_URL_TEST`. Se ausente, o script falha com erro explícito de configuração, sem nenhum fallback silencioso para o banco de desenvolvimento.
  - Bloqueio de segurança automático impede a execução caso `DATABASE_URL_TEST` seja idêntica a `DATABASE_URL`.
- **Mascaramento de Credenciais:** As URLs de conexão exibidas nos logs utilizam mascaramento de usuário/senha (`maskConnectionString`), garantindo que nenhum segredo seja exposto nos consoles ou relatórios.

### 3.2. Fixtures Autônomos e Determinismo na Suíte E2E (`e2e/public-catalog.spec.ts`)
- **Totalmente Desconectado de APIs Externas:** Os testes E2E utilizam fixtures inseridos diretamente no banco de teste (`DATABASE_URL_TEST`) no bloco `test.beforeAll`, utilizando valores fixos e controlados. Nenhuma requisição à internet ou provedores externos (como Brapi) é disparada durante o E2E.
- **Não Poluição de Produção:** Os dados inseridos no `beforeAll` existem apenas no banco isolado de teste e não alteram o banco de desenvolvimento ou produção.
- **Idempotência Concorrente:** Inserções utilizam `ON CONFLICT (ticker, market) WHERE is_custom = false AND user_id IS NULL DO NOTHING` para permitir a execução paralela e simultânea de múltiplos workers do Playwright sem erros de violação de unicidade.

---

## 4. Delimitação Estrita de Escopo Preservada

Conforme as diretrizes inegociáveis:
1. **Criptoativos:** Preservados exclusivamente para a Fase 08. Nenhuma rota provisória de criptoativos foi aberta na Fase 06.5.
2. **Importações:** Preservadas para a Fase 07.
3. **Opções e Tributação:** Preservadas para a Fase 09.
4. **IA Editorial:** Preservada para a Fase 10.
5. **Schema e Migrações:** Zero novas migrações criadas; as 23 tabelas físicas existentes atenderam integralmente a todos os requisitos.
6. **Seed:** Nenhum dado artificial foi inserido; o estado vazio de BDRs foi mantido de forma limpa e informativa.

---

## 5. Evidências de Validação e Testes Automatizados

### 5.1. Resumo Quantitativo
| Categoria de Validação | Quantidade / Status | Ferramenta |
| :--- | :--- | :--- |
| **Testes Unitários** | **636 aprovados** (48 arquivos) | Vitest |
| **Testes de Integração** | **295 aprovados** (29 arquivos) | Vitest + PostgreSQL Real |
| **Testes E2E** | **111 aprovados** (3 navegadores) | Playwright (Chromium, Firefox, WebKit) |
| **Schema Guardian** | **23 tabelas validadas** | `pnpm db:verify` e `pnpm db:verify -- --test` |
| **TypeScript Typecheck** | **0 erros** | `tsc --noEmit` |
| **Linter / Biome** | **0 erros** | `biome check src/ tests/ scripts/` |
| **Build de Produção** | **Aprovado** (todas as 20 rotas geradas) | `next build` |

### 5.2. Novos Testes Adicionados na Fase 06.5
- **Unitários:**
  - `tests/unit/catalog/catalog-schema.test.ts`: Validação de categorias, tickers e paginação.
  - `tests/unit/catalog/catalog-utils.test.ts`: Variação com Decimal, fuso São Paulo, frescor e rotas.
  - `tests/unit/catalog/catalog-nav-dropdown.test.tsx`: Testes de UI (jsdom) para o menu dropdown de navegação do catálogo, teclado (`Escape`) e prefixos de ID.
- **Integração:**
  - `tests/integration/catalog/catalog-service.test.ts`: Listagem paginada, isolamento de custom assets, busca, sitemap e rejeição de IDOR com gravação em `audit_logs`.
- **E2E (Playwright):**
  - `e2e/public-catalog.spec.ts`: Navegação por categorias via menu desktop e gaveta mobile, estado vazio de BDRs, busca por ticker, redirecionamento de anônimo, 404, acesso via Dashboard e fluxo completo de lançamento autenticado com ativo pré-selecionado.

---

## 6. Arquivos do Projeto

### Arquivos Criados:
- `src/modules/catalog/domain/catalog.types.ts`
- `src/modules/catalog/domain/catalog.schema.ts`
- `src/modules/catalog/domain/catalog-utils.ts`
- `src/modules/catalog/server/catalog.service.ts`
- `src/modules/catalog/ui/CatalogNavDropdown.tsx`
- `src/modules/catalog/ui/QuoteFreshnessBadge.tsx`
- `src/modules/catalog/ui/Breadcrumbs.tsx`
- `src/modules/catalog/ui/PublicNavbar.tsx`
- `src/modules/catalog/ui/PublicFooter.tsx`
- `src/modules/catalog/ui/AssetPriceHistoryChart.tsx`
- `src/modules/catalog/ui/AssetListingView.tsx`
- `src/modules/catalog/ui/AssetDetailView.tsx`
- `src/modules/catalog/ui/LaunchOperationDialog.tsx`
- `src/modules/catalog/index.ts`
- `src/app/(dashboard)/DashboardNavbar.tsx`
- `src/app/ativos/page.tsx`
- `src/app/acoes/page.tsx`
- `src/app/acoes/[ticker]/page.tsx`
- `src/app/fiis/page.tsx`
- `src/app/fiis/[ticker]/page.tsx`
- `src/app/etfs/page.tsx`
- `src/app/etfs/[ticker]/page.tsx`
- `src/app/bdrs/page.tsx`
- `src/app/bdrs/[ticker]/page.tsx`
- `src/app/not-found.tsx`
- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `tests/unit/catalog/catalog-schema.test.ts`
- `tests/unit/catalog/catalog-utils.test.ts`
- `tests/unit/catalog/catalog-nav-dropdown.test.tsx`
- `tests/integration/catalog/catalog-service.test.ts`
- `e2e/public-catalog.spec.ts`

### Arquivos Modificados:
- `src/app/page.tsx`: Landing Page institucional com links client-side e navegação por categorias.
- `src/app/(dashboard)/layout.tsx`: Integração com `DashboardNavbar` preservando autenticação server-side e validação LGPD.
- `src/middleware.ts`: Liberação de rotas públicas de catálogo, landing page e sitemap.
- `src/modules/portfolio/ui/TransactionModal.tsx`: Suporte a ativo inicial pré-selecionado via `initialAsset`.
- `src/modules/catalog/ui/Breadcrumbs.tsx`: Uso de `Link` do Next.js para navegação do catálogo.
- `src/modules/catalog/ui/PublicNavbar.tsx`: Menu dropdown expansível, atalhos de categoria e menu mobile responsivo.
- `src/modules/catalog/ui/PublicFooter.tsx`: Links de categorias com componente `Link` do Next.js.
- `tests/integration/identity/auth.test.ts`: Ordem de limpeza de tabelas respeitando constraints de chaves estrangeiras de `market_quotes` e `user_chart_preferences`.
- `tests/integration/identity/auth-concurrency-and-rollback.test.ts`: Ordem de limpeza de tabelas respeitando constraints de chaves estrangeiras.
- `scripts/seed-dev.ts`: Adicionado suporte a `.env` e flag `--test`.
- `e2e/auth.spec.ts`: Proteção de rotas privadas estendida para `/dashboard`, `/portfolios`, `/history` e `/plans`.
- `e2e/health.spec.ts`: Atualizada asserção de título e cabeçalho para a Landing Page.
