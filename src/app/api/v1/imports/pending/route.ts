import { brokerConnectionsTable, brokersTable, importQueueTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  // Lista transacoes pendentes do user, juntando info da corretora
  const rows = await db
    .select({
      id: importQueueTable.id,
      payload: importQueueTable.payload,
      canonicalHash: importQueueTable.canonicalHash,
      createdAt: importQueueTable.createdAt,
      brokerName: brokersTable.name,
      brokerSlug: brokersTable.slug,
      connectionId: brokerConnectionsTable.id,
    })
    .from(importQueueTable)
    .innerJoin(brokerConnectionsTable, eq(brokerConnectionsTable.id, importQueueTable.connectionId))
    .innerJoin(brokersTable, eq(brokersTable.id, importQueueTable.brokerId))
    .where(and(eq(importQueueTable.userId, userId), eq(importQueueTable.reviewStatus, "pending")))
    .orderBy(desc(importQueueTable.createdAt))
    .limit(limit);

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      payload: JSON.parse(r.payload) as unknown,
      canonicalHash: r.canonicalHash,
      createdAt: r.createdAt,
      broker: { name: r.brokerName, slug: r.brokerSlug },
      connectionId: r.connectionId,
    })),
    total: rows.length,
  });
}
