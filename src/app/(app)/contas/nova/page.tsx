import { AccountForm } from "@/components/portfolio/account-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NovaContaPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nova conta</h1>
        <p className="text-muted-foreground">Adicione uma corretora, banco ou exchange.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dados da conta</CardTitle>
          <CardDescription>Você poderá editar depois.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
