'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Erro crítico capturado pelo GlobalError da aplicação:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] text-white px-4 font-sans">
        <div
          role="alert"
          aria-live="assertive"
          className="text-center max-w-md space-y-4 p-8 rounded-xl bg-[#1E293B] border border-[#334155] shadow-xl"
        >
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            Erro Crítico de Inicialização
          </span>

          <h1 className="text-2xl font-extrabold tracking-tight text-white" id="global-error-title">
            Erro inesperado na aplicação
          </h1>

          <p className="text-sm text-slate-300">
            Ocorreu uma falha imprevista no carregamento da aplicação. Seus dados e configurações permanecem
            protegidos e intactos.
          </p>

          {error.digest && (
            <p className="text-xs text-slate-400 font-mono">
              Identificador do incidente: {error.digest}
            </p>
          )}

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="px-5 py-2.5 rounded-lg bg-amber-500 text-slate-900 font-semibold text-xs hover:bg-amber-400 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              id="btn-global-error-retry"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="px-5 py-2.5 rounded-lg bg-[#334155] text-white font-medium text-xs hover:bg-[#475569] transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
              id="btn-global-error-home"
            >
              Ir para Início
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
