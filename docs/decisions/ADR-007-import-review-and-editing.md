# ADR-007 — Importações Devem Ser Revisáveis e Editáveis

## Status

Aceito.

## Contexto

PDFs e planilhas podem conter layouts inconsistentes, dados incompletos ou erros
de extração.

O usuário deve poder corrigir quantidade, preço, data, ativo, taxas e tipo de
operação.

## Decisão

Toda importação será tratada inicialmente como candidato a lançamento.

Fluxo:

1. Upload;
2. Extração;
3. Validação;
4. Tela de revisão;
5. Edição pelo usuário;
6. Confirmação;
7. Geração de eventos de carteira;
8. Auditoria.

## Consequências

- Dados importados não são verdade absoluta;
- Usuário mantém responsabilidade sobre confirmação;
- Alterações são auditáveis;
- Não haverá lançamento automático sem revisão no MVP.