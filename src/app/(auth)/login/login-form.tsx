"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("E-mail ou senha incorretos");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Erro de conexao");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    await signIn("google", { callbackUrl });
  }

  const hasGoogle =
    typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_GOOGLE_ENABLED);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Acesse sua conta carteiraexpert.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            {hasGoogle && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
                  Entrar com Google
                </Button>
              </>
            )}
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground space-x-2">
            <Link href="/cadastro" className="text-primary hover:underline">
              Criar conta
            </Link>
            <span>·</span>
            <Link href="/esqueci-senha" className="text-primary hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
