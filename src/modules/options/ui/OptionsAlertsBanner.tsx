import React from 'react';
import type { SerializedOptionProximityAlert } from '../domain/options.types';

interface OptionsAlertsBannerProps {
  alerts: SerializedOptionProximityAlert[];
  onSelectOption?: (contractId: string) => void;
}

export function OptionsAlertsBanner({ alerts, onSelectOption }: OptionsAlertsBannerProps) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      role="region"
      aria-label="Alertas de Vencimento de Opções B3"
      className="space-y-3 rounded-xl border border-border-theme bg-surface p-4 sm:p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary tracking-tight">
            Alertas de Proximidade de Vencimento (B3)
          </h3>
        </div>
        <span className="text-xs font-medium text-text-muted px-2 py-0.5 rounded-full bg-surface-hover">
          {alerts.length} {alerts.length === 1 ? 'alerta ativo' : 'alertas ativos'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {alerts.map((alert) => {
          const isCritical = alert.alertLevel === 'CRITICAL';
          const isWarning = alert.alertLevel === 'WARNING';
          const isExpired = alert.alertLevel === 'EXPIRED';

          let borderClass = 'border-border-theme';
          let badgeBg = 'bg-surface-hover text-text-secondary';
          let badgeText = `${alert.businessDaysRemaining} DU`;

          if (isCritical) {
            borderClass = 'border-rose-500/40 bg-rose-500/5';
            badgeBg = 'bg-rose-500 text-white font-bold animate-pulse';
            badgeText = 'VENCE HOJE (D-0)';
          } else if (isWarning) {
            borderClass = 'border-amber-500/40 bg-amber-500/5';
            badgeBg = 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold';
            badgeText = `${alert.businessDaysRemaining} DU (D-${alert.businessDaysRemaining})`;
          } else if (isExpired) {
            borderClass = 'border-border-theme bg-surface-subtle opacity-75';
            badgeBg = 'bg-border-theme text-text-muted font-medium';
            badgeText = 'VENCIDO';
          }

          return (
            <div
              key={alert.contractId}
              className={`rounded-lg border p-3.5 flex flex-col justify-between transition-all hover:shadow-sm ${borderClass}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text-primary">
                      {alert.ticker}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        alert.optionType === 'CALL'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {alert.optionType}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {alert.direction === 'BUY' ? 'Titular' : 'Lançador'}
                    </span>
                  </div>

                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${badgeBg}`}>
                    {badgeText}
                  </span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                  {alert.message}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-border-theme/40 flex items-center justify-between text-[11px] text-text-muted">
                <span>Strike: R$ {alert.strikePrice}</span>
                {onSelectOption && (
                  <button
                    type="button"
                    onClick={() => onSelectOption(alert.contractId)}
                    className="font-medium text-action-primary hover:underline"
                  >
                    Ver Análise →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
