'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SerializedImportBatch, SerializedImportBatchItem } from '../domain/import.types';
import {
  toggleImportBatchItemExclusionAction,
  confirmImportBatchAction,
  rejectImportBatchAction,
} from '../server/import.actions';
import { ResolveAssetModal } from './ResolveAssetModal';
import { EditItemModal } from './EditItemModal';

interface ImportBatchReviewViewProps {
  batch: SerializedImportBatch;
  items: SerializedImportBatchItem[];
}

type FilterTab = 'all' | 'valid' | 'warning' | 'error' | 'duplicates' | 'excluded';

export function ImportBatchReviewView({
  batch,
  items: initialItems,
}: ImportBatchReviewViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<SerializedImportBatchItem[]>(initialItems);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isPending, startTransition] = useTransition();

  // Modais de edição e resolução
  const [editingItem, setEditingItem] = useState<SerializedImportBatchItem | null>(null);
  const [resolvingItem, setResolvingItem] = useState<SerializedImportBatchItem | null>(null);

  // Modais de confirmação e descarte do lote
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Mensagens de erro/sucesso
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isPendingReview = batch.status === 'pending_review';

  // Métricas calculadas em tempo real na interface
  const totalCount = items.length;
  const validCount = items.filter((i) => i.status === 'valid' && !i.isExcluded).length;
  const warningCount = items.filter((i) => i.status === 'warning' && !i.isExcluded).length;
  const errorCount = items.filter((i) => i.status === 'error' && !i.isExcluded).length;
  const duplicateCount = items.filter((i) => i.isDuplicate).length;
  const excludedCount = items.filter((i) => i.isExcluded).length;
  const activeSelectedCount = items.filter((i) => !i.isExcluded).length;

  // Lote apto se houver pelo menos 1 selecionado e 0 erros ativos e 0 warnings sem ativo
  const hasUnmappedActiveWarning = items.some(
    (i) => !i.isExcluded && i.resolvedAssetId === null
  );
  const isReadyToConfirm =
    isPendingReview &&
    activeSelectedCount > 0 &&
    errorCount === 0 &&
    !hasUnmappedActiveWarning;

  // Filtragem dos itens para a tabela
  const filteredItems = items.filter((item) => {
    switch (activeTab) {
      case 'valid':
        return item.status === 'valid' && !item.isExcluded;
      case 'warning':
        return item.status === 'warning' && !item.isExcluded;
      case 'error':
        return item.status === 'error' && !item.isExcluded;
      case 'duplicates':
        return item.isDuplicate;
      case 'excluded':
        return item.isExcluded;
      default:
        return true;
    }
  });

  async function handleToggleExclusion(item: SerializedImportBatchItem) {
    if (!isPendingReview) return;
    const newExcluded = !item.isExcluded;

    // Atualização otimista
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isExcluded: newExcluded } : i))
    );

    startTransition(async () => {
      const res = await toggleImportBatchItemExclusionAction({
        batchId: batch.id,
        itemId: item.id,
        isExcluded: newExcluded,
      });

      if (!res.success) {
        // Reverte se falhar
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, isExcluded: !newExcluded } : i))
        );
        setActionError(res.error || 'Erro ao alternar inclusão do item.');
      }
    });
  }

  async function handleConfirmBatch() {
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await confirmImportBatchAction({
        batchId: batch.id,
      });

      if (!res.success || !res.data) {
        setActionError(res.error || 'Erro ao confirmar importação do lote.');
        setShowConfirmModal(false);
        return;
      }

      setActionSuccess(
        `Importação concluída com sucesso! ${res.data.importedEventsCount} operações foram adicionadas à carteira.`
      );
      setShowConfirmModal(false);
      router.refresh();
    });
  }

  async function handleRejectBatch() {
    setActionError(null);
    setActionSuccess(null);

    startTransition(async () => {
      const res = await rejectImportBatchAction({
        batchId: batch.id,
        reason: rejectReason.trim() || undefined,
      });

      if (!res.success) {
        setActionError(res.error || 'Erro ao rejeitar lote.');
        setShowRejectModal(false);
        return;
      }

      setActionSuccess('Lote rejeitado e descartado com sucesso.');
      setShowRejectModal(false);
      router.refresh();
    });
  }

  function formatMoney(val: string, currency = 'BRL'): string {
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    const num = Number.parseFloat(val) || 0;
    return `${symbol} ${num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatQuantity(val: string): string {
    const num = Number.parseFloat(val) || 0;
    return num.toLocaleString('pt-BR', { maximumFractionDigits: 8 });
  }

  function formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
      return isoDate;
    }
  }

  const formatNameMap: Record<string, string> = {
    carteiraexpert_csv: 'Padrão CarteiraExpert',
    b3_trades_csv: 'B3 Negociação de Ativos',
    b3_movements_csv: 'B3 Movimentações de Custódia',
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Lote */}
      <div className="bg-surface border border-border-theme rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/import"
                id="btn-back-to-imports"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                title="Voltar para lista de importações"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-xl font-bold text-text-primary truncate max-w-lg">
                {batch.fileName}
              </h1>
              {/* Badge de Status do Lote */}
              <span
                id="batch-status-badge"
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  batch.status === 'pending_review'
                    ? 'bg-accent-warning/10 text-accent-warning border-accent-warning/30'
                    : batch.status === 'confirmed'
                    ? 'bg-accent-success/10 text-accent-success border-accent-success/30'
                    : batch.status === 'rejected'
                    ? 'bg-accent-danger/10 text-accent-danger border-accent-danger/30'
                    : 'bg-surface-elevated text-text-muted border-border-theme'
                }`}
              >
                {batch.status === 'pending_review'
                  ? 'Pendente de Revisão'
                  : batch.status === 'confirmed'
                  ? 'Confirmado'
                  : batch.status === 'rejected'
                  ? 'Rejeitado / Descartado'
                  : 'Falha'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary mt-2 pl-9">
              <span>Carteira: <strong className="text-text-primary">{batch.portfolioName || 'Carteira Principal'}</strong></span>
              <span>•</span>
              <span>Formato: <strong className="text-text-primary">{formatNameMap[batch.fileFormat] || batch.fileFormat}</strong></span>
              <span>•</span>
              <span>Data de Envio: <strong className="text-text-primary">{new Date(batch.createdAt).toLocaleString('pt-BR')}</strong></span>
            </div>
          </div>

          {/* Ações Rápidas do Cabeçalho se estiver confirmado */}
          {batch.status === 'confirmed' && (
            <div className="flex items-center gap-3">
              <Link
                id="btn-view-portfolio-confirmed"
                href={`/portfolios/${batch.portfolioId}`}
                className="px-4 py-2 rounded-lg bg-action-primary text-action-primary-text font-medium text-xs hover:opacity-95 transition-opacity"
              >
                Ver Carteira Atualizada
              </Link>
            </div>
          )}
        </div>

        {/* Notificações e Alertas */}
        {actionError && (
          <div
            id="batch-action-error"
            role="alert"
            className="flex items-start gap-2.5 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3"
          >
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>{actionError}</div>
          </div>
        )}

        {(actionSuccess || batch.status === 'confirmed') && (
          <div
            id="batch-action-success"
            role="status"
            className="flex items-start gap-2.5 text-sm text-accent-success bg-accent-success/10 border border-accent-success/30 rounded-lg p-3"
          >
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <div>
              {actionSuccess ||
                `Lote confirmado com sucesso! ${batch.validRecords} operações foram gravadas e integradas à posição patrimonial.`}
            </div>
          </div>
        )}

        {batch.errorMessage && batch.status === 'rejected' && (
          <div className="text-xs text-text-secondary bg-surface-elevated border border-border-theme rounded-lg p-3">
            <strong>Motivo do Descarte:</strong> {batch.errorMessage}
          </div>
        )}

        {/* Cards KPI de Resumo do Lote */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="bg-background border border-border-theme rounded-lg p-3 text-center">
            <div className="text-xs text-text-muted">Total de Linhas</div>
            <div id="kpi-total-records" className="text-lg font-bold text-text-primary mt-0.5">{totalCount}</div>
          </div>
          <div className="bg-background border border-accent-success/30 rounded-lg p-3 text-center">
            <div className="text-xs text-accent-success">Válidos</div>
            <div id="kpi-valid-records" className="text-lg font-bold text-accent-success mt-0.5">{validCount}</div>
          </div>
          <div className="bg-background border border-accent-warning/30 rounded-lg p-3 text-center">
            <div className="text-xs text-accent-warning">Alertas / Avisos</div>
            <div id="kpi-warning-records" className="text-lg font-bold text-accent-warning mt-0.5">{warningCount}</div>
          </div>
          <div className="bg-background border border-accent-danger/30 rounded-lg p-3 text-center">
            <div className="text-xs text-accent-danger">Erros Bloqueantes</div>
            <div id="kpi-error-records" className="text-lg font-bold text-accent-danger mt-0.5">{errorCount}</div>
          </div>
          <div className="bg-background border border-border-theme rounded-lg p-3 text-center">
            <div className="text-xs text-text-muted">Duplicidades</div>
            <div id="kpi-duplicate-records" className="text-lg font-bold text-text-secondary mt-0.5">{duplicateCount}</div>
          </div>
          <div className="bg-background border border-border-theme rounded-lg p-3 text-center">
            <div className="text-xs text-text-muted">Desmarcados</div>
            <div id="kpi-excluded-records" className="text-lg font-bold text-text-secondary mt-0.5">{excludedCount}</div>
          </div>
        </div>
      </div>

      {/* Tabela de Revisão dos Registros */}
      <div className="bg-surface border border-border-theme rounded-xl shadow-sm overflow-hidden">
        {/* Abas de Filtros */}
        <div className="border-b border-border-theme bg-surface-elevated/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist">
            <button
              id="tab-filter-all"
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Todos ({totalCount})
            </button>
            <button
              id="tab-filter-valid"
              type="button"
              role="tab"
              aria-selected={activeTab === 'valid'}
              onClick={() => setActiveTab('valid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'valid'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Válidos ({validCount})
            </button>
            <button
              id="tab-filter-warning"
              type="button"
              role="tab"
              aria-selected={activeTab === 'warning'}
              onClick={() => setActiveTab('warning')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'warning'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Alertas ({warningCount})
            </button>
            <button
              id="tab-filter-error"
              type="button"
              role="tab"
              aria-selected={activeTab === 'error'}
              onClick={() => setActiveTab('error')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'error'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Erros ({errorCount})
            </button>
            <button
              id="tab-filter-duplicates"
              type="button"
              role="tab"
              aria-selected={activeTab === 'duplicates'}
              onClick={() => setActiveTab('duplicates')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'duplicates'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Duplicados ({duplicateCount})
            </button>
            <button
              id="tab-filter-excluded"
              type="button"
              role="tab"
              aria-selected={activeTab === 'excluded'}
              onClick={() => setActiveTab('excluded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'excluded'
                  ? 'bg-action-primary text-action-primary-text font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Desmarcados ({excludedCount})
            </button>
          </div>

          <div className="text-xs text-text-muted">
            Exibindo <strong>{filteredItems.length}</strong> registros
          </div>
        </div>

        {/* Tabela de Itens */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-theme bg-surface-elevated/20 text-text-muted">
                {isPendingReview && (
                  <th className="py-3 px-3 w-10 text-center">
                    <span className="sr-only">Incluir</span>
                  </th>
                )}
                <th className="py-3 px-3 w-12 font-semibold">Linha</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold">Ticker / Ativo</th>
                <th className="py-3 px-3 font-semibold">Tipo</th>
                <th className="py-3 px-3 font-semibold">Data</th>
                <th className="py-3 px-3 font-semibold text-right">Qtd</th>
                <th className="py-3 px-3 font-semibold text-right">Preço Unit.</th>
                <th className="py-3 px-3 font-semibold text-right">Taxas</th>
                <th className="py-3 px-3 font-semibold">Mensagens / Diagnóstico</th>
                {isPendingReview && <th className="py-3 px-3 font-semibold text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-theme">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isPendingReview ? 11 : 9} className="py-8 text-center text-text-muted">
                    Nenhum registro encontrado nesta categoria de filtro.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isExcluded = item.isExcluded;
                  const hasError = item.status === 'error';
                  const hasWarning = item.status === 'warning';
                  const isUnmapped = !item.resolvedAssetId;

                  return (
                    <tr
                      key={item.id}
                      id={`row-item-${item.id}`}
                      className={`hover:bg-surface-elevated/50 transition-colors ${
                        isExcluded ? 'opacity-50 bg-background/50' : ''
                      }`}
                    >
                      {/* Checkbox de Inclusão */}
                      {isPendingReview && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            id={`checkbox-item-${item.id}`}
                            checked={!item.isExcluded}
                            onChange={() => handleToggleExclusion(item)}
                            disabled={isPending}
                            aria-label={`Incluir linha ${item.lineNumber}`}
                            className="rounded border-border-theme text-action-primary focus:ring-action-primary h-4 w-4 cursor-pointer"
                          />
                        </td>
                      )}

                      {/* Linha Original */}
                      <td className="py-3 px-3 font-mono text-text-muted">
                        #{item.lineNumber}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isExcluded ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-elevated text-text-muted border border-border-theme">
                            Desmarcado
                          </span>
                        ) : hasError ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-danger/10 text-accent-danger border border-accent-danger/30">
                            Erro
                          </span>
                        ) : hasWarning ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-warning/10 text-accent-warning border border-accent-warning/30">
                            Aviso
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-accent-success/10 text-accent-success border border-accent-success/30">
                            Válido
                          </span>
                        )}
                      </td>

                      {/* Ticker / Ativo Resolvido */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-text-primary text-xs">
                            {item.rawTicker}
                          </span>
                          {item.resolvedAssetTicker && (
                            <span className="text-[11px] text-text-muted truncate max-w-[150px]">
                              {item.resolvedAssetName || item.resolvedAssetTicker}
                            </span>
                          )}
                          {isUnmapped && !isExcluded && (
                            <span className="text-[10px] text-accent-warning font-medium">
                              Ativo não associado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tipo de Operação */}
                      <td className="py-3 px-3">
                        <span className="font-semibold text-text-primary">
                          {item.actionType}
                        </span>
                        {item.direction && (
                          <span className="ml-1 text-[10px] text-text-muted">
                            ({item.direction})
                          </span>
                        )}
                      </td>

                      {/* Data */}
                      <td className="py-3 px-3 text-text-secondary whitespace-nowrap">
                        {formatDate(item.tradeDate)}
                      </td>

                      {/* Quantidade */}
                      <td className="py-3 px-3 text-right font-mono font-medium text-text-primary">
                        {formatQuantity(item.quantity)}
                      </td>

                      {/* Preço Unitário */}
                      <td className="py-3 px-3 text-right font-mono text-text-secondary">
                        {formatMoney(item.unitPrice, item.currency)}
                      </td>

                      {/* Taxas */}
                      <td className="py-3 px-3 text-right font-mono text-text-muted">
                        {formatMoney(item.fees, item.currency)}
                      </td>

                      {/* Mensagens de Diagnóstico */}
                      <td className="py-3 px-3 max-w-xs">
                        {item.validationErrors && item.validationErrors.length > 0 ? (
                          <ul className="space-y-0.5">
                            {item.validationErrors.map((err, idx) => (
                              <li key={idx} className="text-[11px] text-accent-danger flex items-start gap-1">
                                <span>•</span>
                                <span>{err}</span>
                              </li>
                            ))}
                          </ul>
                        ) : item.isDuplicate ? (
                          <span className="text-[11px] text-text-muted italic">
                            {item.duplicateReason || 'Possível duplicidade detectada'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-accent-success">Pronto para importar</span>
                        )}
                      </td>

                      {/* Ações por Linha */}
                      {isPendingReview && (
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          {isUnmapped && !isExcluded && (
                            <button
                              id={`btn-resolve-${item.id}`}
                              type="button"
                              onClick={() => setResolvingItem(item)}
                              disabled={isPending}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 border border-accent-warning/30 transition-colors"
                            >
                              Resolver Ativo
                            </button>
                          )}
                          <button
                            id={`btn-edit-${item.id}`}
                            type="button"
                            onClick={() => setEditingItem(item)}
                            disabled={isPending}
                            className="px-2 py-1 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                          >
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de Ações do Lote (Quando em revisão) */}
        {isPendingReview && (
          <div className="border-t border-border-theme bg-surface p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-text-secondary">
              <span>Selecionados para gravação: </span>
              <strong className="text-text-primary">{activeSelectedCount} de {totalCount}</strong>
              {hasUnmappedActiveWarning && (
                <span className="text-accent-warning ml-2 font-medium">
                  (Atenção: existem ativos não identificados nos itens selecionados)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                id="btn-open-reject-modal"
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={isPending}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10 text-xs font-medium transition-colors disabled:opacity-50"
              >
                Descartar Lote
              </button>

              <button
                id="btn-open-confirm-modal"
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={!isReadyToConfirm || isPending}
                title={
                  !isReadyToConfirm
                    ? 'Corrija ou desmarque itens com erro/sem ativo antes de confirmar.'
                    : 'Confirmar e consolidar operações no patrimônio.'
                }
                className="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-action-primary text-action-primary-text font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPending ? 'Processando...' : 'Confirmar Importação'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Edição de Registro */}
      {editingItem && (
        <EditItemModal
          batchId={batch.id}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdated={() => {
            router.refresh();
          }}
        />
      )}

      {/* Modal de Resolução de Ativo */}
      {resolvingItem && (
        <ResolveAssetModal
          batchId={batch.id}
          item={resolvingItem}
          onClose={() => setResolvingItem(null)}
          onResolved={(resolvedItemId, resolvedAssetId) => {
            const targetId = resolvedItemId || resolvingItem.id;
            setItems((prev) =>
              prev.map((i) =>
                i.id === targetId
                  ? {
                      ...i,
                      status: 'valid' as const,
                      resolvedAssetId: resolvedAssetId || i.resolvedAssetId || 'resolved-asset-id',
                      validationErrors: i.validationErrors.filter(
                        (err) =>
                          !err.toLowerCase().includes('não encontrado') &&
                          !err.toLowerCase().includes('não identificado')
                      ),
                    }
                  : i
              )
            );
            router.refresh();
          }}
        />
      )}

      {/* Modal de Confirmação de Gravação do Lote */}
      {showConfirmModal && (
        <div
          id="confirm-batch-modal-overlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            id="confirm-batch-modal"
            role="dialog"
            aria-modal="true"
            className="bg-surface border border-border-theme rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-10 h-10 rounded-full bg-accent-success/10 border border-accent-success/30 flex items-center justify-center text-accent-success">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h3 className="text-base font-bold text-text-primary">
                Confirmar Importação de Operações
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Serão criadas <strong>{activeSelectedCount} operações financeiras</strong> na carteira{' '}
                <strong>{batch.portfolioName || 'selecionada'}</strong>.
              </p>
            </div>

            <div className="bg-surface-elevated border border-border-theme rounded-lg p-3 text-xs space-y-1.5 text-text-secondary">
              <div>• Todas as posições e preços médios serão recalculados deterministicamente.</div>
              <div>• O lote será marcado como concluído e não poderá ser editado novamente.</div>
              <div>• Uma trilha de auditoria completa será registrada.</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-theme">
              <button
                id="btn-cancel-confirm-dialog"
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                Voltar e Revisar
              </button>
              <button
                id="btn-execute-confirm-batch"
                type="button"
                onClick={handleConfirmBatch}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-action-primary text-action-primary-text font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {isPending ? 'Gravando Operações...' : 'Confirmar e Gravar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Rejeição / Descarte do Lote */}
      {showRejectModal && (
        <div
          id="reject-batch-modal-overlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            id="reject-batch-modal"
            role="dialog"
            aria-modal="true"
            className="bg-surface border border-border-theme rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-10 h-10 rounded-full bg-accent-danger/10 border border-accent-danger/30 flex items-center justify-center text-accent-danger">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div>
              <h3 className="text-base font-bold text-text-primary">
                Descartar Lote de Importação
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Nenhum evento será gravado na sua carteira. Este lote será marcado como rejeitado.
              </p>
            </div>

            <div>
              <label htmlFor="input-reject-reason" className="block text-xs font-medium text-text-secondary mb-1">
                Motivo do Descarte (Opcional)
              </label>
              <input
                id="input-reject-reason"
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: Arquivo enviado incorretamente"
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent-danger"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-theme">
              <button
                id="btn-cancel-reject-dialog"
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              <button
                id="btn-execute-reject-batch"
                type="button"
                onClick={handleRejectBatch}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-accent-danger text-white font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50"
              >
                {isPending ? 'Descartando...' : 'Confirmar Descarte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
