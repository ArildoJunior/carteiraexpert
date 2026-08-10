# Regras de Desenvolvimento

## Linguagem e qualidade

- TypeScript em modo strict.
- Validar entradas com Zod.
- Usar Biome para lint e formatação.
- Não usar `any` sem justificativa técnica documentada.
- Código, tipos, tabelas, APIs e variáveis em inglês.
- Textos da interface em português brasileiro.
- Não colocar regra de negócio em componentes React.
- Não acessar banco de dados diretamente a partir de componentes visuais.

## Domínio financeiro

- Usar Decimal para todos os cálculos financeiros.
- Usar NUMERIC no PostgreSQL para persistência financeira.
- Não usar ponto flutuante para valores financeiros.
- Não recalcular toda a carteira em toda abertura de dashboard.
- Resultados derivados podem ser armazenados como projeções ou resumos.
- O evento original deve continuar preservado.
- Toda regra de cálculo deve possuir testes unitários.

## Eventos

- Eventos são imutáveis.
- Edição de lançamento deve gerar auditoria.
- Reversão deve ser explícita.
- Jobs devem ser idempotentes.
- Reprocessamento não pode duplicar resultados.
- O mesmo evento não pode gerar duas vezes o mesmo efeito financeiro.

## Segurança

- Autorização sempre no servidor.
- Nunca confiar em `userId` enviado pelo cliente.
- Consultas sempre filtradas por proprietário ou permissão explícita.
- Documentos financeiros são privados.
- URLs de documentos devem ser temporárias e assinadas.
- Ações sensíveis exigem logs de auditoria.
- Dados de produção não devem ser usados em ambiente de teste sem anonimização.

## IA editorial

- IA não calcula valores.
- IA não cria transações.
- IA não altera carteira.
- IA não publica automaticamente.
- Toda publicação exige aprovação humana.
- Todo conteúdo deve preservar vínculo com documento-fonte.