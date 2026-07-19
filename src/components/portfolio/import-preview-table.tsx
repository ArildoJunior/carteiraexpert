"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

export type PreviewItem = {
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
  items: PreviewItem[];
  onSelectionChange?: (ids: string[]) => void;
};

const checkboxClass =
  "h-4 w-4 cursor-pointer rounded border-input accent-primary focus:ring-2 focus:ring-ring focus:ring-offset-1";

/**
 * Tabela de preview de transacoes com checkbox por linha + "select all".
 * Estado indeterminate no header quando ha selecao parcial.
 * Usa <input type="checkbox"> nativo (shadcn/ui nao expoe Checkbox no projeto).
 */
export function ImportPreviewTable({ items, onSelectionChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next));
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const all = items.map((i) => i.id);
      setSelectedIds(new Set(all));
      onSelectionChange?.(all);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              aria-label="Selecionar todas as linhas"
            />
          </TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Ticker</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Qtd</TableHead>
          <TableHead className="text-right">Preco</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <input
                type="checkbox"
                className={checkboxClass}
                checked={selectedIds.has(item.id)}
                onChange={() => toggle(item.id)}
                aria-label={`Selecionar ${item.ticker}`}
              />
            </TableCell>
            <TableCell className="font-mono text-xs">
              {new Date(item.occurredAt).toLocaleDateString("pt-BR")}
            </TableCell>
            <TableCell className="font-semibold">{item.ticker}</TableCell>
            <TableCell className="text-muted-foreground">{item.name ?? "-"}</TableCell>
            <TableCell>{item.side}</TableCell>
            <TableCell className="text-right font-mono">
              {item.quantity.toLocaleString("pt-BR")}
            </TableCell>
            <TableCell className="text-right font-mono">
              {item.price.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
