import { inngest } from "@/inngest/client";

// STUB: nao agendado por causa do R3.3 do fases.md (Inngest free tier = 100 exec/mes).
// Para ativar a sincronizacao periodica, trocar o trigger de "event" para "cron"
// e agendar a cada 15min. Manter o stub atende o entregavel do indice.md sem
// custar execucao no free tier.
export const refreshQuotes = inngest.createFunction(
  {
    id: "refresh-quotes",
    name: "Refresh stale quotes (stub)",
    triggers: [{ event: "quotes/refresh.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { name: string; data: unknown };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    await step.run("log-stub", async () => {
      console.log("[refresh-quotes] stub invoked", event);
    });
    return { ok: true, stub: true };
  }
);
