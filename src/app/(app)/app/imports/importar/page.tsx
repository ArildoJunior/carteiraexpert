import { brokerConnectionsTable, brokersTable } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { ImportarClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const userId = await getUserIdOrRedirect();

  const connections = await db
    .select({
      id: brokerConnectionsTable.id,
      status: brokerConnectionsTable.status,
      brokerSlug: brokersTable.slug,
      brokerName: brokersTable.name,
    })
    .from(brokerConnectionsTable)
    .innerJoin(brokersTable, eq(brokersTable.id, brokerConnectionsTable.brokerId))
    .where(eq(brokerConnectionsTable.userId, userId))
    .orderBy(desc(brokerConnectionsTable.createdAt));

  const active = connections.filter((c) => c.status === "active");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importar arquivo</h1>
        <p className="text-muted-foreground">
          Selecione uma conexao e faca upload do arquivo de transacoes.
        </p>
      </div>
      <ImportarClient
        connections={active.map((c) => ({
          id: c.id,
          brokerSlug: c.brokerSlug,
          brokerName: c.brokerName,
        }))}
      />
    </div>
  );
}
