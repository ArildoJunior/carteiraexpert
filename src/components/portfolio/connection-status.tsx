import { Badge } from "@/components/ui/badge";

type Status = "active" | "expired" | "disconnected" | "pending";

type Props = {
  status: Status;
};

type StatusConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
};

const statusConfig: Record<Status, StatusConfig> = {
  active: { label: "Ativa", variant: "default" },
  expired: { label: "Token expirado", variant: "destructive" },
  disconnected: { label: "Desconectada", variant: "secondary" },
  pending: { label: "Pendente", variant: "outline" },
};

/**
 * Badge de status de uma broker_connection.
 * Server Component - sem estado.
 * Cap 17 vai usar os mesmos status (active/expired) para conexoes Pluggy.
 */
export function ConnectionStatus({ status }: Props) {
  const config = statusConfig[status] ?? statusConfig.pending;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
