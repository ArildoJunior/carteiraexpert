"use client";

import { type ImportQueueItem, ImportQueueTable } from "@/components/portfolio/import-queue-table";
import { ImportQueueToolbar } from "@/components/portfolio/import-queue-toolbar";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  items: ImportQueueItem[];
};

export function ImportQueueClient({ items }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (decision: "accept" | "reject") => {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/imports/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: selectedIds, decision }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          toast.error(err.message ?? "Erro ao processar");
          return;
        }
        const body = (await res.json()) as {
          imported: number;
          duplicates: number;
          rejected: number;
          errors: number;
        };
        if (decision === "accept") {
          const parts: string[] = [];
          if (body.imported > 0) parts.push(`${body.imported} importada(s)`);
          if (body.duplicates > 0) parts.push(`${body.duplicates} duplicada(s)`);
          if (body.rejected > 0) parts.push(`${body.rejected} rejeitada(s)`);
          if (body.errors > 0) parts.push(`${body.errors} com erro`);
          toast.success(parts.length > 0 ? parts.join(", ") : "Nada a aplicar");
        } else {
          toast.success(
            `${body.rejected} ${body.rejected === 1 ? "item rejeitado" : "itens rejeitados"}`
          );
        }
        setSelectedIds([]);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro de rede";
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <ImportQueueToolbar
        selectedCount={selectedIds.length}
        loading={isPending}
        onAccept={() => submit("accept")}
        onReject={() => submit("reject")}
      />
      <ImportQueueTable items={items} onSelectionChange={setSelectedIds} />
    </div>
  );
}
