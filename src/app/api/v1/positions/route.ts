import { assets, brokerageAccounts, positions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { createPositionSchema, listPositionsSchema } from "@/lib/validations/position";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const params = listPositionsSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!params.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const conditions = [eq(positions.userId, session.user.id)];
  if (params.data.accountId) {
    conditions.push(eq(positions.accountId, params.data.accountId));
  }
  if (params.data.assetId) {
    conditions.push(eq(positions.assetId, params.data.assetId));
  }
  if (params.data.isOpen !== undefined) {
    conditions.push(eq(positions.isOpen, String(params.data.isOpen)));
  }

  const rows = await db
    .select({
      id: positions.id,
      accountId: positions.accountId,
      assetId: positions.assetId,
      quantity: positions.quantity,
      averageCost: positions.averageCost,
      costCurrency: positions.costCurrency,
      isOpen: positions.isOpen,
      openedAt: positions.openedAt,
      closedAt: positions.closedAt,
      updatedAt: positions.updatedAt,
      asset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetClass: assets.assetClass,
        sector: assets.sector,
      },
    })
    .from(positions)
    .innerJoin(assets, eq(positions.assetId, assets.id))
    .where(and(...conditions))
    .orderBy(desc(positions.updatedAt))
    .limit(params.data.limit);

  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPositionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dados invalidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // FIX: db.select().from() ao inves de db.query.brokerageAccounts.findFirst()
  // (relational queries nao estao configurados no schema)
  const [account] = await db
    .select()
    .from(brokerageAccounts)
    .where(
      and(
        eq(brokerageAccounts.id, parsed.data.accountId),
        eq(brokerageAccounts.userId, session.user.id)
      )
    )
    .limit(1);
  if (!account) {
    return NextResponse.json({ message: "Conta nao encontrada" }, { status: 404 });
  }

  const [asset] = await db.select().from(assets).where(eq(assets.id, parsed.data.assetId)).limit(1);
  if (!asset) {
    return NextResponse.json({ message: "Ativo nao encontrado" }, { status: 404 });
  }

  const [position] = await db
    .insert(positions)
    .values({
      userId: session.user.id,
      accountId: parsed.data.accountId,
      assetId: parsed.data.assetId,
      quantity: String(parsed.data.quantity),
      averageCost: String(parsed.data.averageCost),
      costCurrency: parsed.data.costCurrency,
    })
    .returning();

  if (!position) {
    return NextResponse.json({ message: "Erro ao criar posicao" }, { status: 500 });
  }

  await logAudit({
    userId: session.user.id,
    action: "position.created",
    resourceType: "position",
    resourceId: position.id,
    metadata: {
      accountId: position.accountId,
      assetId: position.assetId,
    },
  });

  return NextResponse.json(position, { status: 201 });
}
