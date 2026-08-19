# Fase 08 — Ativos Internacionais, Câmbio e Criptoativos

## Objetivo

Permitir o acompanhamento de ativos globais e criptoativos com preservação da moeda de negociação, conversão cambial determinística e alta precisão decimal.

## Estado Atual da Fase

> **Classificação:** **Parcialmente implementada.**  
> O suporte a moedas estrangeiras no catálogo de ativos, taxas de conversão em `exchange_rates`, conversão cambial determinística no valuation e suporte a criptoativos com precisão de 10 casas decimais (`NUMERIC(28, 10)`) estão implementados e testados. Integrações automáticas com exchanges, swaps e custódia Web3 permanecem planejadas.

## Pacote 08.01 — Ativos Globais e Conversão Cambial

### Incluído e Comprovado

- Cadastro de ativos com moeda original (`currency`: USD, EUR, BRL, etc.) e bolsa de negociação;
- Registro de taxas de conversão cambial na tabela `exchange_rates`;
- Conversão monetária determinística para BRL no motor de valuation e evolução patrimonial;
- Tratamento de ausência de taxa cambial na data ou divergência monetária (`CURRENCY_MISMATCH`);
- Lançamentos de eventos operacionais preservando a moeda nativa da operação.

### Planejado / Não Implementado neste Pacote

- Provedores externos de câmbio automatizados em tempo real;
- Decomposição analítica segregada entre retorno do ativo e efeito de variação cambial;
- Integração direta com corretoras internacionais.

### Critérios de Aceite

- [x] Lançamentos preservam a moeda original de negociação;
- [x] Conversão para BRL utiliza taxa de câmbio correspondente com rastreabilidade;
- [x] Suítes de testes cobrindo câmbio e multi-moeda aprovadas;
- [ ] Decomposição analítica de efeito cambial implementada (*Planejado*).

## Pacote 08.02 — Criptoativos e Alta Precisão

### Incluído e Comprovado

- Suporte a criptoativos no catálogo (`assetType = 'crypto'`);
- Suporte a quantidades com alta precisão decimal no banco (`NUMERIC(28, 10)`) e em memória via `Decimal`;
- Operações de compra (`BUY`), venda (`SELL`), entrada (`TRANSFER_IN`) e saída (`TRANSFER_OUT`);
- Armazenamento de taxas operacionais no campo numérico `fees` de cada evento.

### Planejado / Fora do Escopo

- Evento dedicado de permuta direta entre criptoativos (`CRYPTO_SWAP`) (*Planejado*);
- Integração automática com APIs de exchanges (Binance, Coinbase, Mercado Bitcoin, etc.) (*Planejado*);
- Rastreamento on-chain de carteiras Web3 / autocustódia (*Planejado*);
- Recomendação de compra, venda ou staking de criptoativos (*Fora do escopo permanente*).

### Critérios de Aceite

- [x] Quantidades de criptoativos mantêm precisão de até 10 casas decimais sem arredondamento indevido;
- [x] Taxas são registradas no campo `fees` de cada evento;
- [x] Custo médio ponderado é calculado deterministicamente com `Decimal`;
- [ ] Conectores automáticos com exchanges e Web3 (*Planejado*).