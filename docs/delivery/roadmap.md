# Roadmap — Sequência Estrutural de Desenvolvimento

A visão de produto e engenharia do CarteiraExpert organiza a evolução do monólito modular em fases sucessivas e ordenadas, garantindo que módulos analíticos e comerciais dependam de uma base determinística e testável.

## Sequência de Fases e Estado Real

| Ordem | Fase | Pré-requisito | Estado no Repositório | Resultado Demonstrável |
|---:|---|---|---|---|
| **01** | **Fundação Técnica** | Nenhum | **Implementada e validada** | TypeScript estrito, Biome, Vitest, Playwright, `Decimal` e persistência `NUMERIC`. |
| **02** | **Identidade, Acesso e Segurança** | Fase 01 | **Implementada nos fluxos comprovados** | Cadastro, Argon2id, sessões em banco (SHA-256), rate limit e consentimentos LGPD. |
| **03** | **Núcleo de Carteiras e Posições** | Fases 01–02 | **Implementada nos fluxos comprovados** | Gestão de carteiras, lançamentos operacionais comprovados, motor de custo médio e PnL. |
| **04** | **Ações Corporativas e Subscrições** | Fases 01–03 | **Implementada nos fluxos comprovados** | Split, grupamento, bonificação, proventos (dividendos/JCP) e subscrições em 3 entidades. |
| **05** | **Planos, Entitlements e Assinaturas** | Fases 02–04 | **Parcialmente implementada (Pacotes 05.01 e 05.02)** | Catálogo comercial, quotas de carteiras, downgrade com congelamento, assinaturas internas e eventos idempotentes. |
| **06** | **Dados de Mercado e Gráficos** | Fases 03–04 | **Parcialmente implementada** | Banco local (`market_quotes`, `exchange_rates`), adaptadores, valuation, evolução e gráficos. |
| **07** | **Importações Revisáveis** | Fases 03–04 | **Planejada, não implementada** | Upload e parsing de planilhas e PDFs com revisão humana obrigatória. |
| **08** | **Ativos Globais e Criptoativos** | Fases 03, 06 | **Parcialmente implementada** | Multi-moeda, conversão cambial determinística e precisão `NUMERIC(28, 10)` no banco. |
| **09** | **Projeções, Opções e Apoio Tributário** | Fases 03, 06, 08 | **Parcialmente implementada apenas nas bases comprovadas** | PnL realizado e IRRF sobre JCP entregues; módulos de opções e fiscal dedicados planejados. |
| **10** | **IA Editorial e Preparação de Lançamento** | Governança e Operação | **Planejada, não implementada** | Diretrizes de governança editorial aprovadas; pipeline técnico planejado. |

## Diretrizes de Sequenciamento

1. **Separação entre Dados Reais e Modelos Teóricos:** Ferramentas de screening, valuation teórico (Bazin, Graham, DCF) e simulações operam sobre dados históricos e não contaminam o cálculo patrimonial da carteira real.
2. **Proibições Regulatórias e Operacionais Permanentes:** A plataforma não faz recomendações de investimento, não envia nem executa ordens, não emite DARF e não oferece chat de IA para o usuário final.
3. **Evolução Factual:** Nenhuma fase é considerada entregue sem a existência comprovada de código, schema e suítes de testes automatizados correspondentes.
