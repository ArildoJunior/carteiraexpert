# Fase 04 — Eventos Corporativos

## Objetivo

Implementar o diferencial central: tratamento confiável de eventos corporativos.

## Pacote 04.01 — Split e grupamento

### Incluído

- Split;
- Grupamento;
- Regras de multiplicação/divisão de quantidade;
- Ajuste de preço médio;
- Frações, quando aplicável;
- Reprocessamento;
- Visualização antes/depois;
- Auditoria da regra aplicada.

### Fora do escopo

- Subscrição;
- Cisão;
- Incorporação;
- Troca de ticker;
- Eventos complexos de reorganização societária.

### Critérios de aceite

- [ ] Split ajusta quantidade corretamente;
- [ ] Split preserva custo econômico total;
- [ ] Grupamento ajusta quantidade corretamente;
- [ ] Frações são identificadas;
- [ ] Reprocessamento é idempotente;
- [ ] Casos reais e sintéticos são testados.

## Pacote 04.02 — Bonificação e proventos

### Incluído

- Bonificação;
- Dividendos;
- JCP;
- Registro de data-com e data de pagamento quando disponível;
- Impacto na posição;
- Registro de origem;
- Visualização no histórico.

### Fora do escopo

- Tributação completa;
- Reinvestimento automático;
- Subscrição;
- Amortização.

### Critérios de aceite

- [ ] Bonificação ajusta posição conforme regra;
- [ ] Dividendos não alteram quantidade;
- [ ] Eventos ficam vinculados ao ativo;
- [ ] Usuário consegue conferir regra e resultado;
- [ ] Há testes de cálculo.