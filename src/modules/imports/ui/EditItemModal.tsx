'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { updateImportBatchItemAction } from '../server/import.actions';
import type { SerializedImportBatchItem, ImportActionType } from '../domain/import.types';

interface EditItemModalProps {
  batchId: string;
  item: SerializedImportBatchItem | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditItemModal({
  batchId,
  item,
  onClose,
  onUpdated,
}: EditItemModalProps) {
  const [isPending, startTransition] = useTransition();

  // Formata data ISO para YYYY-MM-DD
  const initialDate = item?.tradeDate ? item.tradeDate.split('T')[0] : '';

  const [actionType, setActionType] = useState<ImportActionType>(
    item?.actionType || 'BUY'
  );
  const [direction, setDirection] = useState<'IN' | 'OUT' | ''>(
    item?.direction || (item?.actionType === 'MANUAL_ADJUSTMENT' ? 'IN' : '')
  );
  const [rawTicker, setRawTicker] = useState(item?.rawTicker || '');
  const [tradeDate, setTradeDate] = useState(initialDate);
  const [quantity, setQuantity] = useState(item?.quantity || '0');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice || '0');
  const [fees, setFees] = useState(item?.fees || '0');
  const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>(
    (item?.currency as any) || 'BRL'
  );
  const [notes, setNotes] = useState(item?.notes || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!item) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;

    setErrorMessage(null);

    startTransition(async () => {
      const res = await updateImportBatchItemAction(batchId, item.id, {
        actionType,
        direction: actionType === 'MANUAL_ADJUSTMENT' ? (direction as 'IN' | 'OUT') : null,
        rawTicker: rawTicker.trim(),
        tradeDate: `${tradeDate}T12:00:00.000Z`,
        quantity: quantity.replace(',', '.'),
        unitPrice: unitPrice.replace(',', '.'),
        fees: fees.replace(',', '.'),
        currency,
        notes: notes.trim() || null,
        isExcluded: item.isExcluded,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao atualizar item do lote.');
        return;
      }

      onUpdated();
      onClose();
    });
  }

  return (
    <div
      id="edit-item-modal-overlay"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="edit-item-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
        className="bg-surface border border-border-theme rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-border-theme pb-3">
          <div>
            <h3 id="edit-modal-title" className="text-base font-semibold text-text-primary">
              Editar Registro de Importação
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Linha original: <strong>#{item.lineNumber}</strong>
            </p>
          </div>
          <button
            id="btn-close-edit-modal"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-action-type" className="block text-xs font-medium text-text-secondary mb-1">
                Tipo de Operação <span className="text-accent-danger">*</span>
              </label>
              <select
                id="edit-action-type"
                value={actionType}
                onChange={(e) => {
                  const newType = e.target.value as ImportActionType;
                  setActionType(newType);
                  if (newType === 'MANUAL_ADJUSTMENT' && !direction) {
                    setDirection('IN');
                  }
                }}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              >
                <option value="BUY">Compra (BUY)</option>
                <option value="SELL">Venda (SELL)</option>
                <option value="TRANSFER_IN">Transferência Entrada</option>
                <option value="TRANSFER_OUT">Transferência Saída</option>
                <option value="MANUAL_ADJUSTMENT">Ajuste Manual</option>
              </select>
            </div>

            {actionType === 'MANUAL_ADJUSTMENT' ? (
              <div>
                <label htmlFor="edit-direction" className="block text-xs font-medium text-text-secondary mb-1">
                  Direção do Ajuste <span className="text-accent-danger">*</span>
                </label>
                <select
                  id="edit-direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
                  className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                >
                  <option value="IN">Entrada (IN)</option>
                  <option value="OUT">Saída (OUT)</option>
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="edit-ticker" className="block text-xs font-medium text-text-secondary mb-1">
                  Ticker / Código <span className="text-accent-danger">*</span>
                </label>
                <input
                  id="edit-ticker"
                  type="text"
                  value={rawTicker}
                  onChange={(e) => setRawTicker(e.target.value.toUpperCase())}
                  className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-action-primary"
                />
              </div>
            )}
          </div>

          {actionType === 'MANUAL_ADJUSTMENT' && (
            <div>
              <label htmlFor="edit-ticker-manual" className="block text-xs font-medium text-text-secondary mb-1">
                Ticker / Código <span className="text-accent-danger">*</span>
              </label>
              <input
                id="edit-ticker-manual"
                type="text"
                value={rawTicker}
                onChange={(e) => setRawTicker(e.target.value.toUpperCase())}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-trade-date" className="block text-xs font-medium text-text-secondary mb-1">
                Data da Operação <span className="text-accent-danger">*</span>
              </label>
              <input
                id="edit-trade-date"
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
            <div>
              <label htmlFor="edit-currency" className="block text-xs font-medium text-text-secondary mb-1">
                Moeda
              </label>
              <select
                id="edit-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="edit-quantity" className="block text-xs font-medium text-text-secondary mb-1">
                Quantidade <span className="text-accent-danger">*</span>
              </label>
              <input
                id="edit-quantity"
                type="text"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
            <div>
              <label htmlFor="edit-unit-price" className="block text-xs font-medium text-text-secondary mb-1">
                Preço Unitário <span className="text-accent-danger">*</span>
              </label>
              <input
                id="edit-unit-price"
                type="text"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
            <div>
              <label htmlFor="edit-fees" className="block text-xs font-medium text-text-secondary mb-1">
                Taxas / Custos
              </label>
              <input
                id="edit-fees"
                type="text"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-notes" className="block text-xs font-medium text-text-secondary mb-1">
              Observações / Notas
            </label>
            <input
              id="edit-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Compra corretora Rico"
              className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
            />
          </div>

          {errorMessage && (
            <div
              id="edit-item-error"
              role="alert"
              className="text-xs text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-2.5"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-theme">
            <button
              id="btn-cancel-edit"
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              Cancelar
            </button>
            <button
              id="btn-save-edit"
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
