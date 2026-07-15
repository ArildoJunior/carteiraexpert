import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Capítulo 2 — Design System</CardTitle>
            <CardDescription>
              Tema claro/escuro, tokens semânticos, 15+ componentes prontos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild size="lg">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dev/components">Ver componentes →</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
