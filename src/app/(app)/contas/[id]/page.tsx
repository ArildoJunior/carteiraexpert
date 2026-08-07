import { AccountForm } from "@/components/portfolio/account-form";
import { DeleteAccountButton } from "@/components/portfolio/delete-account-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { getAccountForUser } from "@/lib/db/scopes";
import type { CreateBrokerageAccount } from "@/lib/validations/brokerage-account";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function ContaDetalhePage({ params }: Props) {
  const { id } = await params;
  const userId = await getUserIdOrRedirect();
  const account = await getAccountForUser(id, userId);
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-muted-foreground">Edite os dados ou exclua esta conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados</CardTitle>
          <CardDescription>Atualize o que precisar.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm
            accountId={account.id}
            defaultValues={{
              name: account.name,
              type: account.type as CreateBrokerageAccount["type"],
              broker: account.broker as CreateBrokerageAccount["broker"],
              currency: account.currency,
              notes: account.notes ?? undefined,
            }}
          />
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de perigo</CardTitle>
          <CardDescription>
            Excluir esta conta remove todas as posições e movimentações vinculadas. Esta ação não
            pode ser desfeita.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton accountId={account.id} />
        </CardContent>
      </Card>
    </div>
  );
}
