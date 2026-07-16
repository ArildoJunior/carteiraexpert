"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Status = "loading" | "success" | "error";

export function VerificarEmailStatus() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    fetch(`/api/v1/auth/verificar-email?token=${token}`)
      .then((r) => (r.ok ? setStatus("success") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Verificando e-mail…</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link invalido</CardTitle>
            <CardDescription>O link de verificacao e invalido ou expirou.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Solicite um novo e-mail de verificacao na sua conta.
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href="/login">Voltar para login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>E-mail verificado</CardTitle>
          <CardDescription>Sua conta esta ativa.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              router.push("/app");
              router.refresh();
            }}
            className="w-full"
          >
            Ir para o app
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
