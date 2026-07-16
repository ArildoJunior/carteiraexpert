import { auth } from "@/lib/auth";
import { getProvidersHealth } from "@/lib/quotes/manager";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const providers = await getProvidersHealth();
  return NextResponse.json({ providers });
}
