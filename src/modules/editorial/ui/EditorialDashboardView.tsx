'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  SerializedEditorialDocument,
  SerializedEditorialVersion,
  SerializedEditorialReview,
  EditorialDocumentType,
  EditorialVisibility,
} from '../domain/editorial.types';
import { EditorialDisclaimerBanner } from './EditorialDisclaimerBanner';
import { EditorialDocumentList } from './EditorialDocumentList';
import { EditorialDocumentEditor } from './EditorialDocumentEditor';
import { EditorialReviewPanel } from './EditorialReviewPanel';
import {
  listEditorialDocumentsAction,
  getEditorialDocumentDetailsAction,
  createEditorialDocumentAction,
  updateEditorialDraftAction,
  submitEditorialForReviewAction,
  reviewEditorialDocumentAction,
  publishEditorialDocumentAction,
  archiveEditorialDocumentAction,
  executeEditorialAiAssistantAction,
} from '../server/editorial.actions';

export function EditorialDashboardView() {
  const [documents, setDocuments] = useState<SerializedEditorialDocument[]>([]);
  const [activeView, setActiveView] = useState<'LIST' | 'EDITOR' | 'REVIEW'>('LIST');
  const [selectedDocument, setSelectedDocument] = useState<SerializedEditorialDocument | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<SerializedEditorialVersion[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<SerializedEditorialReview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setGeneralError(null);
    try {
      const res = await listEditorialDocumentsAction();
      if (res.success && res.data) {
        setDocuments(res.data);
      } else {
        setGeneralError(res.error || 'Falha ao carregar documentos.');
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Erro de conexão.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSelectDocument = async (doc: SerializedEditorialDocument) => {
    setIsLoading(true);
    try {
      const res = await getEditorialDocumentDetailsAction(doc.id);
      if (res.success && res.data) {
        setSelectedDocument(res.data.document);
        setSelectedVersions(res.data.versions);
        setSelectedReviews(res.data.reviews);
        setActiveView('EDITOR');
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Erro ao carregar detalhes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReviewPanel = async (doc: SerializedEditorialDocument) => {
    setIsLoading(true);
    try {
      const res = await getEditorialDocumentDetailsAction(doc.id);
      if (res.success && res.data) {
        setSelectedDocument(res.data.document);
        setSelectedVersions(res.data.versions);
        setSelectedReviews(res.data.reviews);
        setActiveView('REVIEW');
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Erro ao carregar revisão.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = async (data: {
    documentId?: string;
    title: string;
    slug?: string;
    content: string;
    documentType: EditorialDocumentType;
    visibility: EditorialVisibility;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      if (data.documentId) {
        const res = await updateEditorialDraftAction({
          documentId: data.documentId,
          title: data.title,
          content: data.content,
          documentType: data.documentType,
          visibility: data.visibility,
          notes: data.notes,
        });
        if (!res.success) throw new Error(res.error);
        if (res.data) setSelectedDocument(res.data);
      } else {
        const res = await createEditorialDocumentAction({
          title: data.title,
          slug: data.slug,
          content: data.content,
          documentType: data.documentType,
          visibility: data.visibility,
        });
        if (!res.success) throw new Error(res.error);
        if (res.data) setSelectedDocument(res.data);
      }
      await fetchDocuments();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitReview = async (documentId: string) => {
    setIsLoading(true);
    try {
      const res = await submitEditorialForReviewAction({ documentId });
      if (!res.success) throw new Error(res.error);
      if (res.data) setSelectedDocument(res.data);
      await fetchDocuments();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewDecision = async (
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES',
    comments: string
  ) => {
    if (!selectedDocument) return;
    setIsLoading(true);
    try {
      const res = await reviewEditorialDocumentAction({
        documentId: selectedDocument.id,
        decision,
        comments,
      });
      if (!res.success) throw new Error(res.error);
      await fetchDocuments();
      setActiveView('LIST');
      setSelectedDocument(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async (documentId: string) => {
    setIsLoading(true);
    try {
      const res = await publishEditorialDocumentAction({
        documentId,
        confirmed: true,
      });
      if (!res.success) throw new Error(res.error);
      await fetchDocuments();
      setActiveView('LIST');
      setSelectedDocument(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async (documentId: string) => {
    setIsLoading(true);
    try {
      const res = await archiveEditorialDocumentAction({ documentId });
      if (!res.success) throw new Error(res.error);
      await fetchDocuments();
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiAssistant = async (params: {
    actionType: 'GENERATE_DRAFT' | 'SUGGEST_TITLE' | 'SUMMARIZE';
    prompt: string;
    documentType: EditorialDocumentType;
  }) => {
    const res = await executeEditorialAiAssistantAction({
      actionType: params.actionType,
      prompt: params.prompt,
      documentType: params.documentType,
      documentId: selectedDocument?.id,
    });
    if (!res.success) throw new Error(res.error);
    return res.data;
  };

  return (
    <div
      id="editorial-dashboard-view"
      data-testid="editorial-dashboard-view"
      className="space-y-6 max-w-7xl mx-auto px-4 py-8"
    >
      {/* Banner Regulatório Obrigatório */}
      <EditorialDisclaimerBanner />

      {generalError && (
        <div className="bg-rose-950/80 border border-rose-500/50 rounded-lg p-4 text-rose-200 text-sm">
          {generalError}
        </div>
      )}

      {/* Navegação de Visão */}
      {activeView === 'LIST' && (
        <EditorialDocumentList
          documents={documents}
          onSelectDocument={handleSelectDocument}
          onOpenReviewPanel={handleOpenReviewPanel}
          onNewDocument={() => {
            setSelectedDocument(null);
            setSelectedVersions([]);
            setSelectedReviews([]);
            setActiveView('EDITOR');
          }}
          onArchive={handleArchive}
          isLoading={isLoading}
        />
      )}

      {activeView === 'EDITOR' && (
        <EditorialDocumentEditor
          initialDocument={selectedDocument}
          onSaveDraft={handleSaveDraft}
          onSubmitReview={handleSubmitReview}
          onPublish={handlePublish}
          onAiAssistant={handleAiAssistant}
          onCancel={() => {
            setActiveView('LIST');
            setSelectedDocument(null);
          }}
          isLoading={isLoading}
        />
      )}

      {activeView === 'REVIEW' && selectedDocument && (
        <EditorialReviewPanel
          document={selectedDocument}
          versions={selectedVersions}
          reviews={selectedReviews}
          onReview={handleReviewDecision}
          onClose={() => {
            setActiveView('LIST');
            setSelectedDocument(null);
          }}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
