import { assets, positions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { getPositionForUser } from "@/lib/db/scopes";
import { updatePositionSchema } from "@/lib/validations/position";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const position = await getPositionForUser(id, session.user.id);
  if (!position) {
    return NextResponse.json({ message: "Posicao nao encontrada" }, { status: 404 });
  }
  const [asset] = await db.select().from(assets).where(eq(assets.id, position.assetId)).limit(1);
  return NextResponse.json({ ...position, asset });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const position = await getPositionForUser(id, session.user.id);
  if (!position) {
    return NextResponse.json({ message: "Posicao nao encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updatePositionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos" }, { status: 400 });
  }

  // Converte isOpen boolean -> text (coluna DB eh text, nao boolean)
  const updateValues: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.notes !== undefined) updateValues.notes = parsed.data.notes;
  if (parsed.data.isOpen !== undefined) {
    updateValues.isOpen = String(parsed.data.isOpen);
  }

  const [updated] = await db
    .update(positions)
    .set(updateValues)
    .where(and(eq(positions.id, id), eq(positions.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ message: "Erro ao atualizar" }, { status: 500 });
  }

  await logAudit({
    userId: session.user.id,
    action: "position.updated",
    resourceType: "position",
    resourceId: id,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const position = await getPositionForUser(id, session.user.id);
  if (!position) {
    return NextResponse.json({ message: "Posicao nao encontrada" }, { status: 404 });
  }

  await db
    .delete(positions)
    .where(and(eq(positions.id, id), eq(positions.userId, session.user.id)));

  await logAudit({
    userId: session.user.id,
    action: "position.deleted",
    resourceType: "position",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
