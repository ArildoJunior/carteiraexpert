# Playbook Operacional — Automação e Resiliência da Ingestão de Dados de Mercado
## CarteiraExpert — B3 COTAHIST e Fontes Oficiais

**Versão:** 1.0.0  
**Data:** 03 de setembro de 2026  
**Classificação:** Operacional / Segurança / Automação  
**Escopo:** Ingestão de Cotações Históricas e Diárias da B3 (`COTAHIST`) e Demonstrações CVM

---

## 1. Visão Geral e Arquitetura

O CarteiraExpert adota uma arquitetura de **ingestão stateless acionável externamente**.

### Princípios Invioláveis de Arquitetura:
1. **Zero Daemon Interno:** O processo web do Next.js NUNCA mantém `setInterval`, `node-cron`, loops ou temporizadores internos na memória.
2. **Desacoplamento de Infraestrutura:** A ingestão pode ser disparada por:
   - **CLI do Sistema Operacional:** Execução direta no host/container via `pnpm run market:ingest`;
   - **Agendador Externo via HTTP:** Disparo de `POST /api/jobs/ingest` por serviços gerenciados (GCP Cloud Scheduler, AWS EventBridge, GitHub Actions ou crontab).
3. **Exclusão Mútua Distribuída (Advisory Lock):** Previne rigorosamente que duas execuções concorrentes (manual ou automática) processem lotes simultaneamente no PostgreSQL.
4. **Idempotência Estrita:** Reprocessar o mesmo lote ou arquivo (idêntico SHA-256 ou record hash) não duplica registros nem gera inconsistência contábil.
5. **Auditoria Determinística:** Toda execução é registrada na tabela `audit_logs` sem vazamento de senhas ou tokens.

---

## 2. Modos de Execução

### Modo 1: Execução Manual via CLI (Operador ou Script Local)

Comando oficial do `package.json`:
```bash
# Ingestão de arquivos diários/anuais pendentes na pasta canônica (.local-data/cotahist)
pnpm run market:ingest --all-cotahist

# Ingestão de um arquivo ZIP específico
pnpm run market:ingest --cotahist-file="./caminho/COTAHIST_D03092026.ZIP"

# Simulação sem escrita no banco (dry-run)
pnpm run market:ingest --all-cotahist --dry-run
```

**Comportamento de Lock:**
A CLI adquire o advisory lock no PostgreSQL (`pg_try_advisory_lock(42100)`). Se uma execução agendada já estiver em andamento, a CLI é encerrada com código de saída `1` e mensagem explicativa.

---

### Modo 2: Execução Agendada via Scheduler Externo (HTTP)

O agendador de nuvem contratado envia uma requisição `POST` autenticada para o endpoint dedicado:

- **URL:** `POST https://app.carteiraexpert.com.br/api/jobs/ingest`
- **Cabeçalhos Obrigatórios:**
  - `Authorization: Bearer <CRON_SECRET>` **ou**
  - `x-cron-secret: <CRON_SECRET>`
- **Segurança:**
  - O segredo **nunca** é aceito via query string (`?secret=...` retorna HTTP 400 Bad Request);
  - Segredo ausente ou incorreto retorna HTTP 401 Unauthorized;
  - Se outro job estiver rodando, retorna HTTP 409 Conflict com `{ status: "locked" }`;
  - Sucesso retorna HTTP 200 OK com relatório detalhado de contagens.

#### Exemplo com Crontab do Linux:
```cron
# Todos os dias úteis às 22:30 (horário de Brasília) após fechamento do pregão B3
30 22 * * 1-5 curl -s -X POST https://app.carteiraexpert.com.br/api/jobs/ingest \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" >> /var/log/carteiraexpert-ingest.log 2>&1
```

#### Exemplo com GCP Cloud Scheduler:
- **Target:** HTTP
- **URL:** `https://app.carteiraexpert.com.br/api/jobs/ingest`
- **HTTP Method:** `POST`
- **HTTP Headers:** `Authorization: Bearer [SECRET_DO_SECRET_MANAGER]`
- **Schedule:** `30 22 * * 1-5` (America/Sao_Paulo)

#### Exemplo com AWS EventBridge / Lambda / ECS Task:
- Disparo de target API Destination com cabeçalho `Authorization` armazenado no AWS Secrets Manager.

---

## 3. Exclusão Mútua: PostgreSQL Advisory Lock

O CarteiraExpert reserva a faixa de chaves `42100..42199` para sincronização de jobs:

| Chave Numérica | Finalidade | Descrição |
| :--- | :--- | :--- |
| `42100` | `MARKET_DATA_RUNNER` | Lock mestre para o runner de dados de mercado |
| `42101` | `B3_COTAHIST_INGESTION` | Lock específico de carga de séries históricas B3 |
| `42102` | `CVM_DFP_INGESTION` | Lock específico de carga contábil CVM DFP |

### Garantias de Liberação:
- A conexão utilizada para adquirir o lock é **dedicada (`max: 1`)**, garantindo que a mesma sessão PostgreSQL que adquiriu (`pg_try_advisory_lock`) execute a liberação (`pg_advisory_unlock`) no bloco `finally`.
- Em caso de falha fatal do processo ou encerramento do container, o PostgreSQL fecha a conexão TCP e **libera automaticamente** o lock de sessão.

---

## 4. Idempotência e Prevenção de Duplicidade

1. **Hash SHA-256 do Lote:** Todo arquivo compactado tem seu SHA-256 calculado antes da extração. Se o hash já constar com status `COMPLETED` na tabela `b3_cotahist_batches`, a execução é classificada como `DUPLICATE` e o arquivo é pulado sem reinserção.
2. **Hash Único por Cotação (`record_hash`):** A tabela `b3_historical_quotes` possui constraint de unicidade (`uq_b3_historical_quotes_record_hash`) derivada de `tradeDate + bdiCode + ticker + marketType + isin + distributionNumber`.
3. **Persistência Atômica:** Lotes interrompidos são marcados como `FAILED` e podem ser reprocessados com segurança (`--force`).

---

## 5. Política de Retries para Falhas Transitórias

Para integrações que realizam chamadas HTTP ou downloads remotos:
- **Erros Transitórios (Passíveis de Retry):**
  - Timeouts de rede (`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`);
  - HTTP 429 (Rate Limit);
  - HTTP 500, 502, 503, 504 (Erros de servidor de origem).
- **Parâmetros do Retry:**
  - Máximo de 3 tentativas;
  - Backoff exponencial com jitter (`500ms -> 1000ms -> 2000ms`, teto máximo de `5000ms`);
- **Erros Não Repetíveis (Aborto Imediato):**
  - Erros de formato/parsing (layout corrompido);
  - Falha de validação de schema Zod;
  - Erro de autenticação HTTP 401 ou 403;
  - Violação de integridade referencial.

---

## 6. Monitoramento de Frescor dos Dados de Mercado

O frescor das cotações é apurado dinamicamente pela função `deriveFreshnessStatus` e exibido no componente `QuoteFreshnessBadge`:

| Status | Critério | Rótulo Visual |
| :--- | :--- | :--- |
| `realtime` | Cotação confirmada em tempo real | Badge Verde (Tempo Real) |
| `delayed_15m` | Atraso regulamentar de 15 minutos | Badge Amarelo (15m Atraso) |
| `eod` | Último fechamento de pregão (até 5 dias úteis) | Badge Neutro (Fechamento) |
| `stale` | Mais de 5 dias úteis sem cotação nova | Badge Vermelho (Defasado) |
| `unquoted` | Sem histórico de cotação registrado | Badge Cinza (Sem Cotação) |

**Regra Ética e Regulatória:** Cotações defasadas são explicitamente rotuladas e jamais apresentadas como tempo real. A plataforma não faz sugestão de investimento.

---

## 7. Registro de Auditoria

Toda execução bem-sucedida ou com falha gera um registro imutável em `audit_logs`:
- `tableName`: `'b3_cotahist_batches'`
- `action`: `'MARKET_DATA_RUNNER_COMPLETED'`
- `source`: `'job'`
- `newValue`: Contém métricas numéricas agregadas (arquivos processados, linhas lidas, novas cotações, conflitos ignorados, rejeições e duração em ms).
- **Proibição Estrita:** Segredos (`CRON_SECRET`, `DATABASE_URL`) jamais constam nos logs.
