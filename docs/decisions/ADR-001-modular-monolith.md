# ADR-001 — Adotar Monólito Modular Orientado a Domínio

## Status

Aceito.

## Data

2026-08-10

## Contexto

O CarteiraExpert será desenvolvido inicialmente por uma pessoa com auxílio de IA.
O produto possui domínios complexos e relacionados, como carteira, eventos
corporativos, tributação de apoio, planos, importações, mercado e privacidade.

Microserviços aumentariam custo operacional, complexidade de deploy, depuração,
consistência distribuída, observabilidade e manutenção.

## Decisão

Adotar monólito modular orientado a domínio e eventos.

A aplicação utilizará módulos internos bem delimitados, PostgreSQL como base
principal, jobs assíncronos e adaptadores para integrações externas.

## Consequências

### Positivas

- Menor custo operacional;
- Desenvolvimento mais rápido;
- Testes e depuração mais simples;
- Maior consistência transacional;
- Adequado para desenvolvimento solo;
- Possibilidade de escala horizontal da aplicação.

### Negativas

- Exige disciplina forte de limites entre módulos;
- Exige evitar dependências circulares;
- Alguns módulos poderão precisar ser extraídos futuramente se houver escala real.