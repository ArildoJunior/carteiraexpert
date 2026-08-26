import type { DerivedFreshnessStatus } from '../domain/catalog.types';
import { getFreshnessBadge } from '../domain/catalog-utils';

interface QuoteFreshnessBadgeProps {
  status: DerivedFreshnessStatus;
  quoteDate?: string | null;
  className?: string;
}

export function QuoteFreshnessBadge({
  status,
  quoteDate,
  className = '',
}: QuoteFreshnessBadgeProps) {
  const badge = getFreshnessBadge(status);

  let variantStyles = 'bg-surface-elevated text-text-secondary border-border-theme';

  if (badge.variant === 'success') {
    variantStyles = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  } else if (badge.variant === 'warning') {
    variantStyles = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  } else if (badge.variant === 'danger') {
    variantStyles = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  }

  return (
    <span
      title={`${badge.description}${quoteDate ? ` • Data: ${new Date(quoteDate).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          badge.variant === 'success'
            ? 'bg-emerald-500'
            : badge.variant === 'warning'
            ? 'bg-amber-500'
            : badge.variant === 'danger'
            ? 'bg-rose-500'
            : 'bg-text-muted'
        }`}
      />
      <span>{badge.label}</span>
    </span>
  );
}
