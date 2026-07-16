import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "App" };

export default async function AppHomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/app");
  }

  return (
    <>
      <Header />
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Bem-vindo, {session.user.name ?? session.user.email}!</CardTitle>
            <CardDescription>
              Voce esta autenticado. 2FA ativo: {session.user.twoFactorEnabled ? "sim" : "nao"}.
              Verificado: {session.user.twoFactorVerified ? "sim" : "nao"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/verificar-2fa/setup">Configurar 2FA</Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
