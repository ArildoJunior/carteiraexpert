import React, { useState } from 'react';
import type {
  SerializedEditorialDocument,
  SerializedEditorialVersion,
  SerializedEditorialReview,
} from '../domain/editorial.types';

interface EditorialReviewPanelProps {
  document: SerializedEditorialDocument;
  versions: SerializedEditorialVersion[];
  reviews: SerializedEditorialReview[];
  onReview: (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES', comments: string) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export function EditorialReviewPanel({
  document,
  versions,
  reviews,
  onReview,
  onClose,
  isLoading = false,
}: EditorialReviewPanelProps) {
  const [comments, setComments] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAction = async (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES') => {
    setErrorMessage(null);
    if ((decision === 'REJECT' || decision === 'REQUEST_CHANGES') && comments.trim().length < 5) {
      setErrorMessage('O comentário justificativo é obrigatório (mínimo de 5 caracteres) para reprovação ou ajustes.');
      return;
    }

    try {
      await onReview(decision, comments);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao processar revisão.');
    }
  };

  return (
    <div
      id="editorial-review-panel"
      data-testid="editorial-review-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white">
            Painel de Revisão Humana Obrigatória
          </h3>
          <p className="text-xs text-slate-400">
            Documento: <span className="text-slate-200">{document.title}</span> (v{document.currentVersion})
          </p>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="text-slate-400 hover:text-white text-sm"
        >
          ✕ Fechar
        </button>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/80 border border-rose-500/50 rounded-lg p-3 text-rose-200 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Alertas Regulatórios Detectados */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-200">
          Diagnóstico de Guardrails Regulatórios
        </h4>
        {document.regulatoryFlags && document.regulatoryFlags.length > 0 ? (
          <div className="space-y-2">
            {document.regulatoryFlags.map((flag, idx) => {
              let badgeColor = 'bg-blue-950 text-blue-300 border-blue-800';
              if (flag.severity === 'BLOCKER') {
                badgeColor = 'bg-rose-950 text-rose-300 border-rose-800';
              } else if (flag.severity === 'WARNING') {
                badgeColor = 'bg-amber-950 text-amber-300 border-amber-800';
              }
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs flex flex-col gap-1 ${badgeColor}`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{flag.code}</span>
                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded border">
                      {flag.severity}
                    </span>
                  </div>
                  <p>{flag.message}</p>
                  {flag.recommendation && (
                    <p className="text-[11px] opacity-80 italic">
                      Recomendação: {flag.recommendation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg">
            ✓ Nenhum impedimento ou pendência regulatória detectada nos guardrails determinísticos.
          </p>
        )}
      </div>

      {/* Histórico de Versões */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-200">
          Histórico de Versões Imutáveis
        </h4>
        <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
          {versions.map((ver) => (
            <div
              key={ver.id}
              className="bg-slate-950/60 border border-slate-800 rounded p-2.5 text-xs flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-slate-200">
                  Versão {ver.versionNumber}
                </span>
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                  Origem: {ver.origin}
                </span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Hash: {ver.contentHash.slice(0, 12)}...
                </p>
              </div>
              <span className="text-slate-400 text-[11px]">
                {new Date(ver.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico de Revisões Anteriores */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-200">
            Decisões Anteriores de Revisão
          </h4>
          <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-slate-950/40 border border-slate-800/80 rounded p-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">
                    Decisão: {rev.decision} (v{rev.versionNumber})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(rev.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-slate-400 italic">"{rev.comments}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campo de Comentários para Nova Decisão */}
      <div className="space-y-1.5">
        <label
          htmlFor="editorial-review-comments"
          className="block text-xs font-semibold text-slate-300"
        >
          Parecer e Comentários da Revisão Humana
        </label>
        <textarea
          id="editorial-review-comments"
          data-testid="editorial-review-comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Insira os apontamentos detalhados da revisão. Obrigatório em caso de reprovação ou ajustes."
          rows={3}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Botões de Ação de Revisão */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
        <button
          type="button"
          id="editorial-btn-reject"
          data-testid="editorial-btn-reject"
          disabled={isLoading}
          onClick={() => handleAction('REJECT')}
          className="px-4 py-2 text-xs font-semibold text-rose-300 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-lg transition disabled:opacity-50"
        >
          Reprovar
        </button>
        <button
          type="button"
          id="editorial-btn-request-changes"
          data-testid="editorial-btn-request-changes"
          disabled={isLoading}
          onClick={() => handleAction('REQUEST_CHANGES')}
          className="px-4 py-2 text-xs font-semibold text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 rounded-lg transition disabled:opacity-50"
        >
          Solicitar Alterações
        </button>
        <button
          type="button"
          id="editorial-btn-approve"
          data-testid="editorial-btn-approve"
          disabled={isLoading}
          onClick={() => handleAction('APPROVE')}
          className="px-5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition shadow-md disabled:opacity-50"
        >
          Aprovar para Publicação
        </button>
      </div>
    </div>
  );
}
