'use client';

import { useState, useTransition } from 'react';
import { resolveUnmappedBatchItemAssetAction } from '../server/import.actions';
import { AssetSearchSelect } from '@/modules/portfolio/ui/AssetSearchSelect';
import type { Asset } from '@/modules/portfolio/domain/asset.types';
import type { SerializedImportBatchItem } from '../domain/import.types';

interface ResolveAssetModalProps {
  batchId: string;
  item: SerializedImportBatchItem | null;
  onClose: () => void;
  onResolved?: (itemId?: string, resolvedAssetId?: string) => void;
}

export function ResolveAssetModal({
  batchId,
  item,
  onClose,
  onResolved,
}: ResolveAssetModalProps) {
  const [isPending, setIsPending] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<'existing' | 'custom'>('existing');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [customName, setCustomName] = useState(item?.rawTicker || '');
  const [customCurrency, setCustomCurrency] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!item) return null;

  async function handleResolve() {
    if (!item) return;
    const targetItem = item;
    setErrorMessage(null);

    if (resolutionMode === 'existing') {
      if (!selectedAsset) {
        setErrorMessage('Selecione um ativo da lista para associar.');
        return;
      }

      setIsPending(true);
      try {
        const res = await resolveUnmappedBatchItemAssetAction({
          batchId,
          itemId: targetItem.id,
          action: 'select_existing',
          existingAssetId: selectedAsset.id,
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Erro ao associar ativo.');
          setIsPending(false);
          return;
        }

        onResolved?.(targetItem.id, selectedAsset.id);
        onClose();
      } catch (err: any) {
        setErrorMessage(err?.message || 'Erro ao associar ativo.');
      } finally {
        setIsPending(false);
      }
    } else {
      if (!customName.trim()) {
        setErrorMessage('Informe o nome do ativo customizado.');
        return;
      }

      setIsPending(true);
      try {
        const res = await resolveUnmappedBatchItemAssetAction({
          batchId,
          itemId: targetItem.id,
          action: 'create_custom',
          customAssetData: {
            name: customName.trim(),
            currency: customCurrency,
          },
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Erro ao criar ativo customizado.');
          setIsPending(false);
          return;
        }

        onResolved?.(targetItem.id, 'resolved-custom');
        onClose();
      } catch (err: any) {
        setErrorMessage(err?.message || 'Erro ao criar ativo customizado.');
      } finally {
        setIsPending(false);
      }
    }
  }

  return (
    <div
      id="resolve-asset-modal-overlay"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="resolve-asset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-modal-title"
        className="bg-surface border border-border-theme rounded-xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-border-theme pb-3">
          <div>
            <h3 id="resolve-modal-title" className="text-base font-semibold text-text-primary">
              Resolver Ativo Não Identificado
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Linha {item.lineNumber} • Código original: <strong className="font-mono text-text-primary">{item.rawTicker}</strong>
            </p>
          </div>
          <button
            id="btn-close-resolve-modal"
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Seleção do Modo de Resolução */}
        <div className="flex items-center gap-2 p-1 bg-surface-elevated border border-border-theme rounded-lg">
          <button
            id="btn-tab-existing-asset"
            type="button"
            onClick={() => {
              setResolutionMode('existing');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              resolutionMode === 'existing'
                ? 'bg-surface text-text-primary shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Selecionar no Catálogo
          </button>
          <button
            id="btn-tab-custom-asset"
            type="button"
            onClick={() => {
              setResolutionMode('custom');
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              resolutionMode === 'custom'
                ? 'bg-surface text-text-primary shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Criar Ativo Customizado
          </button>
        </div>

        {/* Modo 1: Catálogo Existente */}
        {resolutionMode === 'existing' ? (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              Pesquise pelo código oficial ou nome da empresa para vincular este registro.
            </p>
            <AssetSearchSelect
              selectedAsset={selectedAsset}
              onSelectAsset={setSelectedAsset}
            />
          </div>
        ) : (
          /* Modo 2: Ativo Customizado */
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              Crie um ativo próprio associado à sua conta para registrar ativos fora do catálogo público.
            </p>
            <div>
              <label htmlFor="custom-asset-ticker" className="block text-xs font-medium text-text-secondary mb-1">
                Código / Ticker
              </label>
              <input
                id="custom-asset-ticker"
                type="text"
                value={item.rawTicker}
                disabled
                className="w-full bg-surface-elevated border border-border-theme rounded-lg px-3 py-2 text-text-muted text-sm font-mono cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="custom-asset-name" className="block text-xs font-medium text-text-secondary mb-1">
                Nome do Ativo <span className="text-accent-danger">*</span>
              </label>
              <input
                id="custom-asset-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: Minha Empresa SPE, Debênture XYZ"
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
            <div>
              <label htmlFor="custom-asset-currency" className="block text-xs font-medium text-text-secondary mb-1">
                Moeda
              </label>
              <select
                id="custom-asset-currency"
                value={customCurrency}
                onChange={(e) => setCustomCurrency(e.target.value as any)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            id="resolve-asset-error"
            role="alert"
            className="text-xs text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-2.5"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-theme">
          <button
            id="btn-cancel-resolve"
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            Cancelar
          </button>
          <button
            id="btn-confirm-resolve"
            type="button"
            onClick={handleResolve}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {isPending ? 'Salvando...' : 'Confirmar Associação'}
          </button>
        </div>
      </div>
    </div>
  );
}
