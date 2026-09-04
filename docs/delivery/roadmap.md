# Roadmap — Sequência Estrutural de Desenvolvimento

A visão de produto e engenharia do CarteiraExpert organiza a evolução do monólito modular em fases sucessivas e ordenadas, garantindo que módulos analíticos e comerciais dependam de uma base determinística e testável.

---

## 1. Sequência de Fases e Estado Real

| Ordem | Fase | Pré-requisito | Estado no Repositório | Resultado Demonstrável |
|---:|---|---|---|---|
| **01** | **Fundação Técnica** | Nenhum | **Implementada e validada** | TypeScript estrito, Biome, Vitest, Playwright, `Decimal` e persistência `NUMERIC`. |
| **02** | **Identidade, Acesso e Segurança** | Fase 01 | **Implementada nos fluxos comprovados** | Cadastro, Argon2id, sessões em banco (SHA-256), rate limit e consentimentos LGPD. |
| **03** | **Núcleo de Carteiras e Posições** | Fases 01–02 | **Implementada nos fluxos comprovados** | Gestão de carteiras com finalidades (`REAL`, `ESTUDO`, `ANALISE`), unicidade da carteira REAL, lançamentos operacionais, contas de caixa, custódia institucional, motor de custo médio e PnL. |
| **04** | **Ações Corporativas e Subscrições** | Fases 01–03 | **Implementada nos fluxos comprovados** | Split, grupamento, bonificação, proventos (dividendos/JCP) e subscrições em 3 entidades. |
| **05** | **Planos, Entitlements e Assinaturas** | Fases 02–04 | **Parcialmente implementada (Pacotes 05.01, 05.02 e 05.03)** | Catálogo comercial, quotas de carteiras, downgrade com congelamento, assinaturas internas e página de planos. |
| **06** | **Dados de Mercado, Valuation e Gráficos** | Fases 03–04 | **Pacotes 06.01, 06.02 e 06.03 homologados** | Banco local (`market_quotes`, `exchange_rates`, `user_chart_preferences`), adaptadores (Manual, Mock, BRAPI), séries históricas B3 COTAHIST (`b3_cotahist_batches`, `b3_historical_quotes`), valuation, evolução diária e preferências persistidas por usuário/área. |
| **06.5** | **Alinhamento do MVP e Catálogo Público de Ativos** | Fase 06 | **Implementada e homologada** | Rotas públicas por classe (`/acoes`, `/fiis`, `/etfs`, `/bdrs`, `/ativos`), variação diária no fuso São Paulo com `Decimal`, `QuoteFreshnessBadge`, SEO (`sitemap.ts`, `robots.ts`), Landing Page institucional e lançamento em carteira autenticado com ativo pré-selecionado. |
| **07** | **Importações Revisáveis** | Fases 03–04 | **Implementada e homologada** | Módulo de importação CSV (`carteiraexpert_csv`, `b3_trades_csv`, `b3_movements_csv`), limite de 5 MB, deduplicação SHA-256, tela de revisão, edição com `Decimal`, resolução explícita de ativos e confirmação transacional atômica em `portfolio_events`. |
| **08** | **Ativos Globais e Criptoativos** | Fases 03, 06 | **Parcialmente implementada** | Multi-moeda, conversão cambial determinística e precisão `NUMERIC(28, 10)` no banco. |
| **09** | **Projeções, Opções e Apoio Tributário** | Fases 03, 06, 08 | **Parcialmente implementada apenas nas bases comprovadas** | PnL realizado e IRRF sobre JCP entregues; módulos de opções e fiscal dedicados planejados. |
| **10** | **IA Editorial e Preparação de Lançamento** | Governança e Operação | **Planejada, não implementada** | Diretrizes de governança editorial aprovadas; pipeline técnico planejado. |

---

## 2. Plano Mestre de Conclusão Funcional (Etapas 1 a 10)

O alinhamento executivo para testes reais organiza as entregas em 10 etapas sequenciais. O catálogo físico do banco de dados relacional é composto exatamente por **36 tabelas físicas** (além da tabela de controle `__drizzle_migrations`, totalizando 37 tabelas no PostgreSQL), validadas pelo Schema Guardian.

| Etapa | Escopo Funcional | Estado no Repositório | Commit / Artefatos |
|:---:|---|:---:|---|
| **Etapa 1** | **Resiliência Operacional, Segurança e Health Check** | **Concluída** | `c4ee5cf` (Route Handler `/api/health`, error boundaries, headers HTTP de segurança, runner `/api/jobs/ingest`, scripts de backup/restore). |
| **Etapa 2** | **Documentação Operacional de Ingestão e Backup** | **Concluída** | `64cc2e8` (Playbooks operacionais `docs/operations/backup-and-restore.md` e `docs/operations/market-data-ingestion.md`). |
| **Etapa 3** | **Finalidades de Carteira (`REAL`, `ESTUDO`, `ANALISE`) e Dashboard Contextual** | **Concluída** | `f30faf8` (Migração `0018_add_portfolio_purpose.sql`, índice parcial `idx_unique_user_real_portfolio`, `DashboardContextSelector`). |
| **Etapa 4** | **Contas de Caixa e Movimentações Monetárias** | **Concluída** | `40341ba` (Migração `0019_add_cash_accounts_and_transactions.sql`, tabelas `cash_accounts` e `cash_transactions`, lock pessimista `FOR UPDATE`, precisão `Decimal`). |
| **Etapa 5** | **Instituições de Custódia e Contas de Corretora** | **Concluída** | `78f2a5c` (Migração `0020_add_custody_entities.sql`, tabelas `custody_institutions` e `custody_accounts`, `custody_account_id` com `ON DELETE SET NULL`, filtro no histórico `/history`, ADR-012). |
| **Etapa 6** | **Modelos Teóricos de Valuation (Bazin, Graham, DCF)** | **Planejada (A iniciar)** | Motores puros de cálculo sobre demonstrativos contábeis CVM (`asset_fundamentals`), avisos regulatórios obrigatórios. |
| **Etapa 7** | **Simulador de Aportes, Juros Compostos e Projeções** | **Planejada** | Motor determinístico de projeção com premissas configuráveis pelo usuário, sem promessa de rentabilidade. |
| **Etapa 8** | **Módulo Operacional de Opções** | **Planejada** | Cadastro de opções, controle de vencimentos, alertas D-5/D-0 e gregas informativas (sem envio de ordens). |
| **Etapa 9** | **Módulo Fiscal Dedicado e Relatórios Auxiliares de IRPF** | **Planejada** | Módulo `src/modules/tax/`, isenção de R$ 20k, compensação de prejuízos e relatório auxiliar para IRPF (sem emissão de DARF). |
| **Etapa 10** | **IA Editorial Interna com Fluxo de Revisão Humana Obrigatória** | **Planejada** | Pipeline editorial interno apoiado por IA para documentos de RI, com revisão e aprovação humana mandatórias. |

---

## 3. Diretrizes de Sequenciamento

1. **Separação entre Dados Reais e Modelos Teóricos:** Ferramentas de screening, valuation teórico (Bazin, Graham, DCF) e simulações operam sobre dados históricos e não contaminam o cálculo patrimonial da carteira real.
2. **Proibições Regulatórias e Operacionais Permanentes:** A plataforma não faz recomendações de investimento, não envia nem executa ordens, não emite DARF e não oferece chat de IA para o usuário final.
3. **Evolução Factual:** Nenhuma fase ou etapa é considerada entregue sem a existência comprovada de código, schema físico versionado, validação do Schema Guardian e suítes de testes automatizados correspondentes.
