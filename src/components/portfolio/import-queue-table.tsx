"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useCallback, useMemo, useRef, useState } from "react";

// Tipo serializavel que vem do server page como prop.
// Mantem apenas o necessario pra renderizar a linha + mandar o id no apply.
export type ImportQueueItem = {
  id: string;
  ticker: string;
  name?: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  occurredAt: string;
  assetClass?: string;
};

type Props = {
  items: ImportQueueItem[];
  onSelectionChange?: (selectedIds: string[]) => void;
};

// Labels curtas pros tipos de operacao (BrokerTransactionSide).
// Mantem o mapping local - nao precisa importar de @/lib/brokers/types.
const SIDE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venda",
  dividend: "Dividendo",
  jcp: "JCP",
  interest: "Renda Fixa",
  split: "Desdobramento",
  bonus: "Bonificacao",
  fee: "Taxa",
  transfer_in: "Transf. entrada",
  transfer_out: "Transf. saida",
  other: "Outro",
};

export function ImportQueueTable({ items, onSelectionChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Sincroniza o estado visual "indeterminate" do checkbox do cabecalho.
  // Sem o componente Checkbox do shadcn (nao instalado), controlamos via ref.
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;
  if (headerCheckboxRef.current) {
    headerCheckboxRef.current.indeterminate = someSelected;
  }

  const emitChange = useCallback(
    (next: Set<string>) => {
      onSelectionChange?.(Array.from(next));
    },
    [onSelectionChange]
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) {
        const next = new Set<string>();
        emitChange(next);
        return next;
      }
      const next = new Set(items.map((i) => i.id));
      emitChange(next);
      return next;
    });
  }, [items, emitChange]);

  const toggleOne = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        emitChange(next);
        return next;
      });
    },
    [emitChange]
  );

  // Linhas prontas pra renderizar (memoizadas pra nao recomputar labels por tick).
  const rows = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        sideLabel: SIDE_LABELS[item.side] ?? item.side,
      })),
    [items]
  );

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum item pendente para revisar.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                aria-label="Selecionar todos"
                className="h-4 w-4 cursor-pointer rounded border-input text-primary focus:ring-2 focus:ring-primary focus:ring-offset-1"
                checked={allSelected}
                onChange={toggleAll}
              />
            </TableHead>
            <TableHead>Ativo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Qtd.</TableHead>
            <TableHead className="text-right">Preco</TableHead>
            <TableHead>Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TableRow
                key={item.id}
                className={cn(isSelected && "bg-muted/50")}
                data-state={isSelected ? "selected" : undefined}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${item.ticker}`}
                    className="h-4 w-4 cursor-pointer rounded border-input text-primary focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    checked={isSelected}
                    onChange={() => toggleOne(item.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{item.ticker}</span>
                    {item.name ? (
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{item.sideLabel}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.quantity.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(item.price, item.currency)}
                </TableCell>
                <TableCell>{formatDate(item.occurredAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
