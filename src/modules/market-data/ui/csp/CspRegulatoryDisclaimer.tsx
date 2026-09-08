'use client';

import React from 'react';
import { CSP_DISCLAIMER } from '@/modules/market-data/domain/csp-engine';

export interface CspRegulatoryDisclaimerProps {
  variant?: 'banner' | 'footer';
  className?: string;
}

export function CspRegulatoryDisclaimer({
  variant = 'banner',
  className = '',
}: CspRegulatoryDisclaimerProps) {
  if (variant === 'footer') {
    return (
      <footer
        className={`rounded-xl border border-border-theme bg-surface-elevated/40 p-4 text-xs text-text-muted leading-relaxed ${className}`}
        aria-label="Aviso Regulatório da Carteira Sugerida"
      >
        <div className="flex items-start gap-2.5">
          <span className="text-amber-500 font-bold shrink-0 text-sm">⚠️</span>
          <div className="space-y-1">
            <p className="font-semibold text-text-secondary">
              Aviso Regulatório Obrigatório — Finalidade Informativa e Educacional
            </p>
            <p>{CSP_DISCLAIMER}</p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <aside
      className={`rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-text-secondary leading-relaxed ${className}`}
      aria-label="Aviso Regulatório Permanente da Carteira Sugerida"
    >
      <div className="flex items-start gap-2.5">
        <span className="text-amber-500 font-bold shrink-0 text-base" aria-hidden="true">
          🛡️
        </span>
        <div className="space-y-1">
          <p className="font-bold text-amber-600 dark:text-amber-400">
            Aviso Regulatório — Algoritmo Neutro e Determinístico
          </p>
          <p className="text-text-muted">{CSP_DISCLAIMER}</p>
        </div>
      </div>
    </aside>
  );
}
