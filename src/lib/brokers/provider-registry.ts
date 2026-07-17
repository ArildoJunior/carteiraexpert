import { brokersTable } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ManualCSVConnector } from "./connectors/manual-csv";
import { BrokerError } from "./types";
import type { BrokerConnector } from "./types";

const connectorBySlug: Record<string, () => BrokerConnector> = {
  sofisa: () => new ManualCSVConnector(),
  modal: () => new ManualCSVConnector(),
  nuinvest: () => new ManualCSVConnector(),
  xp: () => new ManualCSVConnector(),
  rico: () => new ManualCSVConnector(),
  btg: () => new ManualCSVConnector(),
  inter: () => new ManualCSVConnector(),
  avenue: () => new ManualCSVConnector(),
  binance: () => new ManualCSVConnector(),
  genial: () => new ManualCSVConnector(),
};

export function getConnectorBySlug(slug: string): BrokerConnector {
  const factory = connectorBySlug[slug];
  if (!factory) {
    throw new BrokerError(
      "not_found",
      `Corretora '${slug}' nao suportada. Slugs disponiveis: ${Object.keys(connectorBySlug).join(", ")}`
    );
  }
  return factory();
}

export async function getAvailableConnectors(): Promise<
  Array<{
    slug: string;
    name: string;
    kind: string;
    provider: string;
    logoUrl: string | null;
    isImplemented: boolean;
  }>
> {
  const rows = await db
    .select({
      slug: brokersTable.slug,
      name: brokersTable.name,
      kind: brokersTable.kind,
      provider: brokersTable.provider,
      logoUrl: brokersTable.logoUrl,
    })
    .from(brokersTable)
    .where(and(eq(brokersTable.isActive, true)));

  return rows.map((row) => {
    const connector = getConnectorBySlug(row.slug);
    return {
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      provider: row.provider,
      logoUrl: row.logoUrl,
      isImplemented: connector.isImplemented,
    };
  });
}

// Para testes - permite injetar uma implementacao customizada.
export function __registerConnector(slug: string, factory: () => BrokerConnector): void {
  connectorBySlug[slug] = factory;
}
