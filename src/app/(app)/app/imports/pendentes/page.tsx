import { Button } from "@/components/ui/button";
import { importQueueTable } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { ImportQueueClient } from "./_client";

export const dynamic = "force-dynamic";

type ParsedPayload = {
  ticker: string;
  name?: string;
  side: string;
  quantity: number;
  price: number;
  currency: string;
  occurredAt: string;
  assetClass?: string;
};

// Parser defensivo: payload malformado ou com campos faltando -> null (filtrado).
function parsePayload(raw: string): ParsedPayload | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (typeof p.ticker !== "string" || typeof p.side !== "string") return null;
    if (typeof p.occurredAt !== "string") return null;
    if (typeof p.quantity !== "number" || typeof p.price !== "number") return null;
    return {
      ticker: p.ticker,
      name: typeof p.name === "string" ? p.name : undefined,
      side: p.side,
      quantity: p.quantity,
      price: p.price,
      currency: typeof p.currency === "string" ? p.currency : "BRL",
      occurredAt: p.occurredAt,
      assetClass: typeof p.assetClass === "string" ? p.assetClass : undefined,
    };
  } catch {
    return null;
  }
}

export default async function ImportacoesPendentesPage() {
  const userId = await getUserIdOrRedirect();

  const rows = await db
    .select({
      id: importQueueTable.id,
      payload: importQueueTable.payload,
      createdAt: importQueueTable.createdAt,
    })
    .from(importQueueTable)
    .where(and(eq(importQueueTable.userId, userId), eq(importQueueTable.reviewStatus, "pending")))
    .orderBy(desc(importQueueTable.createdAt))
    .limit(500);

  // Parse server-side: envia pro client apenas o shape serializavel da tabela.
  // Itens com payload invalido sao descartados silenciosamente (ficam pending
  // no DB para retry, mas nao poluem a UI).
  const items = rows
    .map((r) => {
      const parsed = parsePayload(r.payload);
      if (!parsed) return null;
      return {
        id: r.id,
        ticker: parsed.ticker,
        name: parsed.name,
        side: parsed.side,
        quantity: parsed.quantity,
        price: parsed.price,
        currency: parsed.currency,
        occurredAt: parsed.occurredAt,
        assetClass: parsed.assetClass,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Itens pendentes</h1>
        <p className="text-muted-foreground">
          {items.length === 0
            ? "Nenhum item aguardando revisão."
            : `${items.length} ${items.length === 1 ? "item" : "itens"} aguardando sua decisão.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Fila vazia</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Importe um arquivo da sua corretora para revisar as transações aqui.
          </p>
          <Button asChild className="mt-4">
            <Link href="/app/posicoes/nova">
              <Upload className="mr-2 h-4 w-4" />
              Importar arquivo
            </Link>
          </Button>
        </div>
      ) : (
        <ImportQueueClient items={items} />
      )}
    </div>
  );
}
