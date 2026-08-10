# ADR-003 — Isolar Motor de Cálculos Financeiros

## Status

Aceito.

## Contexto

Cálculos de posição, custo médio, rentabilidade, câmbio, eventos corporativos,
projeções e apoio tributário exigem precisão, repetibilidade e auditoria.

IA generativa e componentes de interface não são fontes adequadas para cálculos
financeiros.

## Decisão

Criar motor de cálculo determinístico, independente da interface e da IA.

Regras financeiras devem:

- usar Decimal;
- possuir testes unitários;
- ser versionáveis;
- ser auditáveis;
- produzir o mesmo resultado para a mesma entrada;
- permanecer separadas de componentes React e rotas de apresentação.

## Consequências

### Positivas

- Maior confiabilidade;
- Testes isolados;
- Auditoria;
- Reuso em múltiplas telas e relatórios;
- Menor risco de erro por arredondamento.

### Negativas

- Desenvolvimento inicial mais cuidadoso;
- Maior necessidade de documentação e cenários de teste.