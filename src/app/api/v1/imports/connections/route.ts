import { brokerConnectionsTable, brokersTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/v1/imports/connections
 * Lista as conexoes manuais ativas do user.
 * Inclui join com brokers para retornar slug/nome/logo.
 * Retorna 200 com { connections: [{ id, broker_slug, broker_name, logo_url, status, last_import_at, created_at }] }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const rows = await db
    .select({
      id: brokerConnectionsTable.id,
      status: brokerConnectionsTable.status,
      lastImportAt: brokerConnectionsTable.lastImportAt,
      lastImportError: brokerConnectionsTable.lastImportError,
      createdAt: brokerConnectionsTable.createdAt,
      brokerSlug: brokersTable.slug,
      brokerName: brokersTable.name,
      brokerLogoUrl: brokersTable.logoUrl,
    })
    .from(brokerConnectionsTable)
    .innerJoin(brokersTable, eq(brokersTable.id, brokerConnectionsTable.brokerId))
    .where(eq(brokerConnectionsTable.userId, userId))
    .orderBy(desc(brokerConnectionsTable.createdAt));

  return NextResponse.json(
    {
      connections: rows.map((r) => ({
        id: r.id,
        broker_slug: r.brokerSlug,
        broker_name: r.brokerName,
        logo_url: r.brokerLogoUrl,
        status: r.status,
        last_import_at: r.lastImportAt,
        last_import_error: r.lastImportError,
        created_at: r.createdAt,
      })),
    },
    { status: 200 }
  );
}
