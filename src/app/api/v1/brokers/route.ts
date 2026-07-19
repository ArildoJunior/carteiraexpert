import { brokersTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/v1/brokers
 * Lista corretoras ativas do catalogo.
 * Retorna 200 com { brokers: [{ id, slug, name, kind, provider, logo_url }] }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: brokersTable.id,
      slug: brokersTable.slug,
      name: brokersTable.name,
      kind: brokersTable.kind,
      provider: brokersTable.provider,
      logoUrl: brokersTable.logoUrl,
    })
    .from(brokersTable)
    .where(eq(brokersTable.isActive, true));

  return NextResponse.json({ brokers: rows }, { status: 200 });
}
