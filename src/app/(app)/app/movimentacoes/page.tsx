import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { desc, eq } from "drizzle-orm";
import { History } from "lucide-react";
import { Plus } from "lucide-react";
import Link from "next/link";

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

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  buy: "default",
  sell: "destructive",
  dividend: "secondary",
  jcp: "secondary",
  reitIncome: "secondary",
  fixedIncomeCoupon: "outline",
  bonus: "outline",
  split: "outline",
};

export default async function MovimentacoesPage() {
  const session = await auth();
  const userId = session!.user.id;

  // TODO Cap. 7: paginacao real (cursor/offset)
  const txs = await db
    .select({
      id: transactions.id,
      transactionDate: transactions.transactionDate,
      type: transactions.type,
      quantity: transactions.quantity,
      unitPrice: transactions.unitPrice,
      totalAmount: transactions.totalAmount,
      assetTicker: assets.ticker,
      assetName: assets.name,
      accountName: brokerageAccounts.name,
    })
    .from(transactions)
    .innerJoin(assets, eq(transactions.assetId, assets.id))
    .innerJoin(brokerageAccounts, eq(transactions.accountId, brokerageAccounts.id))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.transactionDate))
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Movimentacoes</h1>
          <p className="text-muted-foreground">
            Historico completo de compras, vendas, proventos e eventos.{" "}
            <span className="font-medium">{txs.length}</span> no total.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/posicoes/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova
          </Link>
        </Button>
      </div>

      {txs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <History className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Nenhuma movimentacao registrada</p>
              <p className="text-sm text-muted-foreground">Adicione uma posicao para comecar.</p>
            </div>
            <Button asChild>
              <Link href="/app/posicoes/nova">Adicionar primeira posicao</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultimas movimentacoes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Conta</TableHead>
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
                    <TableCell className="font-mono">{tx.assetTicker}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.accountName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANT[tx.type] ?? "outline"}>
                        {TYPE_LABELS[tx.type] ?? tx.type}
                      </Badge>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
