import React, { useState } from 'react';
import type {
  SerializedEditorialDocument,
  EditorialStatus,
  EditorialDocumentType,
} from '../domain/editorial.types';
import { EditorialStatusBadge } from './EditorialStatusBadge';

interface EditorialDocumentListProps {
  documents: SerializedEditorialDocument[];
  onSelectDocument: (doc: SerializedEditorialDocument) => void;
  onOpenReviewPanel: (doc: SerializedEditorialDocument) => void;
  onNewDocument: () => void;
  onArchive: (documentId: string) => Promise<void>;
  isLoading?: boolean;
}

export function EditorialDocumentList({
  documents,
  onSelectDocument,
  onOpenReviewPanel,
  onNewDocument,
  onArchive,
  isLoading = false,
}: EditorialDocumentListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filtered = documents.filter((doc) => {
    if (statusFilter !== 'ALL' && doc.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && doc.documentType !== typeFilter) return false;
    return true;
  });

  return (
    <div
      id="editorial-document-list"
      data-testid="editorial-document-list"
      className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-xl font-bold text-white">
            Documentos e Conteúdos Editoriais
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Gestão de artigos, notas institucionais e guias sob governança e revisão humana obrigatória.
          </p>
        </div>
        <button
          type="button"
          id="editorial-new-document-button"
          data-testid="editorial-new-document-button"
          disabled={isLoading}
          onClick={onNewDocument}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition shadow-md disabled:opacity-50"
        >
          + Novo Documento
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-status" className="text-xs text-slate-400">
            Status:
          </label>
          <select
            id="filter-status"
            data-testid="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todos os Status</option>
            <option value="DRAFT">Rascunho</option>
            <option value="IN_REVIEW">Em Revisão</option>
            <option value="CHANGES_REQUESTED">Ajustes Solicitados</option>
            <option value="APPROVED">Aprovado</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-type" className="text-xs text-slate-400">
            Tipo:
          </label>
          <select
            id="filter-type"
            data-testid="filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todos os Tipos</option>
            <option value="EDUCATIONAL_ARTICLE">Artigo Educacional</option>
            <option value="INSTITUTIONAL_NOTE">Nota Institucional</option>
            <option value="PRODUCT_EXPLANATION">Explicação de Produto</option>
            <option value="INTERNAL_DOC">Documentação Interna</option>
            <option value="GLOSSARY">Glossário</option>
            <option value="ANNOUNCEMENT">Comunicado</option>
            <option value="MARKET_ANALYSIS">Análise de Mercado</option>
            <option value="TAX_GUIDANCE">Guia Tributário</option>
            <option value="OPTIONS_DERIVATIVES">Opções e Derivativos</option>
          </select>
        </div>
      </div>

      {/* Tabela de Documentos */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-slate-950/40 border border-slate-800 rounded-lg">
          <p className="text-slate-400 text-sm">
            Nenhum documento editorial encontrado com os filtros selecionados.
          </p>
          <button
            type="button"
            onClick={onNewDocument}
            className="mt-3 text-xs text-amber-400 hover:text-amber-300 font-semibold"
          >
            Criar seu primeiro documento agora →
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Título</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Versão</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Última Atualização</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((doc) => (
                <tr
                  key={doc.id}
                  data-testid={`document-row-${doc.id}`}
                  className="hover:bg-slate-800/40 transition"
                >
                  <td className="py-3 px-4 font-semibold text-white">
                    {doc.title}
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {doc.documentType.replace('_', ' ')}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    v{doc.currentVersion}
                  </td>
                  <td className="py-3 px-4">
                    <EditorialStatusBadge status={doc.status} />
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(doc.updatedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      data-testid={`edit-doc-${doc.id}`}
                      onClick={() => onSelectDocument(doc)}
                      className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition"
                    >
                      Editar / Ver
                    </button>
                    <button
                      type="button"
                      data-testid={`review-doc-${doc.id}`}
                      onClick={() => onOpenReviewPanel(doc)}
                      className="px-2.5 py-1 text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/60 rounded transition"
                    >
                      Revisão Humana
                    </button>
                    {doc.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        data-testid={`archive-doc-${doc.id}`}
                        onClick={() => onArchive(doc.id)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-400 text-[11px]"
                      >
                        Arquivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
