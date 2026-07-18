"use client";

import { Button } from "@/components/ui/button";
import { Check, Loader2, X } from "lucide-react";

type Props = {
  selectedCount: number;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
};

// Toolbar de acao em lote para a fila de importacao.
// Aparece abaixo (ou acima) da tabela e mostra 2 botoes:
//  - "Aceitar N selecionadas" (primary)
//  - "Rejeitar N selecionadas" (outline destructive)
//
// Os botoes ficam desabilitados quando nada esta selecionado OU
// quando uma chamada esta em andamento (loading).
export function ImportQueueToolbar({ selectedCount, loading, onAccept, onReject }: Props) {
  const hasSelection = selectedCount > 0;
  const acceptLabel = hasSelection
    ? `Aceitar ${selectedCount} ${selectedCount === 1 ? "selecionada" : "selecionadas"}`
    : "Aceitar selecionadas";
  const rejectLabel = hasSelection
    ? `Rejeitar ${selectedCount} ${selectedCount === 1 ? "selecionada" : "selecionadas"}`
    : "Rejeitar selecionadas";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {hasSelection
          ? `${selectedCount} ${selectedCount === 1 ? "item selecionado" : "itens selecionados"}`
          : "Nenhum item selecionado"}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onReject}
          disabled={!hasSelection || loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <X className="mr-2 h-4 w-4" />
          )}
          {rejectLabel}
        </Button>
        <Button type="button" onClick={onAccept} disabled={!hasSelection || loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {acceptLabel}
        </Button>
      </div>
    </div>
  );
}
