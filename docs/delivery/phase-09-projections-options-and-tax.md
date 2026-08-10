# Fase 09 — Projeções, Opções, Alertas e Apoio Tributário

## Objetivo

Oferecer planejamento, organização operacional e apoio tributário sem recomendação ou execução.

## Pacote 09.01 — Projeções e simulações

### Incluído

- Simulação de aporte;
- Horizonte temporal;
- Premissas de rentabilidade;
- Cenários conservador, base e otimista;
- Simulação de carteira;
- Simulação de ativo;
- Reinvestimento de proventos como premissa;
- Gráficos de projeção;
- Avisos obrigatórios.

### Fora do escopo

- IA calculando projeção;
- Recomendação de alocação;
- Garantia de retorno;
- Otimização automática de carteira.

### Critérios de aceite

- [ ] Cálculos são feitos pelo motor financeiro;
- [ ] Premissas são exibidas;
- [ ] Simulação não altera carteira real;
- [ ] Resultados incluem aviso obrigatório;
- [ ] Há testes de cálculo e arredondamento.

## Pacote 09.02 — Opções e alertas operacionais

### Incluído

- Cadastro de call e put;
- Ativo-objeto;
- Strike;
- Vencimento;
- Prêmio;
- Quantidade;
- Status;
- Alertas de vencimento;
- Registro de rolagem;
- Registro de encerramento;
- Aviso institucional fixo.

### Fora do escopo

- Execução;
- Recomendação de estratégia;
- Robô de rolagem;
- Envio de ordem;
- Cálculos avançados de gregas no MVP.

### Critérios de aceite

- [ ] Usuário cadastra posição de opção;
- [ ] Alerta é gerado antes do vencimento;
- [ ] Sistema não sugere comprar, vender ou rolar;
- [ ] Sistema não envia ordem;
- [ ] Alertas são idempotentes;
- [ ] Aviso de finalidade é exibido.

## Pacote 09.03 — Apoio tributário

### Incluído

- Organização mensal;
- Resultado por período;
- Lucros e prejuízos;
- Avisos de possível necessidade de recolhimento;
- Relatório anual para contador;
- Exportação estruturada;
- Regras versionadas;
- Disclaimers tributários.

### Fora do escopo

- Emissão de DARF;
- Pagamento;
- Obrigação fiscal definitiva;
- Substituição de contador;
- Cobertura tributária integral de todos os ativos no primeiro lançamento.

### Critérios de aceite

- [ ] Relatório mostra origem dos dados;
- [ ] Usuário vê aviso de apoio tributário;
- [ ] Sistema não afirma obrigação definitiva sem ressalvas;
- [ ] Sistema não gera DARF;
- [ ] Regras possuem versão;
- [ ] Há testes de cálculo aplicáveis.