# Fase 03 — Núcleo de Carteira

## Objetivo

Permitir que o usuário registre operações manualmente e acompanhe posição e custo médio.

## Pacote 03.01 — Ativos, carteiras e eventos

### Incluído

- Cadastro de carteira;
- Ativos brasileiros iniciais;
- Tipos de ativo;
- Eventos de carteira;
- Compra;
- Venda;
- Taxas;
- Datas de negociação;
- Datas de liquidação quando aplicável;
- Auditoria de criação.

### Fora do escopo

- Importação;
- Eventos corporativos;
- Cotações externas;
- Tributário;
- Opções.

### Critérios de aceite

- [ ] Usuário cria carteira própria;
- [ ] Usuário cria compra e venda;
- [ ] Taxas são persistidas;
- [ ] Evento pertence a apenas uma carteira;
- [ ] Usuário A não acessa carteira do usuário B.

## Pacote 03.02 — Motor de posição e custo médio

### Incluído

- Projeção de posição;
- Custo médio;
- Resultado básico de venda;
- Reprocessamento de ativo;
- Idempotência;
- Testes de cenários financeiros.

### Fora do escopo

- Rentabilidade com dados de mercado;
- IR;
- Split;
- Cripto;
- Câmbio.

### Critérios de aceite

- [ ] Compra atualiza posição;
- [ ] Venda reduz posição;
- [ ] Taxas de compra afetam custo;
- [ ] Venda não altera custo médio remanescente indevidamente;
- [ ] Reprocessamento não duplica posição;
- [ ] Casos de borda são testados.

## Pacote 03.03 — Histórico e dashboard básico

### Incluído

- Lista de operações;
- Histórico de eventos;
- Posição por ativo;
- Resumo de carteira;
- Dashboard sem cotações externas;
- Edição controlada ou reversão auditável.

### Fora do escopo

- Gráficos avançados;
- Dados de mercado;
- Plano Premium;
- PDF.

### Critérios de aceite

- [ ] Usuário visualiza somente próprios eventos;
- [ ] Histórico possui origem e data;
- [ ] Alterações ficam auditáveis;
- [ ] Dashboard usa projeções, não cálculo completo no cliente.