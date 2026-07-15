import { ThemeToggle } from "@/components/layout/theme-toggle";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
          carteiraexpert
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/dev/components"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
          >
            Componentes
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
