# Domínio de Opções e Derivativos — Diretrizes e Modelagem

## 1. Visão Geral e Finalidade

O módulo de opções do **CarteiraExpert** tem finalidade estritamente **informativa, organizacional e educacional**.

O produto fornece ao investidor ferramentas para:
- Cadastrar e catalogar seus contratos de opções (Call e Put, estilo Americano e Europeu, posições compradas e vendidas);
- Acompanhar datas de vencimento com base no calendário de dias úteis da B3;
- Receber alertas visuais de proximidade de vencimento (D-5 a D-1 e D-0);
- Visualizar parâmetros de sensibilidade e gregas teóricas (Delta, Gamma, Theta, Vega e Rho) calculadas pelo modelo clássico de Black-Scholes;
- Simular curvas de payoff e lucros/prejuízos teóricos no vencimento para diferentes níveis de preço do ativo-objeto;
- Associar contratos opcionalmente à conta de custódia (`custody_account_id`) e ao ativo-objeto (`underlying_asset_id`) do catálogo canônico.

---

## 2. Limites Regulatórios e Funcionais Inegociáveis

Em estrita conformidade com a regulamentação do mercado de capitais brasileiro (CVM e Anbima) e os princípios fundamentais da plataforma:

1. **Vedação de Envio de Ordens:** A plataforma não roteia, não transmite, não envia e não executa ordens de compra, venda, exercício ou rolagem em bolsas ou corretoras.
2. **Vedação de Recomendação:** A plataforma não emite recomendações de investimento, não sugere estratégias de derivativos (ex: travas, borboletas, condors, financiamentos) e não fornece sinais operacionais de compra ou venda.
3. **Vedação de Exercício Automático:** A plataforma não exerce opções automaticamente e não presume a decisão do custodiante.
4. **Segregação Patrimonial:** O módulo de opções é uma camada de controle analítico. O registro de contratos de opções não altera posições contábeis de ações em custódia, não recalcula custo médio do ativo-objeto e não gera eventos operacionais em `portfolio_events`.
5. **Aviso de Risco Elevado:** Operações com opções envolvem elevado grau de risco, com possibilidade de perda total do prêmio pago ou perdas financeiras expressivas em posições lançadas/descobertas.

---

## 3. Modelo Matemático de Black-Scholes em `Decimal`

### 3.1. Variáveis de Entrada
- $S$: Preço à vista do ativo-objeto (*Spot Price*);
- $K$: Preço de exercício da opção (*Strike Price*);
- $T$: Prazo até o vencimento em fração de ano ($\text{dias úteis} / 252$ ou $\text{dias corridos} / 365$);
- $r$: Taxa livre de risco contínua anualizada (taxa DI/Selic);
- $\sigma$: Volatilidade implícita anualizada do ativo.

### 3.2. Fórmulas de Precificação Teórica
$$d_1 = \frac{\ln(S / K) + (r + \sigma^2 / 2) T}{\sigma \sqrt{T}}$$
$$d_2 = d_1 - \sigma \sqrt{T}$$

- **Call Teórica:** $C = S \cdot N(d_1) - K \cdot e^{-rT} \cdot N(d_2)$
- **Put Teórica:** $P = K \cdot e^{-rT} \cdot N(-d_2) - S \cdot N(-d_1)$

Onde $N(x)$ é a função de distribuição normal acumulada e $\phi(x) = \frac{1}{\sqrt{2\pi}} e^{-x^2 / 2}$ é a densidade de probabilidade da normal padrão.

### 3.3. Gregas Informativas
- **Delta ($\Delta$):**
  - $\Delta_{\text{call}} = N(d_1)$ (intervalo $[0, 1]$);
  - $\Delta_{\text{put}} = N(d_1) - 1 = -N(-d_1)$ (intervalo $[-1, 0]$).
- **Gamma ($\Gamma$):** $\Gamma = \frac{\phi(d_1)}{S \cdot \sigma \cdot \sqrt{T}}$ (idêntico para call e put).
- **Theta ($\Theta$):** Variação do preço da opção por decaimento temporal de 1 dia:
  - $\Theta_{\text{call}} = -\frac{S \cdot \phi(d_1) \cdot \sigma}{2 \sqrt{T}} - r \cdot K \cdot e^{-rT} \cdot N(d_2)$;
  - $\Theta_{\text{put}} = -\frac{S \cdot \phi(d_1) \cdot \sigma}{2 \sqrt{T}} + r \cdot K \cdot e^{-rT} \cdot N(-d_2)$.
- **Vega ($\nu$):** Sensibilidade do preço da opção a uma variação de 1% na volatilidade implícita:
  - $\nu = \frac{S \cdot \sqrt{T} \cdot \phi(d_1)}{100}$.
- **Rho ($\rho$):** Sensibilidade a uma variação de 1% na taxa livre de risco:
  - $\rho_{\text{call}} = \frac{K \cdot T \cdot e^{-rT} \cdot N(d_2)}{100}$;
  - $\rho_{\text{put}} = \frac{-K \cdot T \cdot e^{-rT} \cdot N(-d_2)}{100}$.

---

## 4. Controle de Vencimentos e Alertas B3

As opções negociadas no mercado financeiro brasileiro vencem tipicamente na terceira sexta-feira do mês de cada vencimento (conforme regras operacionais da B3).

O módulo classifica cada contrato aberto nos seguintes status temporais:
1. `DISTANTE`: Mais de 5 dias úteis até o vencimento.
2. `PROXIMO_VENCIMENTO` (D-5 a D-1): Entre 1 e 5 dias úteis até o vencimento (sinal de atenção para acompanhamento operacional do investidor).
3. `VENCENDO_HOJE` (D-0): Vencimento ocorre no dia de negociação atual.
4. `VENCIDO`: Vencimento já transcorrido.

O cômputo utiliza dias úteis B3, expurgando fins de semana e feriados nacionais vigentes no mercado brasileiro.

---

## 5. Modelagem de Dados e Persistência

Os contratos de opções pertencem a uma carteira do usuário e são persistidos na tabela `options_contracts`, garantindo isolamento multitenant no servidor.

Campos principais:
- `id`: Identificador único (UUID);
- `user_id`: Dono da opção (FK -> `users`);
- `portfolio_id`: Carteira associada (FK -> `portfolios` ON DELETE CASCADE);
- `underlying_asset_id`: Ativo-objeto (FK -> `assets` ON DELETE RESTRICT);
- `custody_account_id`: Conta de custódia na corretora (FK -> `custody_accounts` ON DELETE SET NULL, opcional);
- `ticker`: Código de negociação da opção (ex: `PETRH380`);
- `option_type`: `CALL` ou `PUT`;
- `option_style`: `AMERICAN` ou `EUROPEAN`;
- `direction`: `BUY` (comprada / titular) ou `SELL` (vendida / lançador);
- `strike_price`: Preço de exercício (`NUMERIC(28, 10)`);
- `premium_paid_received`: Prêmio unitário pago ou recebido (`NUMERIC(28, 10)`);
- `quantity`: Quantidade de opções (`NUMERIC(28, 10)`);
- `expiration_date`: Data de vencimento (`DATE`);
- `status`: `OPEN` (aberta), `CLOSED` (encerrada/zerada) ou `EXPIRED` (vencida);
- `notes`: Anotações operacionais do usuário;
- `created_at`, `updated_at`, `deleted_at`: Auditoria e soft-delete.

Operações de criação, edição e arquivamento são registradas em `audit_logs`.
