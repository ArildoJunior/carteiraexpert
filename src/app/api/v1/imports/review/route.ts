import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/db/audit";
import { type ApplyResult, applyQueueItems } from "@/lib/integrations/apply";
import { NextResponse } from "next/server";
import { z } from "zod";

const ReviewBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
  decision: z.enum(["accept", "reject"]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "JSON invalido" }, { status: 400 });
  }

  const parsed = ReviewBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Body invalido", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { itemIds, decision } = parsed.data;

  // Audit: acao do usuario antes de processar
  await logAudit({
    userId,
    action: "import.reviewed",
    resourceType: "import_queue",
    resourceId: itemIds.join(","),
    metadata: { decision, count: itemIds.length },
  });

  let result: ApplyResult;
  try {
    result = await applyQueueItems(userId, itemIds, decision);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao aplicar";
    return NextResponse.json({ message }, { status: 409 });
  }

  // Audit: resultado da aplicacao
  await logAudit({
    userId,
    action: "import.applied",
    resourceType: "import_queue",
    resourceId: itemIds.join(","),
    metadata: {
      decision,
      imported: result.imported,
      duplicates: result.duplicates,
      rejected: result.rejected,
      errors: result.errors,
    },
  });

  return NextResponse.json(
    {
      applied: result.imported + result.duplicates + result.rejected,
      imported: result.imported,
      duplicates: result.duplicates,
      rejected: result.rejected,
      errors: result.errors,
      details: result.details,
    },
    { status: 200 }
  );
}
