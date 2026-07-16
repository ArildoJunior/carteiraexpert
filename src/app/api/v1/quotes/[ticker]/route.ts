import { auth } from "@/lib/auth";
import { type AssetClass, assetClassEnum } from "@/lib/db/enums";
import { getQuote } from "@/lib/quotes/manager";
import { NextResponse } from "next/server";

const ASSET_CLASS_SET = new Set<string>(assetClassEnum);

function parseAssetClass(raw: string | null): AssetClass | null {
  if (!raw) return null;
  return ASSET_CLASS_SET.has(raw) ? (raw as AssetClass) : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const { ticker: rawTicker } = await params;
  if (!/^[A-Z0-9-]{3,20}$/i.test(rawTicker)) {
    return NextResponse.json({ message: "Ticker invalido" }, { status: 400 });
  }

  const url = new URL(req.url);
  const assetClass = parseAssetClass(url.searchParams.get("class")) ?? "stock";
  const result = await getQuote(rawTicker, assetClass);

  if (result.ok) {
    return NextResponse.json({ data: result.quote });
  }

  if (result.error === "not-supported") {
    return NextResponse.json({ message: "Classe de ativo sem cotacao online" }, { status: 400 });
  }
  if (result.error === "not-found") {
    return NextResponse.json({ message: "Ativo nao encontrado" }, { status: 404 });
  }

  if (result.staleQuote) {
    return NextResponse.json(
      { message: "Provider offline", data: result.staleQuote },
      { status: 503 }
    );
  }
  return NextResponse.json({ message: "Provider indisponivel" }, { status: 503 });
}
