# ADR-012 — Modelagem Relacional de Instituições e Contas de Custódia

- **Status:** Aprovado e implementado
- **Data:** 2026-09-04
- **Commit de Referência:** `78f2a5c`
- **Migração Relacionada:** `0020_add_custody_entities.sql`
- **Decisores:** Equipe do CarteiraExpert
- **Escopo:** Domínio Patrimonial, Custódia Institucional, Carteiras, Eventos e Contas de Caixa

---

## 1. Contexto e Problema

Nas fases iniciais da plataforma, a origem de um lançamento operacional na tabela `portfolio_events` era registrada exclusivamente por meio da coluna textual `source` (com valor padrão `'manual'`). Esse modelo simplificado apresentava limitações estruturais:

1. **Ausência de autoridade cadastral:** Impossibilidade de padronizar corretoras, bancos e exchanges (ex: variações de grafia como "XP", "XP Investimentos", "xp");
2. **Inexistência de contas segregadas:** Usuários que operam em múltiplas corretoras não tinham como diferenciar em qual conta ou instituição determinado lote de ativos ou saldo de caixa estava custodiado;
3. **Falta de integridade relacional:** Não havia chave estrangeira conectando eventos de carteira, contas de liquidação monetária e lotes de importação às instituições reais;
4. **Filtros e relatórios imprecisos:** O extrato histórico não permitia filtragem determinística por instituição de custódia.

---

## 2. Decisão Arquitetural

Adota-se a **Modelagem Relacional de Duas Camadas para Custódia**, separando o catálogo canônico de instituições das contas específicas abertas pelos usuários em suas carteiras.

### 2.1. Entidades Criadas

1. **`custody_institutions` (Catálogo Canônico Global):**
   - Tabela de referência pública/compartilhada gerenciada pela plataforma.
   - Colunas: `id` (UUID, PK), `name` (TEXT, NOT NULL), `code` (TEXT, UNIQUE, opcional), `country` (TEXT, default `'BRA'`), `status` (TEXT, default `'active'`), `created_at`, `updated_at`.
   - Pré-populada na migração com catálogo inicial das principais instituições operadas no mercado brasileiro e internacional: XP Investimentos, BTG Pactual, NuInvest, Clear Corretora, Banco Inter, Avenue Securities, Interactive Brokers (IBKR), Binance, entre outras.

2. **`custody_accounts` (Contas de Custódia do Usuário na Carteira):**
   - Representa a conta ou custódia específica mantida pelo investidor na instituição.
   - Colunas: `id` (UUID, PK), `portfolio_id` (UUID, FK -> `portfolios.id` ON DELETE CASCADE), `institution_id` (UUID, FK -> `custody_institutions.id` ON DELETE RESTRICT), `name` (TEXT, NOT NULL), `account_number` (TEXT, opcional), `status` (TEXT, default `'active'`), `created_at`, `updated_at`, `deleted_at` (TIMESTAMPTZ, opcional).
   - Suporte a status `'active'` e `'archived'`, permitindo inativar contas encerradas sem perder o histórico.

### 2.2. Vínculos Opcionais com `ON DELETE SET NULL`

A coluna opcional `custody_account_id` (UUID) foi adicionada com chave estrangeira apontando para `custody_accounts(id)` e regra de deleção `ON DELETE SET NULL` nas seguintes tabelas:

- **`portfolio_events.custody_account_id`:** vincula a compra, venda, transferência ou ajuste à conta de custódia em que a operação foi executada;
- **`cash_accounts.custody_account_id`:** vincula a conta de caixa da carteira à conta corrente mantida na instituição financeira/corretora;
- **`import_batches.custody_account_id`:** permite associar um lote de importação CSV à corretora emitente da nota ou extrato.

#### Justificativa da Ação Referencial `ON DELETE SET NULL`
Eventos operacionais patrimoniais e transações de caixa são fatos contábeis históricos. Caso uma conta de custódia seja excluída ou desfeita, os lançamentos financeiros já consolidados não podem ser cascateados ou corrompidos. A atribuição de `SET NULL` preserva a integridade matemática da quantidade e custo médio, convertendo a associação institucional em nula sem alterar o cálculo patrimonial.

### 2.3. Segurança Server-Side Anti-IDOR

Toda interação com contas de custódia valida rigorosamente as fronteiras de autorização no servidor:

1. **Validação de Posse da Carteira:** Toda leitura, criação, edição ou arquivamento de conta de custódia valida se o `portfolio_id` pertence ao `user_id` autenticado na sessão (`requireAuth()`), rejeitando tentativas de IDOR com erro de não autorização;
2. **Consistência de Carteira no Lançamento:** Ao registrar um evento operacional (`createPortfolioEvent`) ou movimentação de caixa vinculado a uma `custody_account_id`, o serviço valida se a conta de custódia pertence rigorosamente à mesma carteira informada no evento, impedindo vínculos cruzados entre carteiras distintas do mesmo usuário ou de terceiros;
3. **Imutabilidade de Histórico:** O arquivamento de uma conta de custódia impede novos lançamentos com ela, mas mantém acessíveis todos os eventos históricos previamente vinculados.

### 2.4. Trilha de Auditoria

Criação, edição e exclusão lógica de contas de custódia são registradas transversalmente na tabela `audit_logs`, contendo:
- `table_name`: `'custody_accounts'`;
- `record_id`: UUID da conta de custódia;
- `action`: `'INSERT'`, `'UPDATE'` ou `'DELETE'`;
- `actor_id`: UUID do usuário autenticado;
- `old_value` e `new_value`: snapshots sanitizados do estado da conta.

---

## 3. Consequências

### Positivas
- Rastreabilidade exata de onde cada ativo e recurso financeiro está alocado;
- Extrato `/history` enriquecido com filtro dinâmico por instituição de custódia;
- Compatibilidade integral com eventos anteriores (campo `source` textual preservado como fallback complementar);
- Arquitetura limpa para futuras importações automáticas de notas de corretagem (Open Finance ou extratos de custódia).

### Negativas / Trade-offs
- Aumento da complexidade do schema (duas novas tabelas e três chaves estrangeiras);
- Necessidade de preenchimento e resolução de contas de custódia na interface do usuário (mitigado por campos opcionais que não bloqueiam lançamentos rápidos).
