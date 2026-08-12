# ADR-009 — Análise, valuation e projeções como domínio informativo

## Status
Proposto para aprovação humana.

## Contexto
O produto pretende oferecer análise técnica, fundamentalista, filtros, Bazin, Graham, Peter Lynch, fluxo de caixa descontado, métricas personalizadas e projeções com premissas do usuário.

## Decisão
Essas capacidades serão organizadas em módulos próprios, com resultados versionados e rastreáveis. Não poderão alterar a carteira real, gerar ordens, recomendar ativos ou usar IA para efetuar cálculos.

## Consequências positivas
- separação entre fato patrimonial e interpretação analítica;
- reprodutibilidade dos resultados;
- possibilidade de trocar fontes e fórmulas;
- transparência sobre premissas;
- menor risco de confundir cenário com previsão.

## Riscos e controles
- dados ausentes: exibir estado de qualidade;
- fórmula alterada: versionar metodologia;
- resultado interpretado como recomendação: avisos e linguagem neutra;
- projeção misturada à carteira: modelos e comandos separados;
- métrica personalizada abusiva ou inválida: validação, limites e aceite.

## Questões em aberto
- conjunto inicial de indicadores por classe;
- fontes e licenças de cada série;
- fórmulas exatas e versões das metodologias;
- tratamento de empresas financeiras, FIIs e ativos sem métricas comparáveis;
- critérios de qualidade e atualização.
