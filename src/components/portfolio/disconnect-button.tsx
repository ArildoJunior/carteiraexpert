"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  connectionId: string;
};

/**
 * Botao 2-step de desconexao de broker_connection.
 * Step 1: "Desconectar" (outline)
 * Step 2: "Confirmar" (destructive) + botao "Cancelar" ao lado
 * Apos sucesso: router.refresh() rebusca a lista de conexoes.
 * Cap 17 vai chamar PluggyConnector.revoke() antes do DELETE (terreno pronto).
 */
export function DisconnectButton({ connectionId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const handleDisconnect = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/imports/connections/${connectionId}`, {
          method: "DELETE",
        });
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          toast.error(body.message ?? "Erro ao desconectar");
          return;
        }
        toast.success(body.message ?? "Conexao desconectada");
        setConfirming(false);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro de rede";
        toast.error(message);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {confirming && (
        <span className="text-sm text-muted-foreground">Clique novamente para confirmar</span>
      )}
      <Button
        type="button"
        variant={confirming ? "destructive" : "outline"}
        onClick={handleDisconnect}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Unplug className="mr-2 h-4 w-4" />
        )}
        {confirming ? "Confirmar" : "Desconectar"}
      </Button>
      {confirming && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
      )}
    </div>
  );
}
