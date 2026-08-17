import type { SubscriptionStatus } from '../domain';

interface SubscriptionStatusBadgeProps {
  status: SubscriptionStatus;
  className?: string;
}

export function SubscriptionStatusBadge({ status, className = '' }: SubscriptionStatusBadgeProps) {
  const configs: Record<SubscriptionStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
    ACTIVE: {
      label: 'Ativo',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      dot: 'bg-emerald-400',
    },
    PARTIALLY_EXERCISED: {
      label: 'Parcialmente Exercido',
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      dot: 'bg-blue-400',
    },
    FULLY_EXERCISED: {
      label: 'Totalmente Exercido',
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
      dot: 'bg-slate-400',
    },
    EXPIRED: {
      label: 'Expirado',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      dot: 'bg-amber-400',
    },
    CANCELLED: {
      label: 'Cancelado',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      border: 'border-red-500/30',
      dot: 'bg-red-400',
    },
  };

  const config = configs[status] || configs.ACTIVE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}
      data-testid={`subscription-status-${status.toLowerCase()}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
