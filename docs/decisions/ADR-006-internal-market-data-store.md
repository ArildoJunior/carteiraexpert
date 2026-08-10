# ADR-006 — Armazenar Dados de Mercado Internamente

## Status

Aceito.

## Contexto

Consultar APIs externas diretamente a cada acesso de usuário aumenta latência,
custo, risco de bloqueio, limite de requisições e instabilidade.

## Decisão

Dados de mercado serão ingeridos, normalizados, armazenados e disponibilizados
aos usuários a partir da infraestrutura interna da plataforma.

## Consequências

- Usuários consultam banco interno e cache;
- A fonte externa fica encapsulada por adaptadores;
- Deve ser exibida defasagem e data/hora de referência;
- Será possível substituir fontes gratuitas por pagas;
- Será necessário implementar jobs de ingestão, qualidade e monitoramento.