import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Mover } from "@/lib/api/dashboard";
import { formatCurrency, formatSignedPercent } from "@/lib/dashboard/formatters";
import { QuoteFallback } from "./quote-fallback";

interface MoversSectionProps {
  winners: Mover[];
  losers: Mover[];
}

function MoverRow({ m, isWinner }: { m: Mover; isWinner: boolean }) {
  const variationClass = isWinner ? "text-emerald-600" : "text-red-600";
  const price =
    m.price === 0 ? (
      <QuoteFallback value="—" label="Cotacao indisponivel para este ativo" />
    ) : (
      formatCurrency(m.price)
    );
  return (
    <TableRow>
      <TableCell className="font-medium">{m.ticker}</TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">{m.name}</TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
        {m.assetClass}
      </TableCell>
      <TableCell className="text-right tabular-nums">{price}</TableCell>
      <TableCell className={`text-right tabular-nums font-semibold ${variationClass}`}>
        {formatSignedPercent(m.variation / 100)}
      </TableCell>
      <TableCell className="text-right tabular-nums hidden md:table-cell">
        {formatCurrency(m.contribution)}
      </TableCell>
    </TableRow>
  );
}

export function MoversSection({ winners, losers }: MoversSectionProps) {
  if (winners.length === 0 && losers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Maiores altas e baixas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-emerald-700">Altas</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead className="hidden md:table-cell">Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Classe</TableHead>
                <TableHead className="text-right">Preco</TableHead>
                <TableHead className="text-right">Variacao</TableHead>
                <TableHead className="text-right hidden md:table-cell">Contribuicao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {winners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                    Nenhuma alta no periodo
                  </TableCell>
                </TableRow>
              ) : (
                winners.map((m) => <MoverRow key={m.ticker} m={m} isWinner />)
              )}
            </TableBody>
          </Table>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-red-700">Baixas</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead className="hidden md:table-cell">Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Classe</TableHead>
                <TableHead className="text-right">Preco</TableHead>
                <TableHead className="text-right">Variacao</TableHead>
                <TableHead className="text-right hidden md:table-cell">Contribuicao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {losers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                    Nenhuma baixa no periodo
                  </TableCell>
                </TableRow>
              ) : (
                losers.map((m) => <MoverRow key={m.ticker} m={m} isWinner={false} />)
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
