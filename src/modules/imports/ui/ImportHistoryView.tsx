'use client';

import Link from 'next/link';
import type { SerializedImportBatch } from '../domain/import.types';

interface ImportHistoryViewProps {
  batches: SerializedImportBatch[];
}

export function ImportHistoryView({ batches }: ImportHistoryViewProps) {
  const formatNameMap: Record<string, string> = {
    carteiraexpert_csv: 'Padrão CarteiraExpert',
    b3_trades_csv: 'B3 Negociação',
    b3_movements_csv: 'B3 Movimentação',
  };

  return (
    <div className="bg-surface border border-border-theme rounded-xl shadow-sm overflow-hidden space-y-4 p-6">
      <div className="flex items-center justify-between border-b border-border-theme pb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Histórico de Lotes Importados
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Acompanhe o status e a revisão de todos os arquivos enviados para sua conta.
          </p>
        </div>
        <span className="text-xs font-medium text-text-muted">
          {batches.length} {batches.length === 1 ? 'lote registrado' : 'lotes registrados'}
        </span>
      </div>

      {batches.length === 0 ? (
        <div className="text-center py-12 px-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-surface-elevated border border-border-theme mx-auto flex items-center justify-center text-text-muted">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-primary">
            Nenhum lote de importação encontrado
          </p>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            Envie sua primeira planilha ou extrato CSV acima para iniciar a consolidação patrimonial.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-theme bg-surface-elevated/20 text-text-muted">
                <th className="py-3 px-3 font-semibold">Arquivo</th>
                <th className="py-3 px-3 font-semibold">Carteira</th>
                <th className="py-3 px-3 font-semibold">Formato</th>
                <th className="py-3 px-3 font-semibold">Data de Envio</th>
                <th className="py-3 px-3 font-semibold text-center">Registros</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-theme">
              {batches.map((batch) => {
                const statusBadge =
                  batch.status === 'pending_review' ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent-warning/10 text-accent-warning border border-accent-warning/30">
                      Pendente de Revisão
                    </span>
                  ) : batch.status === 'confirmed' ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent-success/10 text-accent-success border border-accent-success/30">
                      Confirmado
                    </span>
                  ) : batch.status === 'rejected' ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent-danger/10 text-accent-danger border border-accent-danger/30">
                      Rejeitado
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-surface-elevated text-text-muted border border-border-theme">
                      Falha
                    </span>
                  );

                return (
                  <tr
                    key={batch.id}
                    id={`batch-history-row-${batch.id}`}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="py-3 px-3 font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="truncate max-w-[200px]" title={batch.fileName}>
                          {batch.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-text-secondary">
                      {batch.portfolioName || 'Carteira Principal'}
                    </td>
                    <td className="py-3 px-3 text-text-muted">
                      {formatNameMap[batch.fileFormat] || batch.fileFormat}
                    </td>
                    <td className="py-3 px-3 text-text-secondary whitespace-nowrap">
                      {new Date(batch.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="text-accent-success font-medium">{batch.validRecords}</span>
                      <span className="text-text-muted"> / {batch.totalRecords}</span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {statusBadge}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        id={`btn-open-batch-${batch.id}`}
                        href={`/import/${batch.id}`}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          batch.status === 'pending_review'
                            ? 'bg-action-primary text-action-primary-text hover:opacity-95'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                        }`}
                      >
                        {batch.status === 'pending_review' ? 'Revisar' : 'Ver Detalhes'}
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
