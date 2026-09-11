'use client';

import { useEffect } from 'react';

export interface TraceabilityInputItem {
  label: string;
  value: string;
  source?: string;
}

export interface IndicatorTraceabilityModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  formula: string;
  inputs: TraceabilityInputItem[];
  notes?: string[];
  methodology?: string;
}

export function IndicatorTraceabilityModal({
  open,
  onClose,
  title,
  formula,
  inputs,
  notes,
  methodology,
}: IndicatorTraceabilityModalProps) {
  useEffect(() => {
    if (!open) { return; }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Trava scroll do body enquanto o modal estiver aberto
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (!open) { return null; }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="traceability-modal-title"
    >
      <div className="bg-surface border border-border-theme rounded-xl shadow-xl max-w-lg w-full p-6 text-text-primary space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-border-theme">
          <h3
            id="traceability-modal-title"
            className="text-base font-bold text-text-primary"
          >
            {title} — Memória de Cálculo
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-surface-elevated transition-colors"
            aria-label="Fechar modal"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {methodology && (
          <div className="text-xs text-text-secondary leading-relaxed">
            {methodology}
          </div>
        )}

        {/* Fórmula Contábil em Monospace */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Fórmula Contábil
          </span>
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme font-mono text-xs text-text-primary break-all">
            {formula}
          </div>
        </div>

        {/* Parâmetros Factuais Utilizados */}
        {inputs.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Parâmetros Factuais Utilizados
            </span>
            <div className="space-y-1.5 text-xs">
              {inputs.map((inp) => (
                <div
                  key={inp.label}
                  className="flex items-center justify-between py-1 border-b border-border-theme/60"
                >
                  <span className="text-text-muted">{inp.label}:</span>
                  <div className="text-right">
                    <span className="font-semibold text-text-primary">
                      {inp.value}
                    </span>
                    {inp.source && (
                      <span className="text-[10px] text-text-muted ml-1.5 font-normal">
                        ({inp.source})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limitações e Notas Metodológicas */}
        {notes && notes.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border-theme text-xs">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Limitações e Notas Metodológicas
            </span>
            <ul className="list-disc list-inside space-y-1 text-text-muted text-[11px] leading-relaxed">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-3 border-t border-border-theme flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated border border-border-theme text-text-primary hover:bg-surface-elevated/80 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
