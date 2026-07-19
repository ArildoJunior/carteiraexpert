"use client";

import { FileUploader } from "@/components/portfolio/file-uploader";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Connection = {
  id: string;
  brokerSlug: string;
  brokerName: string;
};

type Props = {
  connections: Connection[];
};

export function ImportarClient({ connections }: Props) {
  const firstId = connections[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(firstId);
  const router = useRouter();

  if (connections.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Voce ainda nao tem conexoes ativas. Crie uma primeiro em{" "}
          <a href="/app/imports/integracoes" className="underline">
            Integracoes
          </a>
          .
        </p>
      </div>
    );
  }

  const selected = connections.find((c) => c.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="connection-select">Conexao</Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger id="connection-select">
            <SelectValue placeholder="Selecione uma conexao" />
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.brokerName} ({c.brokerSlug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <FileUploader
          brokerSlug={selected.brokerSlug}
          connectionId={selected.id}
          onSuccess={({ jobId }) => {
            if (jobId) {
              router.push(`/app/imports/importar/preview?jobId=${jobId}`);
            }
          }}
        />
      )}
    </div>
  );
}
