# ADR-008 — Preparar Transição de Fontes Gratuitas para Fontes Pagas

## Status

Aceito.

## Contexto

O lançamento utilizará fontes públicas ou gratuitas legalmente utilizáveis,
mas essas fontes podem ter limitações de qualidade, estabilidade, cobertura,
licenciamento, atraso e volume.

## Decisão

Provedores de dados serão encapsulados em adaptadores internos.

A aplicação consumirá uma interface de domínio própria, sem depender diretamente
da implementação de um provedor específico.

## Consequências

- Troca futura de fornecedor com menor impacto;
- Necessidade de normalização de tickers, moedas, bolsas e eventos;
- Necessidade de rastrear fonte, data e qualidade do dado;
- Necessidade de validar uso comercial e licenças de cada fonte.