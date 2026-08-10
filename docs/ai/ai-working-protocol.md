# Protocolo de Trabalho com IA

## Regra central

Cada solicitação de implementação deve conter apenas o contexto necessário
para aquela entrega.

Não enviar o projeto inteiro em toda conversa.

## Contexto mínimo obrigatório por tarefa

Sempre anexar ou colar:

1. docs/ai/project-context.md
2. docs/ai/coding-rules.md
3. docs/delivery/delivery-status.md
4. Documento da fase atual
5. ADRs relacionados à tarefa
6. Documento de domínio relacionado
7. Arquivos atuais que serão alterados, quando necessário
8. Brief da tarefa

## Fluxo obrigatório

1. Criar ou atualizar o brief;
2. Solicitar plano de implementação, sem código;
3. Validar o plano;
4. Solicitar implementação limitada ao escopo;
5. Solicitar revisão independente;
6. Executar lint, typecheck, testes e build;
7. Revisar manualmente o comportamento;
8. Registrar entrega em delivery-status.md;
9. Criar commit;
10. Atualizar ADR se uma decisão arquitetural foi alterada.

## Proibições

- Não implementar duas macrofases ao mesmo tempo.
- Não permitir refatorações globais durante uma tarefa pontual.
- Não aceitar mudanças em arquivos não autorizados sem justificativa.
- Não iniciar implementação sem critérios de aceite.
- Não considerar uma tarefa concluída sem testes.
- Não confiar em afirmações da IA sem executar os comandos localmente.

## Critério para dividir uma entrega

Dividir quando a tarefa:

- Alterar mais de um domínio relevante;
- Exigir mais de 8 a 12 arquivos significativos;
- Misturar banco, autenticação, UI, cálculo e integração externa;
- Possuir mais de 10 critérios de aceite;
- Exigir decisões ainda não documentadas;
- Puder ser validada parcialmente de forma independente.

## Padrão de commits

feat(modulo): descrição objetiva
fix(modulo): correção objetiva
test(modulo): cenário coberto
docs(area): documentação alterada
refactor(modulo): refatoração sem mudança funcional
chore(area): manutenção técnica