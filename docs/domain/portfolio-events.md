# Eventos de Carteira

## Tipos iniciais

- BUY;
- SELL;
- DIVIDEND;
- JCP;
- SPLIT;
- REVERSE_SPLIT;
- BONUS;
- TRANSFER_IN;
- TRANSFER_OUT;
- MANUAL_ADJUSTMENT;
- REVERSAL.

## Campos mínimos esperados

- id;
- portfolioId;
- assetId;
- type;
- tradeDate;
- settlementDate, quando aplicável;
- quantity;
- unitPrice;
- fees;
- currency;
- source;
- importJobId, quando aplicável;
- createdBy;
- createdAt;
- metadata;
- version.

## Regras

- Evento deve possuir proprietário indireto via carteira;
- Evento não pode ser acessado por outro usuário;
- Correções precisam de auditoria;
- Eventos importados devem indicar origem;
- Valores devem usar Decimal;
- Projeções são derivadas dos eventos;
- Eventos não devem ser apagados silenciosamente.