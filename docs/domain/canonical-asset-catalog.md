# Domínio: Catálogo Canônico de Ativos e Identidade de Instrumentos Financeiros

Este documento descreve as regras de domínio, taxonomia, ciclo de vida e governança de dados para a arquitetura do Catálogo Canônico de Ativos do **CarteiraExpert**.

> **Status:** Documentação de domínio aprovada conceitualmente para direção arquitetural. A execução técnica, criação de sincronizadores e materialização em banco permanecem pendentes de autorização explícita.  
> **Decisão Arquitetural Relacionada:** `docs/decisions/ADR-011-canonical-asset-catalog.md`.

---

## 1. Princípios Fundamentais de Identidade

1. **Unicidade do Instrumento Financeiro:** Todo instrumento financeiro negociável possui um identificador único, perene e imutável (UUID) centralizado na entidade canônica `portfolio.assets`.
2. **Desacoplamento entre Instrumento e Ticker:** O código de negociação em bolsa (*ticker*) é uma propriedade mutável do ativo, sujeita a alterações regulatórias pela B3 (ex: `VVAR3` -> `VIIA3` -> `BHIA3`). A alteração de um ticker não cria um novo ativo nem rompe o histórico financeiro de transações passadas.
3. **Desacoplamento entre Instrumento e Emissor:** Uma Entidade Emissora registrada na CVM (`cvm_companies`) representa a pessoa jurídica ou comunhão de recursos (S.A. ou Fundo). Uma única companhia emite múltiplos instrumentos de negociação (ex: `PETR3` e `PETR4`).
4. **Isolamento Multitenant Estrito:** Ativos globais curados (`is_custom = false` e `user_id IS NULL`) são universais e compartilhados; ativos customizados (`is_custom = true` e `user_id IS NOT NULL`) são privados do usuário criador e protegidos por autorização no servidor.
5. **Comportamento Atual vs. Comportamento-Alvo:**
   - **Comportamento Atual:** A tabela `portfolio.assets` possui 7 ativos globais curados e gera identificadores virtuais `b3_TICKER` em `catalog.service.ts` para navegação visual de mercado.
   - **Comportamento-Alvo:** A arquitetura proposta prevê a futura materialização dos ativos elegíveis em `portfolio.assets` e a extinção definitiva dos IDs virtuais; essa materialização ainda não foi executada.

---

## 2. Taxonomia e Diferenciação Conceitual

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               TAXONOMIA DO CATÁLOGO DE ATIVOS                                         │
├──────────────────────────┬─────────────────────────────────────────────────────────────────────────────┤
│ CONCEITO                 │ DEFINIÇÃO E ESCOPO NO DOMÍNIO                                               │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 1. Instrumento Financeiro│ Contrato econômico ou valor mobiliário (Ação PN Petrobras, FII Kinea).     │
│    (Asset / Instrument)  │ Representado pelo UUID na tabela assets.                                    │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 2. Ticker de Negociação  │ Símbolo de cotação em pregão (PETR4, ABEV3, KNIP11).                        │
│    (Trading Symbol)      │ Atributo principal de busca no tempo presente.                              │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 3. Emissão ou Classe     │ Especificação societária: ON (Ordinária), PN (Preferencial), UNT (Unit)     │
│    (Share Class / Issue) │ ou CI (Cota de Fundo), determinando direitos de voto e preferências.        │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 4. Entidade Emissora     │ Pessoa jurídica (S.A.) ou Fundo registrada na CVM (cvm_companies),          │
│    (Issuing Entity)      │ identificada pelo CNPJ e Código CVM único.                                  │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 5. Série Histórica       │ Registro temporal de cotações de pregões passados (b3_historical_quotes),   │
│    (Historical Quotes)   │ preservando a granularidade diária original da B3 por código ISIN.          │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 6. Registro de Cotação   │ Fato pontual de mercado com preço e status de defasagem (market_quotes).    │
│    (Quote Fact Snapshot) │                                                                             │
├──────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ 7. Ativo Personalizado   │ Instrumento privado criado por um usuário específico (is_custom = true),    │
│    (Custom Asset)        │ estritamente isolado de outros usuários e fora do catálogo público.        │
└──────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Estados Operacionais do Ciclo de Vida

O ciclo de vida de um instrumento financeiro no modelo canônico proposto opera sob 5 estados independentes:

```
                                      ┌────────────────────────┐
                                      │   NOVO INSTRUMENTO     │
                                      │  (B3 COTAHIST / CVM)   │
                                      └───────────┬────────────┘
                                                  │
                                                  ▼
                                      ┌────────────────────────┐
                                      │        CADASTRO        │
                                      │   (portfolio.assets)   │
                                      └───────────┬────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼                                                 ▼
            ┌─────────────────────────┐                       ┌─────────────────────────┐
            │         ACTIVE          │                       │        DELISTED         │
            │ • Negociação recente    │                       │ • Deslistado / Encerrado│
            │ • Visível no catálogo   │                       │ • Fora da busca padrão  │
            │ • Operável em carteira  │                       │ • Preservado p/ cálculo │
            └────────────┬────────────┘                       └────────────┬────────────┘
                         │                                                 │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                                      ┌────────────────────────┐
                                      │    cvm_company_assets  │
                                      │                        │
                                      │  PENDING_REVIEW ───────┼──► REJECTED
                                      │         │              │
                                      │         ▼              │
                                      │      APPROVED          │
                                      │         │              │
                                      │         ▼              │
                                      │   asset_fundamentals   │
                                      └────────────────────────┘
```

1. **Visibilidade no Catálogo Público (`is_visible_catalog`):** Ativos globais (`is_custom = false`), de lote padrão, com cotação recente e status ativo. Exibidos nas rotas `/acoes`, `/fiis`, `/etfs`, `/bdrs`.
2. **Permissão de Operação em Carteira (`is_tradeable_portfolio`):** Todo instrumento cadastrado com UUID válido em `portfolio.assets` (globais ou customizados do próprio usuário). Permite inclusão em `portfolio_events` e notas de corretagem.
3. **Elegibilidade para Fundamentos Contábeis (`is_cvm_eligible`):** Ativo associado a companhia CVM com status `APPROVED` em `cvm_company_assets`, permitindo a exibição de demonstrativos DFP/ITR em `asset_fundamentals`.
4. **Retenção Apenas para Histórico (`historical_retention`):** Tickers encerrados ou séries derivativas mantidas em `b3_historical_quotes` para reconstrução de gráficos e relatórios tributários passados.
5. **Revisão Pendente (`pending_review`):** Vínculos entre Ativo e CVM que apresentem divergência cadastral ou heurística ambígua, exigindo validação manual antes da liberação de demonstrativos.

---

## 4. Matriz de Precedência e Governança de Atributos

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                MATRIZ DE PRECEDÊNCIA DE FONTES                                         │
├───────────────────────────────┬─────────────────────────┬─────────────────────────┬────────────────────┤
│ ATRIBUTO                      │ FONTE PRIMÁRIA (MESTRE) │ FONTE SECUNDÁRIA        │ FONTE PROIBIDA     │
├───────────────────────────────┼─────────────────────────┼─────────────────────────┼────────────────────┤
│ Ticker Oficial de Negociação  │ B3 (COTAHIST / Cadastro)│ CVM (DFP/ITR)           │ Entrada de usuário │
│ Razão Social Institucional    │ CVM (cad_cia_aberta)    │ B3 (COTAHIST)           │ Provedor informal  │
│ CNPJ do Emissor               │ CVM (cad_cia_aberta)    │ B3 Cadastro Oficial     │ Provedor de cotação│
│ Código CVM (6 dígitos)        │ CVM (cad_cia_aberta)    │ De-para manual auditado │ Heurística de texto│
│ Código ISIN (12 caracteres)   │ B3 (COTAHIST)           │ CVM DFP                 │ Provedor informal  │
│ Tipo e Classe do Ativo        │ B3 (BDI + Spec) + CVM   │ CVM Cadastro            │ Heurística simples │
│ Cotação Diária de Fechamento  │ B3 (COTAHIST)           │ Provedor homologado SLA │ Inserção manual D-1│
│ Demonstrações Contábeis (DFP) │ CVM Dados Abertos (DFP) │ CVM Protocolo Direto    │ Fontes não oficiais│
└───────────────────────────────┴─────────────────────────┴─────────────────────────┴────────────────────┘
```

---

## 5. Regras de Classificação e Resolução de Conflitos

1. **Units de Ações vs. Fundos Imobiliários:**
   - Tickers terminados em `11` com `bdi_code = '02'` e especificação contendo `UNT` ou cadastrados no `cad_cia_aberta` da CVM são classificados obrigatoriamente como `asset_type = 'stock'` (ex: `TAEE11`, `ALUP11`, `SANB11`, `KLBN11`, `SBSP11`).
   - Tickers terminados em `11` com `bdi_code = '12'` e especificação contendo `CI` ou registrados no `inf_mensal_fii` da CVM são classificados como `asset_type = 'fii'` (ex: `KNIP11`, `HGLG11`).
2. **Fundos de Índice (ETFs) e Fiagros:**
   - Instrumentos com `bdi_code = '14'` ou especificação contendo `ETF` são classificados como `asset_type = 'etf'` (ex: `IVVB11`, `BOVA11`).
   - Fiagros regulados pela Lei 14.130/2021 preservam sua identificação formal no cadastro.
3. **BDRs (Brazilian Depositary Receipts):**
   - Instrumentos com `bdi_code IN ('34', '36', '38')` ou tickers terminados em `34`, `35`, `39` são classificados como `asset_type = 'bdr'` com moeda base `BRL` e mercado `B3` (ex: `AAPL34`, `MSFT34`).
4. **Resolução de Conflitos e Casos Ambíguos:**
   - Conflitos entre BDI, especificação, ISIN, emissor e cadastros oficiais resultam obrigatoriamente no status `PENDING_REVIEW` em `cvm_company_assets`, **nunca** em publicação automática, registrando evento de advertência em `audit_logs`.

---

## 6. Relação com as Tabelas do Banco de Dados

- **`portfolio.assets`:** Tabela canônica mestre de instrumentos (10 colunas atuais no schema físico).
- **`b3_historical_quotes`:** Tabela de cotações diárias de pregão B3 com 30 colunas, incluindo `isin`, `short_name` e `specification`. Não possui `cnpj` nem `cvm_code`.
- **`cvm_companies`:** Cadastro institucional oficial de companhias abertas por CNPJ e Código CVM.
- **`cvm_company_assets`:** De-Para auditado entre companhia CVM e o UUID do ativo canônico.
- **`asset_fundamentals`:** Demonstrações financeiras oficiais versionadas (DFP/ITR) referenciando `assets(id)`.
- **`portfolio_events`:** Lançamentos patrimoniais em carteira referenciando `assets(id)`.
