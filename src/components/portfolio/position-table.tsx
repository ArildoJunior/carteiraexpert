"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type PositionRow = {
  id: string;
  accountId: string;
  accountName: string;
  assetId: string;
  assetTicker: string;
  assetName: string;
  assetClass: string;
  sector: string | null;
  quantity: number;
  averageCost: number;
  isOpen: string;
};

type Props = { data: PositionRow[] };

const CLASS_LABELS: Record<string, string> = {
  stock: "Acao",
  reit: "FII",
  etf: "ETF",
  crypto: "Cripto",
  treasury: "Renda Fixa",
  bond: "Titulo",
  fund: "Fundo",
  option: "Opcao",
  other: "Outro",
};

function SortHeader({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 font-medium">{label}</span>;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3 w-3" />;
  if (sorted === "desc") return <ArrowDown className="h-3 w-3" />;
  return <ArrowUpDown className="h-3 w-3 opacity-50" />;
}

export function PositionTable({ data }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<PositionRow>[] = [
    {
      accessorKey: "assetTicker",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="inline-flex items-center gap-1 font-medium"
        >
          <SortHeader label="Ativo" />
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <Link href={`/app/posicoes/${row.original.id}`} className="font-mono hover:underline">
          {row.original.assetTicker}
        </Link>
      ),
    },
    {
      accessorKey: "assetName",
      header: () => <SortHeader label="Nome" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.assetName}</span>
      ),
    },
    {
      accessorKey: "assetClass",
      header: () => <SortHeader label="Classe" />,
      cell: ({ row }) => (
        <Badge variant="outline">
          {CLASS_LABELS[row.original.assetClass] ?? row.original.assetClass}
        </Badge>
      ),
    },
    {
      accessorKey: "accountName",
      header: () => <SortHeader label="Conta" />,
    },
    {
      // FIX: accessorFn converte string -> number para ordenacao numerica correta
      accessorKey: "quantity",
      accessorFn: (row) => Number(row.quantity),
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="inline-flex items-center gap-1 font-medium"
        >
          <SortHeader label="Quantidade" />
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-mono">{Number(row.original.quantity).toLocaleString("pt-BR")}</span>
      ),
    },
    {
      accessorKey: "averageCost",
      accessorFn: (row) => Number(row.averageCost),
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="inline-flex items-center gap-1 font-medium"
        >
          <SortHeader label="Custo medio" />
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-mono">
          {Number(row.original.averageCost).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      accessorKey: "isOpen",
      header: () => <SortHeader label="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.isOpen === "true" ? "default" : "secondary"}>
          {row.original.isOpen === "true" ? "Aberta" : "Fechada"}
        </Badge>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                Nenhuma posicao encontrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
