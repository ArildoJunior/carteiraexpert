import { inngest } from "@/inngest/client";

// STUB: Cap 7 - importacao manual CSV (processamento on-demand).
// O processamento real acontece sincronamente em /api/v1/integrations/import.
// Este handler so registra auditoria assincrona para o evento.
// Cap 17 vai SUBSTITUIR por syncBrokerPositions que faz chamada HTTP a Pluggy.
export const importCsvHandler = inngest.createFunction(
  {
    id: "broker-import-csv",
    name: "Broker Import CSV (stub)",
    triggers: [{ event: "broker/import.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      name: string;
      data: { userId: string; brokerSlug: string; importJobId: string };
    };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const { userId, brokerSlug, importJobId } = event.data;

    await step.run("log-event", async () => {
      console.log("[import-csv] broker/import.requested recebido", {
        userId,
        brokerSlug,
        importJobId,
      });
      return { logged: true };
    });

    return { received: true, userId, brokerSlug, importJobId };
  }
);
