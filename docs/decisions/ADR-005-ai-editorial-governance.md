# ADR-005 — Governança de IA Editorial

## Status

Aceito.

## Contexto

O produto utilizará IA para apoiar análises internas de documentos públicos,
como DREs, relatórios, fatos relevantes e materiais de RI.

Há riscos de alucinação, viés, interpretação incorreta e publicação sem revisão.

## Decisão

A IA será usada exclusivamente em fluxo editorial interno.

O fluxo obrigatório será:

1. Upload de documento público;
2. Classificação;
3. Seleção de prompt específico;
4. Nova requisição isolada;
5. Geração de rascunho;
6. Revisão humana;
7. Aprovação humana;
8. Publicação com documento original vinculado.

## Consequências

- Usuário final não acessa chat de IA;
- IA não publica automaticamente;
- IA não calcula métricas financeiras;
- IA não recomenda compra ou venda;
- Toda geração deve ter logs de prompt, versão e resultado.