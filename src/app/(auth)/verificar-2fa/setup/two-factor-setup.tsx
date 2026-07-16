"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "loading" | "qrcode" | "verify" | "backup";

export function TwoFactorSetup() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/2fa/ativar", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          setError("Erro ao iniciar setup");
          return;
        }
        const data = await r.json();
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setBackupCodes(data.backupCodes);
        setStep("qrcode");
      })
      .catch(() => setError("Erro de conexao"));
  }, []);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/v1/auth/2fa/verificar-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      setError("Codigo invalido");
      return;
    }
    setStep("backup");
  }

  if (step === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Carregandoâ€¦</p>
      </main>
    );
  }

  if (step === "qrcode") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Configurar 2FA</CardTitle>
            <CardDescription>Escaneie o QR code com seu app autenticador.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center bg-white p-4 rounded-md">
              {qrCode ? <img src={qrCode} alt="QR Code para 2FA" className="w-48 h-48" /> : null}
            </div>
            <p className="text-xs text-muted-foreground break-all">
              Nao consegue escanear? Codigo manual: <code>{secret}</code>
            </p>
            <form onSubmit={onVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Codigo de 6 digitos</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full">
                Verificar
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Codigos de backup</CardTitle>
          <CardDescription>
            Guarde esses codigos em local seguro. Cada um pode ser usado uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 font-mono text-sm">
            {backupCodes.map((c) => (
              <code key={c} className="select-all">
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                const blob = new Blob([backupCodes.join("\n")], {
                  type: "text/plain",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "carteiraexpert-backup-codes.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Baixar codigos
            </Button>
            <Button type="button" className="flex-1" onClick={() => router.push("/app")}>
              Concluir
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
