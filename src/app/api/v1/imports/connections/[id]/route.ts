import { brokerConnectionsTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { connectionIdSchema } from "@/lib/validations/broker";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * DELETE /api/v1/imports/connections/[id]
 * Soft delete: UPDATE status='disconnected' + audit. 404 se nao pertence ao user.
 * Cap 17 vai SUBSTITUIR por revoke real de token (chamada Pluggy) antes do soft delete.
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await context.params;
  const parsed = connectionIdSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json(
      { message: "ID invalido", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Confirma que a conexao existe e pertence ao user antes de desativar
  const [existing] = await db
    .select({ id: brokerConnectionsTable.id, status: brokerConnectionsTable.status })
    .from(brokerConnectionsTable)
    .where(
      and(eq(brokerConnectionsTable.id, parsed.data.id), eq(brokerConnectionsTable.userId, userId))
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ message: "Conexao nao encontrada" }, { status: 404 });
  }

  if (existing.status === "disconnected") {
    return NextResponse.json(
      { message: "Conexao ja esta desconectada", id: existing.id },
      { status: 200 }
    );
  }

  await db
    .update(brokerConnectionsTable)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(
      and(eq(brokerConnectionsTable.id, parsed.data.id), eq(brokerConnectionsTable.userId, userId))
    );

  await logAudit({
    userId,
    action: "import.connection.deleted",
    resourceType: "broker_connection",
    resourceId: parsed.data.id,
    metadata: { previousStatus: existing.status },
  });

  return NextResponse.json(
    { message: "Conexao desconectada", id: parsed.data.id },
    { status: 200 }
  );
}
