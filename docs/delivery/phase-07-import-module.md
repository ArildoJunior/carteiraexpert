# Fase 07 — Modulo de Importacoes Revisaveis

## 1. Resumo Executivo e Status de Homologacao

> **Status da Fase:** Pronta para revisao final e homologacao (alteracoes nao commitadas na working tree).  
> **Data do Fechamento Documental:** 26 de Agosto de 2026.  
> **Resultado da Validacao Automatizada:** 100% dos testes aprovados (704 testes unitarios em 54 arquivos via `pnpm run test:unit`, 337 testes de integracao em PostgreSQL real em 32 arquivos via `pnpm run test:integration`, 126 testes E2E Playwright em Chromium, Firefox e WebKit via `pnpm run test:e2e`), build de producao compilado com sucesso e Schema Guardian com 25 tabelas fisicas validadas.

A **Fase 07** entrega o modulo de importacao de operacoes de investimento do **CarteiraExpert** em conformidade com o **ADR-007** (*Importacoes Devem Ser Revisaveis e Editaveis*). A arquitetura estabelecida assegura que nenhum arquivo importado seja tratado como fonte definitiva de verdade sem previa validacao, inspecao e confirmacao humana explicita.

---

## 2. Historico de Entregas por Pacote (Fase 07)

O desenvolvimento da Fase 07 foi dividido e auditado nos seguintes pacotes:

1. **Pacote 07.01 — Dominio, Parsers CSV e Schemas:**
   - Criacao dos tipos de dominio em `src/modules/imports/domain/import.types.ts` e `import.errors.ts`;
   - Implementacao do parser canonico `StandardCsvParserAdapter` (`carteiraexpert_csv`) com deteccao de delimitadores (`,`/`;`/`\t`) e formatos numericos;
   - Implementacao dos parsers de relatorios B3: `B3TradesParserAdapter` (`b3_trades_csv`) e `B3MovementsParserAdapter` (`b3_movements_csv`);
   - Criacao do registro deterministico de parsers com auto-deteccao `ParserRegistry`;
   - Schemas Zod de validacao e utilitarios de hash SHA-256 e normalizacao numerica/data (`Decimal`);
   - Testes unitarios do dominio e parsers em `tests/unit/imports/`.

2. **Pacote 07.02 — Persistencia, Schema e Ingestao Inicial:**
   - Criacao e versionamento da **Migration `0011_add_imports_module.sql`**;
   - Tabelas Drizzle `import_batches` e `import_batch_items` em `src/lib/db/schema/imports.ts`;
   - Atualizacao do **Schema Guardian** em `src/lib/db/verify-schema.ts` para **25 tabelas fisicas**;
   - Servico `import.service.ts` com upload, validacao de 5 MB, hashing de arquivo SHA-256 e deduplicacao de lote (`file_hash`) e de linha (`raw_line_hash`);
   - Testes de integracao em PostgreSQL real em `tests/integration/imports/import-service.test.ts`.

3. **Pacote 07.03 — Confirmacao Transacional, Rejeicao e Rollback:**
   - Implementacao da confirmacao transacional com lock pessimista (`FOR UPDATE`) sobre a carteira e o lote;
   - Gravacao atomica em `portfolio_events` com `source = 'csv_import'` e `source_batch_id`;
   - Validacao de carteira ativa (rejeicao de carteiras congeladas `frozen` ou arquivadas `archived`);
   - Rejeicao de lotes com transicao para `rejected` e sem geracao de eventos contabeis;
   - Server Actions seguras com `requireAuthAndConsent()` em `src/modules/imports/server/import.actions.ts`;
   - Testes de integracao de confirmacao e atomicidade em `tests/integration/imports/import-confirmation.test.ts` e `import-actions.test.ts`.

4. **Pacote 07.04 — Interface de Usuario e Testes End-to-End:**
   - Criacao das telas `/import` (`page.tsx`, `ImportUploadZone.tsx`, `ImportBatchesListView.tsx`) e `/import/[id]` (`page.tsx`, `ImportBatchReviewView.tsx`);
   - Modais de retificacao manual com precisao `Decimal` (`EditBatchItemModal.tsx`) e resolucao explicita de ativos (`ResolveAssetModal.tsx`);
   - Inclusao do link "Importacoes" na barra de navegacao autenticada `DashboardNavbar.tsx`;
   - Suite de testes E2E dedicada em `e2e/imports.spec.ts` (4 cenarios multi-browser) e testes unitarios de componentes em `tests/unit/imports/import-ui.test.tsx`.

5. **Pacote 07.05 — Documentacao, Fechamento e Homologacao Final:**
   - **Escopo Exclusivo:** Documentacao e validacao de consistencia. Nenhuma linha de codigo de aplicacao, schema ou migration foi alterada;
   - Criacao do documento `docs/delivery/phase-07-import-module.md`;
   - Atualizacao de `docs/delivery/delivery-status.md` e `docs/delivery/roadmap.md`;
   - Execucao e reconciliacao factual das suites de validacao automatizada.

---

## 3. Formatos Suportados, Identificadores e Limitacoes

### 3.1. Formatos Efetivamente Suportados

1. **Padrao CarteiraExpert (`carteiraexpert_csv`)**:
   - **Cabecalhos esperados:** `Ticker, Tipo, Data, Quantidade, Preco, Taxas, Corretora, Notas` (ou equivalentes em ingles: `Type, Date, Quantity, Price, Fees, Broker, Notes`).
   - **Tipos de Operacao aceitos:** `BUY`, `COMPRA`, `SELL`, `VENDA`, `TRANSFER_IN`, `TRANSFERENCIA_ENTRADA`, `TRANSFER_OUT`, `TRANSFERENCIA_SAIDA`, `MANUAL_ADJUSTMENT`, `AJUSTE_MANUAL`.
   - **Separadores:** Deteccao automatica de virgula (`,`), ponto e virgula (`;`) ou tabulacao (`\t`).
   - **Formato numerico:** Suporte a separador decimal brasileiro (`1.234,56`) e internacional (`1234.56`).
   - **Formato de data:** `DD/MM/YYYY`, `YYYY-MM-DD` ou `DD-MM-YYYY`.

2. **Negociacao de Ativos B3 (`b3_trades_csv`)**:
   - **Layout oficial:** Extrato de negociacoes do Portal do Investidor B3.
   - **Mapeamento:** `Data do Negocio` -> `tradeDate`, `Compra/Venda` (`C` -> `BUY`, `V` -> `SELL`), `Codigo de Negociacao` -> `ticker`, `Quantidade` -> `quantity`, `Preco (R$)` -> `unitPrice`, `Valor Total (R$)` -> calculo de taxas/emolumentos residuais.

3. **Movimentacao de Ativos B3 (`b3_movements_csv`)**:
   - **Layout oficial:** Extrato de movimentacoes de custodia do Portal do Investidor B3.
   - **Mapeamento:** `Entrada/Saida` (`Credito` -> `TRANSFER_IN`, `Debito` -> `TRANSFER_OUT`, compras liquidadas -> `BUY`), identificacao de tickers B3 via regex a partir do campo `Produto`.

### 3.2. Regras e Limites Globais

- **Limite Maximo de Tamanho de Arquivo:** **5 MB** (`5 * 1024 * 1024` bytes / `5_242_880` bytes), validado no client-side (`ImportUploadZone`), nos schemas Zod e no servidor (`import.service.ts`).
- **Validacao de Arquivo Vazio:** Arquivos com 0 bytes sao rejeitados com erro explicito de validacao.
- **Identificador Canonico:** `carteiraexpert_csv` (sem aliases conflitantes no sistema).

### 3.3. Limitacoes Declaradas do Escopo (Fase 07)

- **Formatos Nao Suportados:** Planilhas binarias (`.xls`, `.xlsx`), arquivos `.pdf` e integracoes automaticas via Open Finance ou credenciais bancarias **nao** fazem parte desta entrega.
- **Eventos Corporativos:** Proventos (dividendos/JCP), splits e bonificacoes continuam sendo processados exclusivamente pelo motor oficial da Fase 04 e nao sao gerados automaticamente via importacao de negociacoes.
- **Tipos Contabeis:** Nenhuma alteracao foi introduzida na tabela `portfolio_events` ou no motor de posicoes `position-engine`.

---

## 4. Ciclo de Vida do Lote e Regras de Negocio

### 4.1. Ciclo de Estados do Lote (`import_batches`)

```text
[Upload do Arquivo CSV]
          |
          v
    pending_review ---- (Descarte explicito) -----> rejected (terminal / imutavel)
          |
          v (Resolucao de pendencias + confirmacao com lock)
      confirmed (terminal / imutavel)
          |
          v (Gravacao atomica em portfolio_events)
```

1. **`pending_review`:** Estado inicial apos upload e parsing. Todos os itens validos e com aviso ficam visiveis para auditoria, edicao, marcacao/desmarcacao e resolucao de ativos.
2. **`confirmed`:** Transacao concluida com sucesso. Operacoes gravadas na tabela `portfolio_events` com `source = 'csv_import'` e `source_batch_id`. Edicoes e novas confirmacoes sao bloqueadas.
3. **`rejected`:** Lote descartado voluntariamente pelo usuario com motivo opcional. Nenhum evento financeiro e gerado. Lote fica imutavel no historico.
4. **`failed`:** Erro fatal durante a etapa de parsing ou processamento inicial.

### 4.2. Deduplicacao e Integridade de Dados

- **Deduplicacao de Arquivo (Nivel Lote):** O hash SHA-256 do arquivo original e gerado no servidor (`file_hash`). Se o usuario tentar enviar o mesmo arquivo para a mesma carteira com lote ativo (`pending_review` ou `confirmed`), o sistema impede a duplicacao informando o lote pre-existente (`DuplicateBatchError`).
- **Deduplicacao de Linha (Nivel Item):** Cada linha gera um `raw_line_hash` (SHA-256). Linhas identicas dentro do mesmo arquivo ou ja existentes na carteira para a mesma data, tipo, quantidade e ativo recebem flag `is_duplicate = true` e status `duplicate`, sendo alertadas na interface.

### 4.3. Resolucao Explicita de Ativos Nao Mapeados

- Se um ticker do arquivo nao for localizado no catalogo oficial de ativos (tabela `assets`), a linha recebe status `warning` com mensagem descritiva.
- **Bloqueio de Confirmacao:** O lote **nao pode ser confirmado** enquanto houver itens marcados com ativos nao associados.
- **Acoes Disponiveis:**
  1. *Desmarcar a linha* para nao importa-la;
  2. *Associar a um ativo existente* no catalogo;
  3. *Criar ativo customizado* pertencente estritamente ao usuario autenticado (`userId = user.id`, `isCustom = true`, `market = 'CUSTOM'`).

### 4.4. Transacionalidade Atomica e Isolamento

- **Bloqueio Pessimista (`FOR UPDATE`):** Durante a confirmacao ou rejeicao, o lote e travado no PostgreSQL, impedindo requisicoes concorrentes ou duplicadas.
- **Validacao de Carteira Ativa:** Se a carteira estiver congelada (`frozen`) por restricoes de plano ou arquivada (`archived`), a confirmacao e abortada com `PortfolioNotWritableError`.
- **Atomicidade Total:** Todas as gravacoes em `portfolio_events`, resolucao de itens e atualizacao de status do lote ocorrem dentro da mesma transacao de banco. Qualquer falha provoca `ROLLBACK` completo sem deixar eventos parciais ou orfaos.

---

## 5. Modelo de Dados e Migracoes

A **Migration `0011_add_imports_module.sql`** (criada no Pacote 07.02) adicionou as 2 tabelas fisicas do modulo:

### 5.1. Tabela `import_batches`
- `id` (UUID, Primary Key);
- `user_id` (UUID, Foreign Key -> `users.id`, NOT NULL);
- `portfolio_id` (UUID, Foreign Key -> `portfolios.id`, NOT NULL);
- `file_name` (TEXT, NOT NULL);
- `file_size` (INTEGER, NOT NULL);
- `file_hash` (TEXT, NOT NULL);
- `format_id` (TEXT, NOT NULL);
- `status` (TEXT, NOT NULL, CHECK: `pending_review`, `processing`, `confirmed`, `rejected`, `failed`);
- `total_records`, `valid_records`, `warning_records`, `error_records`, `duplicate_records`, `excluded_records` (INTEGER, NOT NULL);
- `error_message` (TEXT);
- `created_at`, `updated_at`, `confirmed_at` (TIMESTAMP WITH TIME ZONE).

### 5.2. Tabela `import_batch_items`
- `id` (UUID, Primary Key);
- `batch_id` (UUID, Foreign Key -> `import_batches.id` ON DELETE CASCADE, NOT NULL);
- `user_id` (UUID, Foreign Key -> `users.id`, NOT NULL);
- `portfolio_id` (UUID, Foreign Key -> `portfolios.id`, NOT NULL);
- `line_number` (INTEGER, NOT NULL);
- `raw_ticker`, `raw_type`, `raw_date`, `raw_quantity`, `raw_price`, `raw_fees`, `raw_broker`, `raw_notes` (TEXT);
- `raw_line_hash` (TEXT, NOT NULL);
- `status` (TEXT, NOT NULL, CHECK: `valid`, `warning`, `error`, `duplicate`, `ignored`);
- `is_excluded` (BOOLEAN, NOT NULL DEFAULT FALSE);
- `is_duplicate` (BOOLEAN, NOT NULL DEFAULT FALSE);
- `validation_errors`, `validation_warnings` (JSONB, NOT NULL);
- `resolved_asset_id` (UUID, Foreign Key -> `assets.id`);
- `resolved_event_type` (TEXT);
- `parsed_trade_date` (TIMESTAMP WITH TIME ZONE);
- `parsed_quantity`, `parsed_unit_price`, `parsed_total_fees` (NUMERIC);
- `created_event_id` (UUID, Foreign Key -> `portfolio_events.id`);
- `created_at`, `updated_at` (TIMESTAMP WITH TIME ZONE).

Total de tabelas fisicas no banco: **25 tabelas**, todas validadas pelo **Schema Guardian** (`pnpm db:verify`).

---

## 6. Rotas e Telas da Interface

1. **`/import` (Listagem e Upload):**
   - Rota autenticada protegida por middleware;
   - Seletor de carteira pertencente ao usuario;
   - Seletor de formato com auto-deteccao;
   - Area de drag-and-drop com validacao client-side imediata (< 5 MB, extensao `.csv`);
   - Tabela historica de lotes anteriores com badges de status, totais de linhas e links para revisao.

2. **`/import/[id]` (Central de Revisao de Lote):**
   - Cabecalho com dados do arquivo, carteira de destino e badge de status;
   - Painel de KPIs com contadores em tempo real: *Total de Linhas*, *Validos*, *Alertas / Avisos*, *Erros Bloqueantes*, *Duplicidades*, *Desmarcados*;
   - Abas de filtragem rapida por status;
   - Tabela de conferencia com indicacao de ticker, operacao, data, quantidade, preco unitario, taxas e diagnostico de erros;
   - Checkbox por linha para inclusao/exclusao da gravacao final;
   - Botao "Editar" abrindo modal para retificacao manual de valores em `Decimal`;
   - Botao "Resolver Ativo" abrindo modal para resolucao de tickers nao identificados;
   - Acoes finais com confirmacao explicita em dialogo modal: "Confirmar Importacao" e "Descartar Lote";
   - Imutabilidade pos-confirmacao/rejeicao (botoes desabilitados ou ocultos, status final visivel).

---

## 7. Evidencias de Validacao e Testes Automatizados

### 7.1. Reconciliacao Factual por Comando Oficial

| Comando Oficial | Arquivos | Quantidade de Testes | Status | Escopo e Cobertura |
| :--- | :--- | :--- | :---: | :--- |
| `pnpm run test:unit` | **54 arquivos** | **704 testes** | **100% Aprovado** | 68 testes em `tests/unit/imports/` (6 arquivos) + 636 testes nos demais modulos (48 arquivos) |
| `pnpm run test:integration` | **32 arquivos** | **337 testes** | **100% Aprovado** | 42 testes em `tests/integration/imports/` (3 arquivos) + 295 testes nos demais modulos (29 arquivos em PostgreSQL real) |
| `pnpm run test:e2e` | **10 arquivos** | **126 testes** | **100% Aprovado** | Suite E2E completa executada nos 3 navegadores (Chromium, Firefox, WebKit) |
| `pnpm exec playwright test e2e/imports.spec.ts` | **1 arquivo** | **12 testes** | **100% Aprovado** | 4 cenarios E2E de importacoes x 3 navegadores (Chromium: 4, Firefox: 4, WebKit: 4) |
| `pnpm exec playwright test e2e/auth.spec.ts e2e/public-catalog.spec.ts e2e/portfolio.spec.ts` | **3 arquivos** | **75 testes** | **100% Aprovado** | 25 cenarios E2E x 3 navegadores (Chromium: 25, Firefox: 25, WebKit: 25) |
| `pnpm db:verify --test` | — | **25 tabelas** | **100% Aprovado** | Schema Guardian fisico validando todas as 25 tabelas oficiais |
| `pnpm typecheck` | — | **0 erros** | **Aprovado** | TypeScript em `strict mode` (`tsc --noEmit`) |
| `pnpm lint` / `biome check` | — | **0 erros** | **Aprovado** | Linter e formatador Biome em `src/`, `tests/`, `scripts/` |
| `pnpm build` | — | **21 rotas** | **Aprovado** | Compilacao de producao Next.js 16 (Turbopack) |
| `git diff --check` | — | **0 erros** | **Aprovado** | Verificacao de integridade de whitespace/CRLF |

### 7.2. Testes Dedicados da Fase 07

- **Testes Unitarios de Importacoes (`tests/unit/imports/` — 6 arquivos, 68 testes):**
  - `import-schema.test.ts` (10 testes): Validacoes Zod de upload (5 MB), edicao, resolucao e confirmacao.
  - `import-utils.test.ts` (24 testes): Formatacao numerica `Decimal`, parsing de datas, normalizacao de tickers e hashes SHA-256.
  - `parser-registry.test.ts` (7 testes): Registro de formatos e auto-deteccao de layout CSV por cabecalho.
  - `standard-csv-parser.test.ts` (7 testes): Parsing do formato `carteiraexpert_csv` com deteccao de separador e validacao de colunas.
  - `b3-parsers.test.ts` (5 testes): Parsing de relatorios de negociacao e movimentacao B3.
  - `import-ui.test.tsx` (15 testes): Renderizacao dos componentes de UI, validacao de limites (5 MB), arquivo vazio e reatividade de KPIs.

- **Testes de Integracao de Importacoes (`tests/integration/imports/` — 3 arquivos, 42 testes):**
  - `import-service.test.ts` (17 testes): Ciclo de upload, parsing, hashing, deduplicacao, isolamento IDOR e persistencia em PostgreSQL real.
  - `import-confirmation.test.ts` (16 testes): Confirmacao transacional, bloqueio de carteiras congeladas, rollback atomico em falhas e imutabilidade pos-confirmacao.
  - `import-actions.test.ts` (9 testes): Server Actions com `requireAuthAndConsent()`, validacao Zod e revalidacao de caminhos.

- **Testes End-to-End de Importacoes (`e2e/imports.spec.ts` — 1 arquivo, 12 testes):**
  - 4 cenarios completos executados em **Chromium**, **Firefox** e **WebKit** (4 testes por navegador):
    1. *Bloqueio de rota para usuario nao autenticado*;
    2. *Validacoes client-side de upload e navegacao desktop e mobile*;
    3. *Fluxo completo: upload com ativo unmapped, filtros, edicao, resolucao explicita e confirmacao transacional*;
    4. *Isolamento multiusuario: Usuario B nao pode acessar o lote do Usuario A (protecao IDOR)*.

---

## 8. Distincao entre Validacao Automatizada e Visual Manual

1. **Validacao Automatizada:** 100% comprovada por assercoes programaticas deterministicas executadas nas suites Vitest (unitarios e integracao em PostgreSQL real) e Playwright (E2E multi-browser em Chromium, Firefox e WebKit).
2. **Validacao Visual Manual:** **Nao comprovada neste registro** (a execucao dos testes E2E do Playwright em modo headless nao substitui nem deve ser declarada como inspecao visual manual por operador humano no navegador).

---

## 9. Riscos Residuais

1. **Layouts de Terceiros Nao Padronizados:** Arquivos CSV exportados por ferramentas nao padronizadas que nao contenham os cabecalhos esperados serao rejeitados, orientando o usuario a utilizar o modelo canonico `carteiraexpert_csv`.
2. **Linhas com Dados Parciais Corrompidos:** Tratadas individualmente com status `error`, permitindo ao usuario desmarcar a linha problematica para confirmar as demais operacoes validas.
3. **Evolucao Futura:** Importacao de notas de corretagem em PDF com extracao assincrona permanece classificada como evolucao futura (Roadmap expandido), exigindo pipeline com bucket privado e workers em background.
