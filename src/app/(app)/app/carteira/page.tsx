import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assets, brokerageAccounts, positions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { eq } from "drizzle-orm";
import {
  ArrowRightLeft,
  Building2,
  History,
  PieChart,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";

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

export default async function CarteiraPage() {
  const session = await auth();
  const userId = session!.user.id;

  const rows = await db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      accountName: brokerageAccounts.name,
      assetId: positions.assetId,
      assetTicker: assets.ticker,
      assetClass: assets.assetClass,
      quantity: positions.quantity,
      averageCost: positions.averageCost,
    })
    .from(positions)
    .innerJoin(assets, eq(positions.assetId, assets.id))
    .innerJoin(brokerageAccounts, eq(positions.accountId, brokerageAccounts.id))
    .where(eq(positions.userId, userId));

  // FIX: numeric -> number (Drizzle devolve string)
  const data = rows.map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    averageCost: Number(r.averageCost),
  }));

  // Total investido = soma de quantity * averageCost
  // (placeholder ate Cap. 6 trazer cotacoes reais)
  const totalInvestido = data.reduce((acc, r) => acc + r.quantity * r.averageCost, 0);
  const patrimonio = totalInvestido;

  // Distribuicao por classe
  const byClass = data.reduce<Record<string, number>>((acc, r) => {
    const v = r.quantity * r.averageCost;
    acc[r.assetClass] = (acc[r.assetClass] ?? 0) + v;
    return acc;
  }, {});

  // Distribuicao por conta
  const byAccount = data.reduce<Record<string, number>>((acc, r) => {
    const v = r.quantity * r.averageCost;
    acc[r.accountName] = (acc[r.accountName] ?? 0) + v;
    return acc;
  }, {});

  const numPosicoes = data.length;
  const numAtivos = new Set(data.map((r) => r.assetTicker)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Carteira</h1>
        <p className="text-muted-foreground">Visao consolidada do seu patrimonio.</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Patrimonio</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(patrimonio)}</p>
            <p className="text-xs text-muted-foreground">Total investido (cotacao em Cap. 6)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Posicoes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{numPosicoes}</p>
            <p className="text-xs text-muted-foreground">
              {numAtivos} {numAtivos === 1 ? "ativo" : "ativos"} diferentes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Contas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Object.keys(byAccount).length}</p>
            <p className="text-xs text-muted-foreground">corretoras e bancos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Object.keys(byClass).length}</p>
            <p className="text-xs text-muted-foreground">tipos de ativos</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuicao por classe */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuicao por classe</CardTitle>
          <CardDescription>Percentual do patrimonio alocado por classe de ativo.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(byClass).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados de distribuicao.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byClass)
                .sort(([, a], [, b]) => b - a)
                .map(([cls, value]) => {
                  const pct = patrimonio > 0 ? (value / patrimonio) * 100 : 0;
                  return (
                    <div key={cls} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{CLASS_LABELS[cls] ?? cls}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(value)} ({formatNumber(pct, "pt-BR")}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Distribuicao por conta */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuicao por conta</CardTitle>
          <CardDescription>Onde seu patrimonio esta alocado.</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(byAccount).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem contas com posicao.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byAccount)
                .sort(([, a], [, b]) => b - a)
                .map(([account, value]) => {
                  const pct = patrimonio > 0 ? (value / patrimonio) * 100 : 0;
                  return (
                    <div key={account} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{account}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(value)} ({formatNumber(pct, "pt-BR")}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atalhos */}
      <Card>
        <CardHeader>
          <CardTitle>Atalhos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/posicoes/nova">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar posicao
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/contas/nova">
                <Building2 className="mr-2 h-4 w-4" />
                Nova conta
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/movimentacoes">
                <History className="mr-2 h-4 w-4" />
                Ver movimentacoes
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/posicoes">
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Ver posicoes
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
