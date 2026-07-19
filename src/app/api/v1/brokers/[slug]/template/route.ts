import { auth } from "@/lib/auth";
import { getMappingBySlug } from "@/lib/brokers/parsers/mappings";
import { generateTemplateCSV } from "@/lib/brokers/template";
import { brokerSlugSchema } from "@/lib/validations/broker";
import { NextResponse } from "next/server";

/**
 * GET /api/v1/brokers/[slug]/template
 * Baixa CSV template para a corretora especificada.
 * Retorna 200 com text/csv (Content-Disposition: attachment).
 * 404 se o slug nao tem mapping registrado.
 */
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const { slug } = await context.params;
  const parsed = brokerSlugSchema.safeParse({ slug });
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Slug invalido", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const mapping = getMappingBySlug(parsed.data.slug);
  if (!mapping) {
    return NextResponse.json(
      { message: `Corretora '${parsed.data.slug}' nao possui template disponivel` },
      { status: 404 }
    );
  }

  const csv = generateTemplateCSV(mapping);
  const filename = `template-${mapping.brokerSlug}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
