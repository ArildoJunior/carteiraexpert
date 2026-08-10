# Princípios do Modelo de Dados

## Fonte de verdade

A fonte de verdade patrimonial são os eventos registrados e aprovados.

Exemplos:

- BUY;
- SELL;
- DIVIDEND;
- JCP;
- SPLIT;
- REVERSE_SPLIT;
- BONUS;
- SUBSCRIPTION;
- TRANSFER_IN;
- TRANSFER_OUT;
- CRYPTO_SWAP;
- OPTION_EXERCISE;
- OPTION_EXPIRATION;
- MANUAL_ADJUSTMENT;
- REVERSAL.

## Eventos imutáveis

Eventos financeiros não devem ser apagados silenciosamente.

Correções devem ocorrer por:

- edição auditada, quando permitida;
- reversão;
- ajuste;
- criação de evento corretivo;
- nova versão rastreável.

## Projeções derivadas

A aplicação pode manter projeções para desempenho:

- posição atual;
- custo médio;
- saldo por moeda;
- rentabilidade;
- resultado mensal;
- resumo tributário;
- dashboard.

Projeções podem ser recalculadas a partir de eventos.

## Precisão

- Moedas e valores: NUMERIC;
- Quantidade de ativos: NUMERIC;
- Criptoativos: precisão superior;
- Datas de negociação e liquidação separadas quando necessário;
- Moeda original sempre preservada;
- Conversão cambial armazenada com origem e data de referência.

## Auditoria

Alterações relevantes devem registrar:

- quem fez;
- quando fez;
- origem;
- valor anterior;
- valor posterior;
- motivo, quando aplicável;
- identificador de correlação;
- referência ao documento de origem, quando houver.