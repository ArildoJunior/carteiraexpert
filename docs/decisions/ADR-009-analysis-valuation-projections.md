# ADR-009 — Análise, Valuation e Projeções como Domínio Informativo

## Status

Aceito — implementação parcial e evolutiva.

## Contexto

A plataforma pretende oferecer módulos analíticos complementares, incluindo screening fundamentalista, múltiplos de mercado, modelos teóricos de valuation (Preço Teto Bazin, Fórmula de Graham, Modelo de Peter Lynch, Fluxo de Caixa Descontado - DCF), métricas de desempenho e simulações de projeções futuras com premissas do usuário.

Essas capacidades possuem caráter meramente informativo, comparativo e educacional, e não podem ser confundidas com a apuração factual da posição patrimonial do usuário, nem com recomendações de investimento.

## Decisão

1. **Segregação Rigorosa da Carteira Real:** Os módulos de análise, valuation teórico e projeções serão organizados em domínios próprios. Essas ferramentas não poderão alterar a carteira real do usuário, não poderão gerar ou enviar ordens a corretoras, não poderão emitir recomendações de investimento e não utilizarão IA para a realização de cálculos matemáticos.
2. **Indicadores por Classe de Ativos:**
   - **Ações e BDRs:** Poderão utilizar indicadores fundamentalistas empresariais (P/L, P/VP, ROE, Margem Líquida, Dívida Líquida/EBITDA, etc.) quando disponíveis;
   - **Fundos Imobiliários (FIIs):** Deverão utilizar métricas próprias do setor imobiliário (Dividend Yield, P/VP, Vacância Física/Financeira, Cap Rate, etc.);
   - **ETFs e Fundos de Investimento:** Deverão utilizar métricas de desempenho, volatilidade, índice de Sharpe, taxa de administração e composição de carteira;
   - **Criptoativos:** Deverão utilizar métricas de mercado (capitalização, volume, dominância) e dados on-chain, e não indicadores contábeis empresariais;
   - **Opções:** Permanecem fora do primeiro escopo analítico;
   - **Incompatibilidades:** Indicadores incompatíveis com a natureza da classe devem ser classificados como `não aplicável`;
   - **Dados Ausentes:** Informações indisponíveis devem ser marcadas como `não disponível`;
   - **Vedação de Rankings Incompatíveis:** É proibida a produção de rankings comparativos entre classes com métricas economicamente incompatíveis.
3. **Fontes, Rastreabilidade e Licenças:**
   - Todo dado analítico deverá possuir fonte identificada, data de referência, período contábil, moeda, unidade e estado de qualidade;
   - Dados somente poderão ser consumidos ou publicados quando a licença de uso for compatível com a finalidade do SaaS;
   - A ausência de confirmação de origem, licença ou qualidade resultará na classificação como `não verificado`;
   - Não se presume que provedores gratuitos permitam uso comercial ou redistribuição.
4. **Fórmulas e Versionamento de Metodologias:**
   - Toda metodologia ou fórmula teórica deverá registrar explicitamente: nome, versão, fórmula matemática, variáveis de entrada, premissas adotadas, fonte dos dados, período de referência, unidade, regra de arredondamento, tratamento de dados ausentes, limitações e data de vigência;
   - Alterações materiais em fórmulas deverão gerar uma nova versão da metodologia, sem reinterpretação retroativa de resultados persistidos anteriormente.
5. **Comparabilidade Econômica:**
   - Métricas somente poderão ser comparadas quando tiverem definição e significado econômico compatíveis;
   - Empresas financeiras, seguradoras, FIIs, ETFs, fundos e empresas operacionais exigem conjuntos distintos de análise;
   - O sistema deverá informar `não aplicável`, `não disponível` ou `não comparável` quando pertinente, evitando comparações automáticas entre universos distintos.
6. **Qualidade dos Dados e Estados de Atualização:**
   - Os resultados analíticos deverão registrar estados padronizados: `válido`, `defasado`, `incompleto`, `incompatível`, `não verificado` e `não disponível`;
   - Alinhamento estrito com as regras de market data: referência temporal em UTC, tratamento de cotações obsoletas (> 7 dias UTC), incompatibilidade cambial e ausência de taxa cambial.

*Nota de Implementação:* As diretrizes deste ADR definem as fronteiras de governança e modelagem de domínio para as Fases 06 e 09 do roadmap, não significando que todos os modelos teóricos, telas de screening ou relatórios avançados já estejam implementados no código atual.

## Estado Atual no Repositório

- **Valuation de Mercado Atual:** Implementado e validado em `src/modules/market-data/domain/valuation-engine.ts`;
- **Evolução Patrimonial Temporal:** Implementada e validada em `src/modules/portfolio/domain/portfolio-evolution-engine.ts`;
- **Modelos Teóricos (Bazin, Graham, Lynch, DCF):** Planejados para a Fase 09;
- **Screening e Múltiplos Fundamentalistas:** Planejados para a Fase 09;
- **Projeções e Simulações de Cenários:** Planejadas para a Fase 09.

## Consequências

### Positivas

- Separação clara entre a verdade contábil/patrimonial da carteira e simulações analíticas;
- Reprodutibilidade e auditabilidade de cálculos teóricos e projeções;
- Transparência sobre premissas, limitações e defasagem de dados;
- Mitigação de riscos regulatórios (CVM/Anbima) quanto à caracterização de recomendação.

### Negativas / Riscos

- Exige complexidade adicional na validação de dados contábeis de múltiplas classes;
- Demanda governança estrita no versionamento de fórmulas e metodologias.
