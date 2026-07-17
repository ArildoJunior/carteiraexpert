import { brokersTable } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import type { BrokerConnector } from "./types";
import { BrokerError } from "./types";

// Stub do ManualCSVConnector — a implementacao real vem no PROMPT 7B.
// Mantemos a interface estavel para que o Cap. 7B e o Cap. 17 pluguem aqui sem mudar nada.
class ManualCSVConnectorStub implements BrokerConnector {
  readonly provider = "manual" as const;
  readonly displayName = "Importacao manual (CSV/XLSX)";
  readonly logoUrl = "/logos/manual.svg";
  readonly isImplemented = true;

  getImportInstructions(): string {
    return (
      "Exporte o extrato de movimentacoes em CSV/XLSX da area logada da sua corretora. " +
      "Procure por 'Exportar' ou 'Relatorio de Movimentacoes'. " +
      "Recomendamos intervalo de pelo menos 6 meses."
    );
  }

  async parseFile(_fileBuffer: Buffer, filename: string): Promise<never> {
    // Implementacao real chega no PROMPT 7B. Por enquanto, erro explicito.
    throw new BrokerError(
      "unsupported_format",
      `ManualCSVConnector ainda nao implementado (arquivo recebido: ${filename}). PROMPT 7B entrega a implementacao.`
    );
  }
}

const connectorBySlug: Record<string, () => BrokerConnector> = {
  sofisa: () => new ManualCSVConnectorStub(),
  modal: () => new ManualCSVConnectorStub(),
  nuinvest: () => new ManualCSVConnectorStub(),
  xp: () => new ManualCSVConnectorStub(),
  rico: () => new ManualCSVConnectorStub(),
  btg: () => new ManualCSVConnectorStub(),
  inter: () => new ManualCSVConnectorStub(),
  avenue: () => new ManualCSVConnectorStub(),
  binance: () => new ManualCSVConnectorStub(),
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

// Para testes — permite injetar uma implementacao customizada.
export function __registerConnector(slug: string, factory: () => BrokerConnector): void {
  connectorBySlug[slug] = factory;
}
