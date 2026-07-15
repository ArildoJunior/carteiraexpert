import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card text-card-foreground p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">carteiraexpert</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sistema de Controle de Investimentos e Patrimônio. Stack rodando, banco conectado, design
          system inicial pronto.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition"
          >
            Criar conta
          </Link>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          As rotas /login e /cadastro serão criadas no Cap 3.
        </p>
      </div>
    </main>
  );
}
