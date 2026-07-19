"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, Loader2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

type Props = {
  brokerSlug: string;
  connectionId: string;
  onSuccess?: (data: { jobId: string; queued: number }) => void;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".txt"];

/**
 * Drop zone de arquivo de corretora.
 * Faz POST multipart para /api/v1/integrations/import.
 * Mostra preview do arquivo selecionado, botao de remover e estado de loading.
 * Padrao de UX: same as import-queue-toolbar (useTransition + sonner).
 */
export function FileUploader({ brokerSlug, connectionId, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    const filename = f.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext))) {
      toast.error(`Extensao nao suportada. Aceitas: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo excede ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }
    setFile(f);
  };

  const handleSubmit = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("brokerSlug", brokerSlug);
    formData.append("connectionId", connectionId);

    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/integrations/import", {
          method: "POST",
          body: formData,
        });
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          jobId?: string;
          queued?: number;
        };
        if (!res.ok) {
          toast.error(body.message ?? "Erro ao importar arquivo");
          return;
        }
        toast.success(`${body.queued ?? 0} transacoes adicionadas a fila`);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        onSuccess?.({ jobId: body.jobId ?? "", queued: body.queued ?? 0 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro de rede";
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="file-input">Arquivo da corretora</Label>
      <Input
        id="file-input"
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        disabled={isPending}
      />
      {file && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm">
            <FileUp className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleFile(null)}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Button type="button" onClick={handleSubmit} disabled={!file || isPending} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <FileUp className="mr-2 h-4 w-4" />
            Importar
          </>
        )}
      </Button>
    </div>
  );
}
