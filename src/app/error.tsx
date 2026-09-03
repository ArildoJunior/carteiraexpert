'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log seguro do erro para observabilidade do cliente, sem vazar para a UI
    console.error('Erro capturado pelo ErrorBoundary da aplicação:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="min-h-[60vh] flex flex-col items-center justify-center bg-background text-text-primary px-4 py-12"
    >
      <div className="text-center max-w-md space-y-4">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-negative-text/10 text-negative-text border border-negative-text/20">
          Erro de Execução
        </span>

        <h1 className="text-2xl font-extrabold tracking-tight text-text-primary" id="error-boundary-title">
          Algo não correu como esperado
        </h1>

        <p className="text-sm text-text-secondary">
          Ocorreu um erro temporário durante o carregamento deste componente. Nenhuma informação financeira foi
          comprometida.
        </p>

        {error.digest && (
          <p className="text-xs text-text-secondary/70 font-mono">
            Código de rastreio: {error.digest}
          </p>
        )}

        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-lg bg-action-primary text-action-primary-text font-medium text-xs hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-action-primary focus:ring-offset-2"
            id="btn-error-retry"
          >
            Tentar novamente
          </button>

          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-surface border border-border-theme text-text-primary font-medium text-xs hover:border-action-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-action-primary"
            id="btn-error-dashboard"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
