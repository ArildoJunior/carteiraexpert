# ADR-002 — Adotar Carteira Orientada a Eventos

## Status

Aceito.

## Contexto

Carteiras financeiras exigem rastreabilidade de compras, vendas, proventos,
transferências, eventos corporativos e correções.

Manter apenas posição atual e custo médio impede auditoria adequada, dificulta
reprocessamento e tende a causar erros em split, grupamento e bonificação.

## Decisão

A carteira será baseada em eventos financeiros imutáveis.

A posição, custo médio, rentabilidade e demais resultados serão projeções
derivadas dos eventos.

## Consequências

### Positivas

- Auditoria;
- Reprocessamento;
- Melhor tratamento de eventos corporativos;
- Correções rastreáveis;
- Histórico confiável;
- Menor risco de atualização silenciosa.

### Negativas

- Modelo de dados mais elaborado;
- Necessidade de jobs idempotentes;
- Exige testes rigorosos de projeção e reprocessamento.