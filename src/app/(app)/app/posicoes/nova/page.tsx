import { TransactionForm } from "@/components/portfolio/transaction-form";
import { assets, brokerageAccounts } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { asc, eq } from "drizzle-orm";

export default async function NovaPosicaoPage() {
  const userId = await getUserIdOrRedirect();

  const accounts = await db
    .select({ id: brokerageAccounts.id, name: brokerageAccounts.name })
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.userId, userId))
    .orderBy(asc(brokerageAccounts.name));

  const assetsList = await db
    .select({
      id: assets.id,
      ticker: assets.ticker,
      name: assets.name,
      assetClass: assets.assetClass,
    })
    .from(assets)
    .orderBy(asc(assets.ticker))
    .limit(500);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nova posicao</h1>
        <p className="text-muted-foreground">Registre uma compra para abrir uma nova posicao.</p>
      </div>
      <TransactionForm accounts={accounts} assets={assetsList} onSuccessRedirect="/app/posicoes" />
    </div>
  );
}
