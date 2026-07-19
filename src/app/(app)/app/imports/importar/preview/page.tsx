import { importQueueTable } from "@/db/schema";
import { getUserIdOrRedirect } from "@/lib/auth/session-helper";
import { db } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { PreviewClient } from "./_client";

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

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const userId = await getUserIdOrRedirect();
  const { jobId } = await searchParams;

  if (!jobId) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Preview do import</h1>
        <p className="text-muted-foreground">
          Nenhum jobId informado. Volte para{" "}
          <a href="/app/imports/importar" className="underline">
            importar arquivo
          </a>
          .
        </p>
      </div>
    );
  }

  const rows = await db
    .select({
      id: importQueueTable.id,
      payload: importQueueTable.payload,
      createdAt: importQueueTable.createdAt,
    })
    .from(importQueueTable)
    .where(and(eq(importQueueTable.userId, userId), eq(importQueueTable.reviewStatus, "pending")))
    .orderBy(desc(importQueueTable.createdAt))
    .limit(200);

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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Preview do import</h1>
        <p className="text-muted-foreground">
          {items.length} {items.length === 1 ? "transacao pendente" : "transacoes pendentes"} de
          aprovacao.
        </p>
      </div>
      <PreviewClient items={items} jobId={jobId} />
    </div>
  );
}
