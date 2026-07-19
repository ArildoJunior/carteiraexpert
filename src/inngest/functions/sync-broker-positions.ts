import { inngest } from "@/inngest/client";

// TODO Cap 17: implementar sync periodica com Pluggy
// Cron: "0 4,10,16,22 * * *" (timezone: "America/Sao_Paulo")
// Reusar: runImport substituido por syncIntegration (que vai chamar PluggyConnector)
// Concurrency: { limit: 5 }
// Fluxo esperado:
//   1. Itera users com broker_connections.provider = "pluggy" AND status = "active"
//   2. Para cada user, busca accounts/transactions via PluggyConnector.fetchTransactions(since: lastImportAt)
//   3. Persiste via importQueue (mesmo caminho do manual - terreno pronto)
//   4. Atualiza broker_connections.lastImportAt
//   5. Em caso de erro (token expirado), marca connection como expired e cria audit
// Fan-out por user com inngest.step.sendEvent
export const syncBrokerPositions = inngest.createFunction(
  {
    id: "sync-broker-positions",
    name: "Sync Broker Positions (stub)",
    triggers: [{ event: "broker/sync.requested" }],
  },
  async () => {
    throw new Error(
      "syncBrokerPositions: nao implementado. Veja comentario no topo. Cap 17 entrega."
    );
  }
);
