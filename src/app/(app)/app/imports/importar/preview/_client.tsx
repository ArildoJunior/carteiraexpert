"use client";

import { ImportPreviewTable, type PreviewItem } from "@/components/portfolio/import-preview-table";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  items: PreviewItem[];
  jobId: string;
};

export function PreviewClient({ items, jobId }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAccept = () => {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/imports/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: selectedIds, decision: "accept" }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          toast.error(err.message ?? "Erro ao aceitar");
          return;
        }
        const body = (await res.json()) as { imported: number; duplicates: number };
        const parts: string[] = [];
        if (body.imported > 0) parts.push(`${body.imported} importadas`);
        if (body.duplicates > 0) parts.push(`${body.duplicates} duplicadas`);
        toast.success(parts.join(", "));
        router.push("/app/imports/pendentes");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro de rede";
        toast.error(message);
      }
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum item pendente para este import. Volte para{" "}
          <a href="/app/imports/importar" className="underline">
            importar outro arquivo
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedIds.length} {selectedIds.length === 1 ? "selecionado" : "selecionados"}
        </p>
        <Button onClick={handleAccept} disabled={selectedIds.length === 0 || isPending}>
          {isPending ? "Processando..." : `Aceitar ${selectedIds.length} selecionados`}
        </Button>
      </div>
      <ImportPreviewTable items={items} onSelectionChange={setSelectedIds} />
      <p className="text-xs text-muted-foreground">Job ID: {jobId}</p>
    </div>
  );
}
