import { DegradedBanner } from "@/components/portfolio/degraded-banner";
import { PositionTable } from "@/components/portfolio/position-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { assets, brokerageAccounts, positions } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { getQuotesBatch } from "@/lib/quotes/manager";
import { eq } from "drizzle-orm";
import { Plus, Wallet } from "lucide-react";
import Link from "next/link";

export default async function PosicoesPage() {
  const userId = await getUserIdOrRedirect();

  const rows = await db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      accountName: brokerageAccounts.name,
      assetId: positions.assetId,
      assetTicker: assets.ticker,
      assetName: assets.name,
      assetClass: assets.assetClass,
      sector: assets.sector,
      quantity: positions.quantity,
      averageCost: positions.averageCost,
      isOpen: positions.isOpen,
    })
    .from(positions)
    .innerJoin(assets, eq(positions.assetId, assets.id))
    .innerJoin(brokerageAccounts, eq(positions.accountId, brokerageAccounts.id))
    .where(eq(positions.userId, userId));

  // Fan-out de cotacoes em paralelo (cache + provider)
  const quoteResults = await getQuotesBatch(
    rows.map((r) => ({ ticker: r.assetTicker, assetClass: r.assetClass }))
  );

  const data = rows.map((r) => {
    const qr = quoteResults[r.assetTicker];
    const quote = qr?.ok ? qr.quote : (qr?.staleQuote ?? null);
    const quantity = Number(r.quantity);
    const marketValue = quote ? quote.price * quantity : null;
    return {
      ...r,
      quantity,
      averageCost: Number(r.averageCost),
      quote,
      marketValue,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Posicoes</h1>
          <p className="text-muted-foreground">
            Suas posicoes em todas as contas.{" "}
            <span className="font-medium">
              {data.length} {data.length === 1 ? "posicao" : "posicoes"}
            </span>
            .
          </p>
        </div>
        <Button asChild>
          <Link href="/app/posicoes/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova posicao
          </Link>
        </Button>
      </div>

      <DegradedBanner />

      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Wallet className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Voce ainda nao tem posicoes</p>
              <p className="text-sm text-muted-foreground">
                Adicione sua primeira posicao em ate 60 segundos.
              </p>
            </div>
            <Button asChild>
              <Link href="/app/posicoes/nova">Adicionar primeira posicao</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PositionTable data={data} />
      )}
    </div>
  );
}
