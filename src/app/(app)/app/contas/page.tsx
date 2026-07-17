import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brokerageAccounts } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";

const TYPE_LABELS: Record<string, string> = {
  brokerage: "Corretora",
  bank: "Banco",
  exchange: "Exchange",
  custodian: "Custodiante",
  wallet: "Carteira",
  other: "Outro",
};

const BROKER_LABELS: Record<string, string> = {
  xp: "XP",
  rico: "Rico",
  btg: "BTG",
  nuinvest: "NuInvest",
  inter: "Inter",
  sofisa: "Sofisa",
  modal: "Modal",
  b3: "B3",
  binance: "Binance",
  mercado: "Mercado",
  coinbase: "Coinbase",
  kraken: "Kraken",
  manual: "Manual",
  other: "Outro",
};

export default async function ContasPage() {
  const userId = await getUserIdOrRedirect();

  const accounts = await db
    .select()
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.userId, userId))
    .orderBy(desc(brokerageAccounts.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contas</h1>
          <p className="text-muted-foreground">Suas contas de custódia, bancos e exchanges.</p>
        </div>
        <Button asChild>
          <Link href="/app/contas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova conta
          </Link>
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Nenhuma conta cadastrada</p>
              <p className="text-sm text-muted-foreground">
                Adicione sua primeira conta para começar.
              </p>
            </div>
            <Button asChild>
              <Link href="/app/contas/nova">Criar primeira conta</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id}>
              <CardHeader>
                <CardTitle>{acc.name}</CardTitle>
                <CardDescription>
                  {BROKER_LABELS[acc.broker] ?? acc.broker} · {TYPE_LABELS[acc.type] ?? acc.type}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/app/contas/${acc.id}`}>Ver detalhes</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
