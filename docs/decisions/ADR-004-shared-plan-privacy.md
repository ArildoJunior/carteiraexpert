# ADR-004 — Preservar Privacidade no Plano Compartilhado

## Status

Aceito.

## Contexto

O plano compartilhado permite que um responsável pagante ofereça benefícios
Premium a 3 até 5 membros.

O pagamento não deve criar acesso a informações financeiras privadas.

## Decisão

A assinatura compartilhada concede apenas entitlements de plano.

O titular pagante pode:

- Gerenciar pagamento;
- Convidar membros;
- Remover membros;
- Consultar status administrativo do grupo.

O titular pagante não pode:

- Visualizar carteira de membros;
- Consultar operações;
- Ver saldos;
- Acessar documentos;
- Ler relatórios tributários;
- Ler alertas;
- Consultar projeções;
- Acessar estudos privados.

## Consequências

- Dados devem ser sempre filtrados pelo usuário proprietário;
- Assinatura e propriedade de carteira são entidades separadas;
- Testes de autorização são obrigatórios;
- Não haverá tela administrativa do grupo exibindo patrimônio de membros.