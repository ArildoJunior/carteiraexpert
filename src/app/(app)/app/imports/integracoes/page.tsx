import { BrokerCard } from "@/components/portfolio/broker-card";
import { ConnectionStatus } from "@/components/portfolio/connection-status";
import { DisconnectButton } from "@/components/portfolio/disconnect-button";
import { Button } from "@/components/ui/button";
import { brokerConnectionsTable, brokersTable } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  const userId = await getUserIdOrRedirect();

  const connections = await db
    .select({
      id: brokerConnectionsTable.id,
      status: brokerConnectionsTable.status,
      lastImportAt: brokerConnectionsTable.lastImportAt,
      brokerSlug: brokersTable.slug,
      brokerName: brokersTable.name,
      brokerKind: brokersTable.kind,
      brokerProvider: brokersTable.provider,
      logoUrl: brokersTable.logoUrl,
    })
    .from(brokerConnectionsTable)
    .innerJoin(brokersTable, eq(brokersTable.id, brokerConnectionsTable.brokerId))
    .where(eq(brokerConnectionsTable.userId, userId))
    .orderBy(desc(brokerConnectionsTable.createdAt));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integracoes</h1>
          <p className="text-muted-foreground">
            Suas conexoes com corretoras. Importe arquivos manualmente ou conecte via Open Finance.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/imports/importar">
            <Plus className="mr-2 h-4 w-4" />
            Nova importacao
          </Link>
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <h3 className="text-lg font-semibold">Nenhuma conexao ainda</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Faca sua primeira importacao manual de uma corretora.
          </p>
          <Button asChild className="mt-4">
            <Link href="/app/imports/importar">
              <Plus className="mr-2 h-4 w-4" />
              Importar arquivo
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {connections.map((c) => (
            <div key={c.id} className="space-y-2">
              <BrokerCard
                broker={{
                  id: c.id,
                  slug: c.brokerSlug,
                  name: c.brokerName,
                  kind: c.brokerKind,
                  provider: c.brokerProvider,
                  logoUrl: c.logoUrl,
                }}
              />
              <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <ConnectionStatus
                    status={c.status as "active" | "expired" | "disconnected" | "pending"}
                  />
                  {c.lastImportAt && (
                    <span className="text-xs text-muted-foreground">
                      Ultimo: {new Date(c.lastImportAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                {c.status === "active" && <DisconnectButton connectionId={c.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
