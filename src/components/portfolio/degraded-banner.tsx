import { getProvidersHealth } from "@/lib/quotes/manager";

export async function DegradedBanner() {
  const health = await getProvidersHealth();
  const down = Object.entries(health).filter(([, h]) => !h.ok);
  if (down.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <strong className="font-semibold">Cotacao parcial:</strong>{" "}
      {down.map(([name]) => name).join(", ")} nao esta respondendo. Mostrando ultimo valor
      conhecido.
    </div>
  );
}
