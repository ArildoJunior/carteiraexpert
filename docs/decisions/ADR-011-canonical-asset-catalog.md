# ADR-011 — Arquitetura do Catálogo Canônico de Ativos e Governança de Fontes

- **Status:** Proposta documental aprovada (Implementação técnica pendente de autorização explícita)
- **Data:** 2026-09-01
- **Decisores:** Equipe do CarteiraExpert
- **Escopo:** Catálogo Público, Governança de Ativos, Dados de Mercado (B3) e Fundamentos Contábeis (CVM)
- **Documento de Domínio Relacionado:** `docs/domain/canonical-asset-catalog.md`

> **Declaração de Escopo:** A ADR-011 documenta a direção arquitetural aprovada para futura implementação, cuja execução técnica permanece pendente de autorização. A arquitetura proposta prevê a futura materialização dos ativos elegíveis em `portfolio.assets`; essa materialização ainda não foi executada.

---

## 1. Contexto e Fatos Atuais do Sistema

O CarteiraExpert disponibiliza consultas públicas e páginas de detalhe por classe de ativos nas rotas `/acoes`, `/fiis`, `/etfs` e `/bdrs`. Atualmente, o sistema opera com duas bases de dados sobrepostas:

1. **Camada Relacional de Ativos (`portfolio.assets`):** Contém atualmente apenas 7 ativos globais curados (`PETR4`, `VALE3`, `ITUB4`, `BBDC4`, `KNIP11`, `IVVB11`, `BTC`), com chave primária UUID e suporte completo a operações em carteira (`portfolio_events`) e demonstrativos contábeis (`asset_fundamentals`).
2. **Camada de Cotações Brutas da B3 (`b3_historical_quotes`):** Contém mais de 7,3 milhões de registros diários de negociação do COTAHIST (2005–2026) e 316.082 tickers no histórico bruto total.

Para viabilizar a navegação visual no MVP (Fase 06.5), o serviço `src/modules/catalog/server/catalog.service.ts` passou a gerar identificadores virtuais em texto (`b3_TICKER`, ex: `b3_ABEV3`) para instrumentos presentes no COTAHIST que não possuíam registro em `assets`.

### Diagnóstico da Falha Técnica Atual com IDs Virtuais
A cadeia técnica de geração, transmissão e falha foi confirmada no código:

```text
catalog.service.ts
→ gera identificador virtual b3_ABEV3
→ página pública (/acoes/ABEV3) renderiza e transmite o valor
→ LaunchOperationDialog envia assetId: "b3_ABEV3" no formulário
→ createPortfolioEventSchema exige assetId como UUID (z.string().uuid())
→ asset.service.ts rejeita o identificador ao checar UUID_REGEX
→ operação de carteira falha (AssetNotFoundError / erro de validação).
```

Além disso, a tabela `asset_fundamentals` possui chave estrangeira física obrigatória `asset_id REFERENCES assets(id)`. Ativos que existem apenas no COTAHIST não podem receber demonstrativos CVM sem linha física em `assets`.

---

## 2. Decisão Arquitetural (Direção Proposta para Futura Implementação)

Adota-se a **Arquitetura Canônica de Ativos** baseada na centralização da autoridade cadastral na tabela `portfolio.assets`, com as seguintes diretrizes:

1. **`portfolio.assets` como Ponto Canônico Central:**
   - A tabela `portfolio.assets` é o ponto de integração e identidade para instrumentos financeiros negociáveis no sistema.
   - O uso de identificadores virtuais temporários (`b3_TICKER`) é formalmente descontinuado no desenho arquitetural, prevendo sua substituição por UUIDs físicos persistidos após autorização da etapa técnica.
2. **Materialização Controlada dos Instrumentos Oficiais:**
   - A base de ativos globais em `assets` será alimentada a partir dos dados oficiais da B3 e da CVM, abrangendo os instrumentos de mercado à vista com negociação recente e mantendo histórico para ativos encerrados.
   - Séries de derivativos (opções mensais expiradas) **permanecem exclusivamente em `b3_historical_quotes`** e não serão inseridas em `assets`.
3. **Associação Relacional Auditável:**
   - `b3_historical_quotes.asset_id` apontará para o UUID canônico correspondente em `assets`.
   - `cvm_company_assets.asset_id` vinculará a companhia CVM ao UUID do ativo canônico para publicação de demonstrativos em `asset_fundamentals`.

---

## 3. Fatos Confirmados do Sistema Atual

- **Schema Físico:** O banco possui **32 tabelas físicas de aplicação** e **1 tabela interna de controle de migrações (`__drizzle_migrations`)**, totalizando 33 tabelas físicas no PostgreSQL.
- **Colunas em `portfolio.assets`:** Possui exatamente **10 colunas reais** (`id`, `ticker`, `name`, `asset_type`, `market`, `currency`, `is_custom`, `user_id`, `created_at`, `updated_at`).
- **Campos que NÃO Existem em `assets`:** Não possui colunas físicas para `isin`, `status`, `cnpj`, `cvm_code`, `share_class`, `previous_tickers`, `validity` ou `provenance`.
- **Estrutura de `b3_historical_quotes`:** Possui 30 colunas, incluindo `isin` (presente em 100% das linhas do COTAHIST), `short_name` e `specification`. Não possui `cnpj` nem `cvm_code`.

---

## 4. Taxonomia Conceitual Obrigatória

Para evitar confusão entre mercado, custódia e dados contábeis:

1. **Instrumento Financeiro (Asset / Instrument):** Entidade econômica/jurídica estável (ex: Ação PN Petrobras). Possui UUID permanente em `portfolio.assets`.
2. **Ticker de Negociação (Trading Symbol):** Código de pregão na B3 (ex: `PETR4`, `BHIA3`). Pode ser alterado pela bolsa sem alterar o instrumento.
3. **Emissão / Classe (Share Class):** Especificação do papel: `ON` (Ordinária), `PN` (Preferencial), `UNT` (Unit) ou `CI` (Cota de Fundo).
4. **Entidade Emissora (CVM Company):** Pessoa jurídica ou Fundo registrado na CVM (`cvm_companies`), com CNPJ e Código CVM único.
5. **Série Histórica (Historical Quotes):** Conjunto contínuo de pregões diários (`b3_historical_quotes`).
6. **Registro de Cotação (Quote Fact Snapshot):** Fato pontual de mercado com preços e status de defasagem (`market_quotes`).
7. **Ativo Customizado (Custom Asset):** Instrumento privado criado por um usuário específico (`is_custom = true`), isolado dos demais.

---

## 5. Separação de Estados Operacionais

A governança do catálogo estabelece 5 estados operacionais independentes:

- **Visível no Catálogo (`is_visible_catalog`):** Ativo global, lote padrão, com cotação recente e status ativo.
- **Operável em Carteira (`is_tradeable_portfolio`):** Instrumento cadastrado em `portfolio.assets` com UUID válido.
- **Elegibilidade para Fundamentos (`is_cvm_eligible`):** Ativo com vínculo aprovado em `cvm_company_assets` e demonstrativos em `asset_fundamentals`.
- **Retenção para Histórico (`historical_retention`):** Tickers extintos/deslistados mantidos em `b3_historical_quotes` para relatórios e auditoria.
- **Revisão Pendente (`pending_review`):** Vínculos que aguardam confirmação manual de CNPJ/classe antes de liberar publicação.

---

## 6. Precedência de Fontes de Dados

| Atributo | Fonte Primária | Fonte Secundária | Fonte Proibida | Revisão Manual |
| :--- | :--- | :--- | :--- | :--- |
| **Ticker** | B3 COTAHIST / Cadastro | CVM DFP | Entrada de usuário comum | Em alteração de ticker |
| **Razão Social** | CVM `cad_cia_aberta` | B3 COTAHIST | Provedor informal | Divergência CNPJ / Razão Social |
| **CNPJ** | CVM `cad_cia_aberta` | B3 Cadastro | Provedor de cotação | Em caso de duplicidade |
| **Código CVM** | CVM `cad_cia_aberta` | De-para manual | Inferência heurística pura | Obrigatória para aprovação |
| **Código ISIN** | B3 COTAHIST | CVM DFP | Provedor informal | Em reutilização de ticker |
| **Tipo/Classe** | B3 (BDI + Spec) + CVM | CVM Cadastro | Heurística simples de texto | Conflito Unit (`UNT`) vs FII (`CI`)|
| **Fechamento** | B3 COTAHIST | Provedor com SLA | Inserção manual D-1 | Rejeição no parser |
| **DFP/ITR** | CVM Dados Abertos | CVM Protocolo | Fontes não auditadas | Em reapresentações (*restatements*)|

---

## 7. Política de Inclusão no Catálogo

- **Amostragem Demonstrada na Base Local Atual:**
  - 316.082 tickers no histórico total bruto de 20 anos da B3;
  - 3.608 tickers distintos resultantes do filtro de mercado à vista de lote padrão (`market_type = 10` e `bdi_code IN ('02','12','14','34','36')` sem final `F`);
  - 2.315 tickers com registros de pregão em 2025/2026;
  - 1.293 tickers com registros exclusivamente anteriores a 2025.
- **Nota de Precisão Metodológica:** Os números acima representam resultados das consultas de filtro na base local atual, não uma decisão definitiva de carga e nem garantia de que todos representem instrumentos canônicos distintos.
- **Tratamento de Inconsistências:** Conflitos entre BDI, especificação, ISIN, emissor e cadastros oficiais devem resultar no estado `PENDING_REVIEW`, e **não** em publicação automática.
- **Nenhuma carga em massa de dados está autorizada nesta etapa.**

---

## 8. Limites da Decisão Atual e Ações NÃO Autorizadas

1. Esta decisão aprova o modelo conceitual e documental do Catálogo Canônico.
2. **Não estão autorizadas:** alterações no schema do banco de dados, migrations, criação ou execução de sincronizador, seeds, ingestão, publicação CVM, backfill de foreign keys ou modificação de dados no banco local ou de produção.
3. Permanece em aberto a decisão técnica se atributos de governança adicionais (`status`, `isin`, `source`) serão incorporados em `portfolio.assets` via nova migration ou resolvidos via tabelas relacionais de mercado/CVM existentes.

---

## 9. Plano de Migração Técnica Futura (Sem Execução Nesta Etapa)

Quando a implementação técnica for formalmente autorizada pelo usuário, o plano seguirá 15 etapas sequenciais com validação e rollback:

1. **Consolidação Documental:** Publicação formal desta ADR e do documento de domínio;
2. **Testes de Contrato:** Garantir que nenhum endpoint de escrita aceite IDs virtuais;
3. **Serviço de Sincronização Canônica:** Implementação de `sync-canonical-catalog.service.ts`;
4. **Materialização Controlada:** Carga dos ativos oficiais vigentes em `portfolio.assets`;
5. **Backfill de Cotações:** Associação de `b3_historical_quotes.asset_id` aos UUIDs;
6. **Refatoração do Catálogo:** Extinção do prefixo `b3_` em `catalog.service.ts`;
7. **De-Para e Fundamentos CVM:** Publicação de demonstrativos DFP para os ativos materializados;
8. **Validação de Ações:** Homologação de ações brasileiras (ex: `PETR4`, `ABEV3`, `WEGE3`);
9. **Validação de FIIs e Units:** Homologação de FIIs (`KNIP11`) e Units (`TAEE11`, `ALUP11`);
10. **Validação de ETFs e Fiagros:** Homologação de ETFs (`IVVB11`) e Fiagros (`AAGR11`);
11. **Validação de BDRs e Cripto:** Homologação de BDRs (`AAPL34`) e Cripto (`BTC`);
12. **Testes E2E:** Validação de fluxos de ponta a ponta no Playwright;
13. **Backup e Snapshot:** Procedimento de segurança no banco de dados;
14. **Plano de Rollback:** Simulação de reversão em ambiente isolado;
15. **Liberação Final:** Registro em `audit_logs` e atualização do status de entrega.
