import { DeletePositionButton } from "@/components/portfolio/delete-position-button";
import { TransactionForm } from "@/components/portfolio/transaction-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assets, brokerageAccounts, transactions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPositionForUser } from "@/lib/db/scopes";
import { formatCurrency, formatDate } from "@/lib/utils";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venda",
  dividend: "Dividendo",
  jcp: "JCP",
  reitIncome: "Rend. FII",
  fixedIncomeCoupon: "Cupom",
  bonus: "Bonificacao",
  split: "Split",
};

const CLASS_LABELS: Record<string, string> = {
  stock: "Acao",
  reit: "FII",
  etf: "ETF",
  bdr: "BDR",
  crypto: "Cripto",
  treasury: "Tesouro",
  fixedIncomePublic: "Renda Fixa Pub.",
  fixedIncomePrivate: "Renda Fixa Priv.",
  fund: "Fundo",
  option: "Opcao",
  other: "Outro",
};

export default async function PosicaoDetalhePage({ params }: Props) {
  const session = await auth();
  const { id } = await params;
  const userId = session!.user.id;

  // Scope check: so devolve a posicao se for do user
  const position = await getPositionForUser(id, userId);
  if (!position) notFound();

  const [asset] = await db.select().from(assets).where(eq(assets.id, position.assetId)).limit(1);
  const [account] = await db
    .select()
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.id, position.accountId))
    .limit(1);
  if (!asset || !account) notFound();

  // Movimentacoes desta posicao especifica
  const txs = await db
    .select({
      id: transactions.id,
      transactionDate: transactions.transactionDate,
      type: transactions.type,
      quantity: transactions.quantity,
      unitPrice: transactions.unitPrice,
      totalAmount: transactions.totalAmount,
    })
    .from(transactions)
    .where(and(eq(transactions.positionId, id), eq(transactions.userId, userId)))
    .orderBy(desc(transactions.transactionDate));

  const quantity = Number(position.quantity);
  const averageCost = Number(position.averageCost);
  const isOpen = position.isOpen === "true";
  const totalInvestido = quantity * averageCost;

  // Props minimos para o TransactionForm ja que a posicao e o ativo estao fixos
  const accounts = [{ id: account.id, name: account.name }];
  const assetsList = [
    {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/app/posicoes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Posicoes
          </Link>
        </Button>
        <h1 className="text-3xl font-bold font-mono tracking-tight">{asset.ticker}</h1>
        <p className="text-muted-foreground">{asset.name}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">{CLASS_LABELS[asset.assetClass] ?? asset.assetClass}</Badge>
          {asset.sector && <Badge variant="secondary">{asset.sector}</Badge>}
          <Badge variant={isOpen ? "default" : "secondary"}>{isOpen ? "Aberta" : "Fechada"}</Badge>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quantidade</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono">{quantity.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custo medio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono">{formatCurrency(averageCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total investido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono">{formatCurrency(totalInvestido)}</p>
            <p className="text-xs text-muted-foreground">qtd x custo medio</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conta</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{account.name}</p>
            <p className="text-xs text-muted-foreground">
              Aberto em {position.openedAt ? formatDate(position.openedAt) : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Movimentacoes */}
      <Card>
        <CardHeader>
          <CardTitle>Movimentacoes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txs.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentacao registrada nesta posicao.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preco unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{formatDate(tx.transactionDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABELS[tx.type] ?? tx.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(tx.quantity).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(tx.unitPrice))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(tx.totalAmount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form de nova movimentacao (com conta+ativo pre-preenchidos) */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Adicionar movimentacao</h2>
        <TransactionForm
          accounts={accounts}
          assets={assetsList}
          defaultAccountId={account.id}
          defaultAssetId={asset.id}
          onSuccessRedirect={`/app/posicoes/${id}`}
        />
      </div>

      <Separator />

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Wallet className="h-4 w-4" />
            Zona de perigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Excluir esta posicao remove tambem todas as movimentacoes vinculadas. Esta acao nao pode
            ser desfeita.
          </p>
          <DeletePositionButton positionId={position.id} />
        </CardContent>
      </Card>
    </div>
  );
}
