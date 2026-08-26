import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-text-primary px-4">
      <div className="text-center max-w-md space-y-4">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-action-primary/10 text-action-primary border border-action-primary/20">
          404 — Página Não Encontrada
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-text-primary" id="not-found-title">
          Ativo ou Página Não Encontrada
        </h1>
        <p className="text-sm text-text-secondary">
          O recurso solicitado não existe, foi removido ou não está disponível no catálogo público.
        </p>
        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/ativos"
            className="px-5 py-2.5 rounded-lg bg-action-primary text-action-primary-text font-medium text-xs hover:opacity-90 transition-opacity"
            id="btn-not-found-catalog"
          >
            Explorar Catálogo
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg bg-surface border border-border-theme text-text-primary font-medium text-xs hover:border-action-primary/50 transition-colors"
            id="btn-not-found-home"
          >
            Página Inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
