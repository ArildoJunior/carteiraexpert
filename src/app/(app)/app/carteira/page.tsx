import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CarteiraPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Carteira</h1>
        <p className="text-muted-foreground">Visao consolidada do seu patrimonio.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Em construcao</CardTitle>
          <CardDescription>O dashboard sera preenchido no proximo sub-bloco.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Por enquanto a sidebar ja funciona. Voce vera erros 404 ate o sub-bloco 5D+5E criar as
            paginas de contas, posicoes e movimentacoes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
