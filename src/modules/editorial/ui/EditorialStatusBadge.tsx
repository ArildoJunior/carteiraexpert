import React from 'react';
import type { EditorialStatus } from '../domain/editorial.types';

interface EditorialStatusBadgeProps {
  status: EditorialStatus;
}

export function EditorialStatusBadge({ status }: EditorialStatusBadgeProps) {
  let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
  let label: string = status;

  switch (status) {
    case 'DRAFT':
      colorClass = 'bg-slate-800/80 text-slate-300 border-slate-600';
      label = 'Rascunho';
      break;
    case 'IN_REVIEW':
      colorClass = 'bg-amber-950/80 text-amber-300 border-amber-500/50 animate-pulse';
      label = 'Em Revisão';
      break;
    case 'CHANGES_REQUESTED':
      colorClass = 'bg-rose-950/80 text-rose-300 border-rose-500/50';
      label = 'Ajustes Solicitados';
      break;
    case 'APPROVED':
      colorClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50';
      label = 'Aprovado';
      break;
    case 'PUBLISHED':
      colorClass = 'bg-sky-950/80 text-sky-300 border-sky-500/50';
      label = 'Publicado';
      break;
    case 'ARCHIVED':
      colorClass = 'bg-zinc-900 text-zinc-400 border-zinc-700';
      label = 'Arquivado';
      break;
  }

  return (
    <span
      data-testid={`status-badge-${status.toLowerCase()}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {label}
    </span>
  );
}
