# Fase 08 — Ativos Internacionais, Câmbio e Criptoativos

## Objetivo

Expandir a carteira para patrimônio global sem perder moeda de origem, precisão ou rastreabilidade.

## Pacote 08.01 — Ativos globais e câmbio

### Incluído

- Ativos em USD inicialmente;
- Bolsa estrangeira;
- Moeda de negociação;
- Câmbio USD/BRL;
- Posição em moeda original;
- Consolidação em BRL;
- Separação visual entre retorno do ativo e efeito cambial;
- Histórico de câmbio;
- Taxas de operação.

### Fora do escopo

- Todas as bolsas globais;
- Tributação internacional completa;
- Integração com corretoras estrangeiras;
- Câmbio em tempo real.

### Critérios de aceite

- [ ] Operação preserva moeda original;
- [ ] Carteira pode ser vista em USD e BRL;
- [ ] Conversão possui fonte e data;
- [ ] Retorno do ativo e efeito cambial não são confundidos;
- [ ] Testes cobrem conversão e precisão.

## Pacote 08.02 — Criptoativos iniciais

### Incluído

- BTC;
- ETH;
- Estrutura extensível para outros ativos;
- Compra;
- Venda;
- Transferência interna;
- Taxa de rede;
- Exchange;
- Carteira de autocustódia;
- Alta precisão;
- Posição consolidada;
- Cotação de referência.

### Fora do escopo

- DeFi complexo;
- Staking completo;
- NFT;
- Integração automática com exchanges;
- Trading;
- Recomendação de cripto.

### Critérios de aceite

- [ ] Transferência interna não é tratada como venda;
- [ ] Taxa de rede é registrada;
- [ ] Quantidade suporta alta precisão;
- [ ] Usuário separa exchange e autocustódia;
- [ ] Custo médio é calculado corretamente;
- [ ] Testes cobrem compra, venda e transferência.