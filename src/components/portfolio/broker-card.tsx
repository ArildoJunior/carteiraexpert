import { Card } from "@/components/ui/card";
import { Building2 } from "lucide-react";

type Broker = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  provider: string;
  logoUrl: string | null;
};

type Props = {
  broker: Broker;
};

/**
 * Card visual de uma corretora do catalogo.
 * Server Component - sem estado.
 * Mostra logo (ou fallback Building2), nome, slug e kind.
 */
export function BrokerCard({ broker }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        {broker.logoUrl ? (
          <img
            src={broker.logoUrl}
            alt={broker.name}
            className="h-10 w-10 rounded object-contain"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{broker.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{broker.slug}</p>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {broker.kind}
        </span>
      </div>
    </Card>
  );
}
