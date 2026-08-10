# Fase 06 — Dados de Mercado e Gráficos

## Objetivo

Exibir dados internos de mercado com transparência e permitir gráficos configuráveis.

## Pacote 06.01 — Ativos, cotações e ingestão interna

### Incluído

- Cadastro normalizado de ativos;
- Bolsa;
- Moeda;
- Cotações;
- Dados históricos;
- Fonte do dado;
- Data/hora de referência;
- Adaptador de provedor;
- Job de ingestão;
- Aviso de atraso.

### Fora do escopo

- Tempo real;
- Fonte paga;
- Candlestick;
- Indicadores técnicos avançados;
- Exterior completo.

### Critérios de aceite

- [ ] Cotação vem do banco interno;
- [ ] Usuário não chama diretamente provedor externo;
- [ ] Data/hora e atraso são exibidos;
- [ ] Job é idempotente;
- [ ] Fonte é rastreável;
- [ ] Adaptador pode ser substituído.

## Pacote 06.02 — Gráficos e preferências

### Incluído

- Linha;
- Área;
- Barras;
- Rosca;
- Preferência por usuário e contexto;
- Dashboard;
- Gráficos de alocação;
- Gráficos de evolução;
- Paginação/limite de dados históricos.

### Fora do escopo

- Candlestick;
- Heatmap;
- Indicadores técnicos;
- Editor visual livre de dashboards.

### Critérios de aceite

- [ ] Usuário escolhe gráfico por área;
- [ ] Preferência é persistida;
- [ ] Um usuário não altera preferência de outro;
- [ ] Gráfico não carrega histórico ilimitado;
- [ ] Dados financeiros exibidos mantêm precisão adequada.