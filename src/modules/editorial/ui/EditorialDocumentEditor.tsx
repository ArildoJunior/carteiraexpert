import React, { useState, useEffect } from 'react';
import type {
  SerializedEditorialDocument,
  EditorialDocumentType,
  EditorialVisibility,
  EditorialRegulatoryFlag,
} from '../domain/editorial.types';
import { evaluateEditorialGuardrails } from '../domain/editorial.rules';
import { EditorialStatusBadge } from './EditorialStatusBadge';

interface EditorialDocumentEditorProps {
  initialDocument?: SerializedEditorialDocument | null;
  onSaveDraft: (data: {
    documentId?: string;
    title: string;
    slug?: string;
    content: string;
    documentType: EditorialDocumentType;
    visibility: EditorialVisibility;
    notes?: string;
  }) => Promise<void>;
  onSubmitReview: (documentId: string) => Promise<void>;
  onPublish: (documentId: string) => Promise<void>;
  onAiAssistant: (params: {
    actionType: 'GENERATE_DRAFT' | 'SUGGEST_TITLE' | 'SUMMARIZE';
    prompt: string;
    documentType: EditorialDocumentType;
  }) => Promise<unknown>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function EditorialDocumentEditor({
  initialDocument,
  onSaveDraft,
  onSubmitReview,
  onPublish,
  onAiAssistant,
  onCancel,
  isLoading = false,
}: EditorialDocumentEditorProps) {
  const [title, setTitle] = useState(initialDocument?.title || '');
  const [slug, setSlug] = useState(initialDocument?.slug || '');
  const [documentType, setDocumentType] = useState<EditorialDocumentType>(
    initialDocument?.documentType || 'EDUCATIONAL_ARTICLE'
  );
  const [visibility, setVisibility] = useState<EditorialVisibility>(
    initialDocument?.visibility || 'INTERNAL'
  );
  const [content, setContent] = useState(initialDocument?.content || '');
  const [notes, setNotes] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [realtimeFlags, setRealtimeFlags] = useState<EditorialRegulatoryFlag[]>([]);

  // Avaliação em tempo real dos guardrails
  useEffect(() => {
    if (title || content) {
      const evaluated = evaluateEditorialGuardrails(title, content, documentType);
      setRealtimeFlags(evaluated);
    } else {
      setRealtimeFlags([]);
    }
  }, [title, content, documentType]);

  const hasBlockers = realtimeFlags.some((f) => f.severity === 'BLOCKER');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (hasBlockers) {
      setErrorMessage(
        'Impedimentos regulatórios detectados. Corrija os apontamentos em vermelho antes de salvar.'
      );
      return;
    }

    try {
      await onSaveDraft({
        documentId: initialDocument?.id,
        title,
        slug: slug || undefined,
        content,
        documentType,
        visibility,
        notes: notes || undefined,
      });
      setSuccessMessage('Rascunho salvo com sucesso!');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar rascunho.');
    }
  };

  const handleSubmitReview = async () => {
    if (!initialDocument?.id) return;
    setErrorMessage(null);
    if (hasBlockers) {
      setErrorMessage('Não é permitido submeter para revisão com pendências impeditivas (BLOCKER).');
      return;
    }

    try {
      await onSubmitReview(initialDocument.id);
      setSuccessMessage('Documento enviado com sucesso para a revisão humana obrigatória!');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao enviar para revisão.');
    }
  };

  const handlePublish = async () => {
    if (!initialDocument?.id) return;
    setErrorMessage(null);

    try {
      await onPublish(initialDocument.id);
      setSuccessMessage('Documento publicado internamente com sucesso!');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao publicar documento.');
    }
  };

  const handleAiAction = async (actionType: 'GENERATE_DRAFT' | 'SUGGEST_TITLE' | 'SUMMARIZE') => {
    const promptToUse = aiPrompt.trim() || content.trim() || title.trim();
    if (!promptToUse) {
      setErrorMessage('Preencha o campo de briefing/prompt da IA ou o conteúdo do documento.');
      return;
    }

    setAiLoading(true);
    setErrorMessage(null);

    try {
      const response = (await onAiAssistant({
        actionType,
        prompt: promptToUse,
        documentType,
      })) as any;

      if (actionType === 'GENERATE_DRAFT' && response) {
        setTitle(response.suggestedTitle || title);
        setContent(response.suggestedContent || content);
        setSuccessMessage('Rascunho gerado pela IA inserido no editor (Origem: AI_DRAFT).');
      } else if (actionType === 'SUGGEST_TITLE' && response?.suggestedTitles?.length > 0) {
        setTitle(response.suggestedTitles[0]);
        setSuccessMessage('Título sugerido pela IA aplicado.');
      } else if (actionType === 'SUMMARIZE' && response?.summary) {
        setContent((prev) => `${prev}\n\n## Resumo Executivo\n${response.summary}`);
        setSuccessMessage('Resumo da IA anexado ao conteúdo.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao executar assistência de IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const isApproved = initialDocument?.status === 'APPROVED';
  const isReadOnly = initialDocument?.status === 'PUBLISHED' || initialDocument?.status === 'ARCHIVED';

  return (
    <div
      id="editorial-document-editor"
      data-testid="editorial-document-editor"
      className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            {initialDocument ? 'Editar Documento Editorial' : 'Novo Documento Editorial'}
            {initialDocument && <EditorialStatusBadge status={initialDocument.status} />}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Produção, revisão e controle de qualidade assistidos por IA com revisão humana obrigatória.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="editorial-cancel-button"
            data-testid="editorial-cancel-button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Voltar
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/80 border border-rose-500/50 rounded-lg p-3 text-rose-200 text-xs">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-lg p-3 text-emerald-200 text-xs">
          {successMessage}
        </div>
      )}

      {/* Caixa de Assistência de IA (Mock / Desacoplada) */}
      {!isReadOnly && (
        <div className="bg-slate-950/70 border border-amber-500/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <span>✨</span> Assistente Editorial de IA (Geração de Rascunhos e Sugestões)
            </span>
            <span className="text-[10px] text-amber-400/70">
              Modelo: mock-editorial-v1 (Servidor)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              id="editorial-ai-prompt-input"
              data-testid="editorial-ai-prompt-input"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Digite o briefing ou tema para a IA (ex: Introdução sobre investimento em dividendos e juros sobre capital próprio)"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              id="editorial-ai-generate-draft-button"
              data-testid="editorial-ai-generate-draft-button"
              disabled={aiLoading || isLoading}
              onClick={() => handleAiAction('GENERATE_DRAFT')}
              className="px-3 py-2 text-xs font-medium text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition disabled:opacity-50"
            >
              {aiLoading ? 'Gerando...' : 'Gerar Rascunho'}
            </button>
            <button
              type="button"
              id="editorial-ai-suggest-title-button"
              data-testid="editorial-ai-suggest-title-button"
              disabled={aiLoading || isLoading}
              onClick={() => handleAiAction('SUGGEST_TITLE')}
              className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition disabled:opacity-50"
            >
              Sugerir Título
            </button>
            <button
              type="button"
              id="editorial-ai-summarize-button"
              data-testid="editorial-ai-summarize-button"
              disabled={aiLoading || isLoading}
              onClick={() => handleAiAction('SUMMARIZE')}
              className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition disabled:opacity-50"
            >
              Resumir
            </button>
          </div>
        </div>
      )}

      {/* Formulário Principal */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label
              htmlFor="editorial-input-title"
              className="block text-xs font-semibold text-slate-300"
            >
              Título do Documento
            </label>
            <input
              type="text"
              id="editorial-input-title"
              data-testid="editorial-input-title"
              disabled={isReadOnly || isLoading}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Guia Completo sobre Dividendos e JCP"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editorial-select-type"
              className="block text-xs font-semibold text-slate-300"
            >
              Tipo de Conteúdo
            </label>
            <select
              id="editorial-select-type"
              data-testid="editorial-select-type"
              disabled={isReadOnly || isLoading}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as EditorialDocumentType)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="editorial-input-slug"
              className="block text-xs font-semibold text-slate-300"
            >
              Slug (URL Amigável)
            </label>
            <input
              type="text"
              id="editorial-input-slug"
              data-testid="editorial-input-slug"
              disabled={isReadOnly || isLoading}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ex: guia-dividendos-jcp (opcional)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="editorial-select-visibility"
              className="block text-xs font-semibold text-slate-300"
            >
              Visibilidade
            </label>
            <select
              id="editorial-select-visibility"
              data-testid="editorial-select-visibility"
              disabled={isReadOnly || isLoading}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as EditorialVisibility)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="INTERNAL">Interna (Apenas Equipe)</option>
              <option value="PUBLIC">Pública (Portal Informativo)</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="editorial-textarea-content"
            className="block text-xs font-semibold text-slate-300 flex items-center justify-between"
          >
            <span>Conteúdo (Formato Markdown)</span>
            <span className="text-slate-500 text-[10px]">
              {content.length} caracteres
            </span>
          </label>
          <textarea
            id="editorial-textarea-content"
            data-testid="editorial-textarea-content"
            disabled={isReadOnly || isLoading}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="Escreva o conteúdo em Markdown. Ex: ## Introdução..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>

        {/* Indicador de Guardrails em Tempo Real */}
        {realtimeFlags.length > 0 && (
          <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
            <h5 className="text-xs font-semibold text-slate-300">
              Análise Preventiva de Guardrails:
            </h5>
            <div className="space-y-1">
              {realtimeFlags.map((f, i) => (
                <div
                  key={i}
                  className={`text-xs p-2 rounded border flex items-center justify-between ${
                    f.severity === 'BLOCKER'
                      ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                      : f.severity === 'WARNING'
                      ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <span>
                    <strong>[{f.severity}]</strong> {f.message}
                  </span>
                  {f.recommendation && (
                    <span className="text-[10px] opacity-75 ml-2">
                      ({f.recommendation})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            {!isReadOnly && (
              <button
                type="submit"
                id="editorial-save-draft-button"
                data-testid="editorial-save-draft-button"
                disabled={isLoading}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition disabled:opacity-50"
              >
                Salvar Rascunho
              </button>
            )}

            {initialDocument?.id &&
              (initialDocument.status === 'DRAFT' ||
                initialDocument.status === 'CHANGES_REQUESTED') && (
                <button
                  type="button"
                  id="editorial-submit-review-button"
                  data-testid="editorial-submit-review-button"
                  disabled={isLoading || hasBlockers}
                  onClick={handleSubmitReview}
                  className="px-5 py-2 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition disabled:opacity-50 shadow-md"
                >
                  Enviar para Revisão Humana
                </button>
              )}
          </div>

          <div>
            {isApproved && (
              <button
                type="button"
                id="editorial-publish-button"
                data-testid="editorial-publish-button"
                disabled={isLoading}
                onClick={handlePublish}
                className="px-6 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow-md disabled:opacity-50"
              >
                Publicar Conteúdo Aprovado
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
