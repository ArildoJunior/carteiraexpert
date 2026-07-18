"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSpreadsheet,
} from "lucide-react";
import { useState } from "react";

// Tipo ja com broker joinado. A pagina (Task #8) transforma as rows do Drizzle
// em ImportJob[] antes de passar pro componente.
export type ImportJob = {
  id: string;
  sourceFilename: string;
  status: "running" | "success" | "error" | "partial";
  startedAt: string;
  finishedAt: string | null;
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsQueued: number;
  errorMessage: string | null;
  durationMs: number | null;
  brokerName: string;
};

type Status = ImportJob["status"];

const STATUS_CONFIG: Record<
  Status,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    Icon: typeof Clock;
  }
> = {
  running: { label: "Em andamento", variant: "secondary", Icon: Clock },
  success: { label: "Sucesso", variant: "default", Icon: CheckCircle2 },
  partial: { label: "Parcial", variant: "outline", Icon: AlertTriangle },
  error: { label: "Erro", variant: "destructive", Icon: AlertCircle },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}m ${rest.toFixed(0)}s`;
}

export function ImportJobCard({ job }: { job: ImportJob }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[job.status];
  const StatusIcon = config.Icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{job.sourceFilename}</p>
              <p className="text-xs text-muted-foreground">{job.brokerName}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Badge variant={config.variant}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {config.label}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? "Recolher detalhes" : "Expandir detalhes"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Lidas</p>
            <p className="tabular-nums font-medium">{job.rowsRead}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Importadas</p>
            <p className="tabular-nums font-medium text-primary">{job.rowsImported}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duplicadas</p>
            <p className="tabular-nums font-medium text-muted-foreground">{job.rowsSkipped}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="tabular-nums font-medium">{job.rowsQueued}</p>
          </div>
        </div>

        {expanded ? (
          <div className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Iniciado em</span>
              <span>{formatDate(job.startedAt)}</span>
            </div>
            {job.finishedAt ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Finalizado em</span>
                <span>{formatDate(job.finishedAt)}</span>
              </div>
            ) : null}
            {job.durationMs !== null ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duracao</span>
                <span>{formatDuration(job.durationMs)}</span>
              </div>
            ) : null}
            {job.errorMessage ? (
              <div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">Erro:</p>
                <p className="whitespace-pre-wrap">{job.errorMessage}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
