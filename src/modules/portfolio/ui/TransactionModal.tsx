'use client';

import { useState, useEffect } from 'react';
import { Decimal } from '@/lib/decimal';
import {
  createPortfolioEventAction,
  getAssetPositionAction,
  type ActionResult,
} from '../server/portfolio.actions';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';
import { AssetSearchSelect } from './AssetSearchSelect';
import { CustomAssetModal } from './CustomAssetModal';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onSuccess?: () => void;
  initialAsset?: Asset | null;
}

export function TransactionModal({
  isOpen,
  onClose,
  portfolioId,
  onSuccess,
  initialAsset,
}: TransactionModalProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(initialAsset ?? null);
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL' | 'MANUAL_ADJUSTMENT'>('BUY');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [availableQty, setAvailableQty] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<PortfolioEvent>>({ success: false });

  // Estado para abertura do modal de cadastro de ativo customizado
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customTickerInitial, setCustomTickerInitial] = useState('');

  // Formata a data atual para YYYY-MM-DD (padrão do input date)
  const todayStr = new Date().toISOString().split('T')[0];

  // Sincroniza o ativo pré-selecionado na abertura do modal
  useEffect(() => {
    if (isOpen) {
      setSelectedAsset(initialAsset ?? null);
    }
  }, [isOpen, initialAsset]);

  // Busca posição disponível quando seleciona ativo em modo VENDA ou AJUSTE DE SAÍDA com proteção contra estado obsoleto
  useEffect(() => {
    // 1. Limpa imediatamente a posição disponível para não exibir dados do ativo anterior
    setAvailableQty(null);

    let active = true;

    async function fetchAvailable() {
      if (
        selectedAsset &&
        (transactionType === 'SELL' || (transactionType === 'MANUAL_ADJUSTMENT' && direction === 'OUT'))
      ) {
        try {
          const res = await getAssetPositionAction(portfolioId, selectedAsset.id);
          if (active) {
            if (res.success && res.data?.position?.quantity) {
              setAvailableQty(res.data.position.quantity);
            } else {
              setAvailableQty(null);
            }
          }
        } catch {
          if (active) {
            setAvailableQty(null);
          }
        }
      }
    }

    fetchAvailable();

    return () => {
      active = false;
    };
  }, [selectedAsset, transactionType, direction, portfolioId]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData(e.currentTarget);
      formData.set('portfolioId', portfolioId);
      formData.set('type', transactionType);
      if (transactionType === 'MANUAL_ADJUSTMENT') {
        formData.set('direction', direction);
      } else {
        formData.delete('direction');
      }
      if (selectedAsset) {
        formData.set('assetId', selectedAsset.id);
      }

      const res = await createPortfolioEventAction(null, formData);
      setState(res);

      if (res.success) {
        setSelectedAsset(null);
        onSuccess?.();
        onClose();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao registrar operação.',
      });
    } finally {
      setPending(false);
    }
  }

  // Verifica se a quantidade disponível é estritamente positiva usando Decimal puro
  const isAvailablePositive = (() => {
    if (!availableQty) return false;
    try {
      return new Decimal(availableQty).greaterThan(0);
    } catch {
      return false;
    }
  })();

  return (
    <>
      <div
        id="transaction-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
      >
        <div className="relative w-full max-w-lg bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-text-primary">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-theme pb-4">
            <h2
              id="transaction-modal-title"
              className="text-lg font-semibold text-text-primary"
            >
              Registrar Nova Operação
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-surface transition-colors"
              aria-label="Fechar modal"
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Erro global */}
            {state.error && !state.success && (
              <div
                id="transaction-error-alert"
                role="alert"
                className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
              >
                {state.error}
              </div>
            )}

            {/* Seletor Tipo: Compra / Venda / Ajuste Manual */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Tipo de Operação <span className="text-negative-text">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  id="transaction-type-buy"
                  type="button"
                  onClick={() => setTransactionType('BUY')}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    transactionType === 'BUY'
                      ? 'bg-positive-text/10 border-positive-text text-positive-text ring-2 ring-positive-text/20'
                      : 'bg-background border-border-theme text-text-secondary hover:bg-surface'
                  }`}
                >
                  <span>🟢</span> Compra (BUY)
                </button>
                <button
                  id="transaction-type-sell"
                  type="button"
                  onClick={() => setTransactionType('SELL')}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    transactionType === 'SELL'
                      ? 'bg-action-primary/10 border-action-primary text-action-primary ring-2 ring-action-primary/20'
                      : 'bg-background border-border-theme text-text-secondary hover:bg-surface'
                  }`}
                >
                  <span>🔵</span> Venda (SELL)
                </button>
                <button
                  id="transaction-type-adjustment"
                  type="button"
                  onClick={() => setTransactionType('MANUAL_ADJUSTMENT')}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                    transactionType === 'MANUAL_ADJUSTMENT'
                      ? 'bg-action-primary/10 border-action-primary text-action-primary ring-2 ring-action-primary/20'
                      : 'bg-background border-border-theme text-text-secondary hover:bg-surface'
                  }`}
                >
                  <span>⚙️</span> Ajuste Manual
                </button>
              </div>
            </div>

            {/* Seletor de Direção: Exibido APENAS para MANUAL_ADJUSTMENT */}
            {transactionType === 'MANUAL_ADJUSTMENT' && (
              <div id="transaction-direction-container">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Direção do Ajuste <span className="text-negative-text">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="transaction-direction-in"
                    type="button"
                    onClick={() => setDirection('IN')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                      direction === 'IN'
                        ? 'bg-positive-text/10 border-positive-text text-positive-text ring-2 ring-positive-text/20'
                        : 'bg-background border-border-theme text-text-secondary hover:bg-surface'
                    }`}
                  >
                    <span>📥</span> Entrada (IN)
                  </button>
                  <button
                    id="transaction-direction-out"
                    type="button"
                    onClick={() => setDirection('OUT')}
                    className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                      direction === 'OUT'
                        ? 'bg-negative-text/10 border-negative-text text-negative-text ring-2 ring-negative-text/20'
                        : 'bg-background border-border-theme text-text-secondary hover:bg-surface'
                    }`}
                  >
                    <span>📤</span> Saída (OUT)
                  </button>
                </div>
                {state.fieldErrors?.direction && (
                  <p
                    id="transaction-direction-error"
                    className="text-negative-text text-xs mt-1"
                  >
                    {state.fieldErrors.direction[0]}
                  </p>
                )}
              </div>
            )}

            {/* Seletor de Ativo */}
            <AssetSearchSelect
              selectedAsset={selectedAsset}
              onSelectAsset={setSelectedAsset}
              onRequestCreateCustomAsset={(rawQuery) => {
                setCustomTickerInitial(rawQuery);
                setIsCustomModalOpen(true);
              }}
              error={state.fieldErrors?.assetId?.[0]}
            />

            {/* Indicação de Posição Disponível para Venda ou Ajuste de Saída */}
            {(transactionType === 'SELL' || (transactionType === 'MANUAL_ADJUSTMENT' && direction === 'OUT')) && availableQty !== null && (
              <div
                id="available-position-badge"
                className="bg-action-primary/10 border border-action-primary/30 rounded-lg px-3 py-2 flex items-center justify-between text-xs"
              >
                <span className="text-text-secondary">Posição disponível em custódia:</span>
                <span
                  id="available-position-value"
                  className="font-mono tabular-nums font-bold text-action-primary"
                >
                  {isAvailablePositive ? availableQty : '0.0000000000'}
                </span>
              </div>
            )}

            {/* Datas: Negociação e Liquidação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="transaction-trade-date"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Data do Negócio <span className="text-negative-text">*</span>
                </label>
                <input
                  id="transaction-trade-date"
                  name="tradeDate"
                  type="date"
                  required
                  defaultValue={todayStr}
                  max={todayStr}
                  aria-describedby={
                    state.fieldErrors?.tradeDate
                      ? 'transaction-trade-date-error'
                      : undefined
                  }
                  className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
                />
                {state.fieldErrors?.tradeDate && (
                  <p
                    id="transaction-trade-date-error"
                    className="text-negative-text text-xs mt-1"
                  >
                    {state.fieldErrors.tradeDate[0]}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="transaction-settlement-date"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Data de Liquidação
                </label>
                <input
                  id="transaction-settlement-date"
                  name="settlementDate"
                  type="date"
                  aria-describedby={
                    state.fieldErrors?.settlementDate
                      ? 'transaction-settlement-date-error'
                      : undefined
                  }
                  className="w-full bg-background border border-border-theme rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
                />
                {state.fieldErrors?.settlementDate && (
                  <p
                    id="transaction-settlement-date-error"
                    className="text-negative-text text-xs mt-1"
                  >
                    {state.fieldErrors.settlementDate[0]}
                  </p>
                )}
              </div>
            </div>

            {/* Quantidade e Preço Unitário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="transaction-quantity"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Quantidade <span className="text-negative-text">*</span>
                </label>
                <input
                  id="transaction-quantity"
                  name="quantity"
                  type="text"
                  required
                  placeholder="Ex: 100 ou 0.005432"
                  aria-describedby={
                    state.fieldErrors?.quantity
                      ? 'transaction-quantity-error'
                      : undefined
                  }
                  className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2 text-text-primary placeholder:text-text-secondary/60 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
                />
                {state.fieldErrors?.quantity && (
                  <p
                    id="transaction-quantity-error"
                    className="text-negative-text text-xs mt-1"
                  >
                    {state.fieldErrors.quantity[0]}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="transaction-unit-price"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Preço Unitário <span className="text-negative-text">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-text-secondary text-sm">
                    {selectedAsset?.currency || 'R$'}
                  </span>
                  <input
                    id="transaction-unit-price"
                    name="unitPrice"
                    type="text"
                    required
                    placeholder="0.00"
                    aria-describedby={
                      state.fieldErrors?.unitPrice
                        ? 'transaction-unit-price-error'
                        : undefined
                    }
                    className="w-full bg-background border border-border-theme rounded-lg pl-10 pr-3.5 py-2 text-text-primary placeholder:text-text-secondary/60 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
                  />
                </div>
                {state.fieldErrors?.unitPrice && (
                  <p
                    id="transaction-unit-price-error"
                    className="text-negative-text text-xs mt-1"
                  >
                    {state.fieldErrors.unitPrice[0]}
                  </p>
                )}
              </div>
            </div>

            {/* Taxas Operacionais */}
            <div>
              <label
                htmlFor="transaction-fees"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Taxas / Corretagem / Emolumentos
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-text-secondary text-sm">
                  {selectedAsset?.currency || 'R$'}
                </span>
                <input
                  id="transaction-fees"
                  name="fees"
                  type="text"
                  defaultValue="0.00"
                  placeholder="0.00"
                  aria-describedby={
                    state.fieldErrors?.fees ? 'transaction-fees-error' : undefined
                  }
                  className="w-full bg-background border border-border-theme rounded-lg pl-10 pr-3.5 py-2 text-text-primary placeholder:text-text-secondary/60 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
                />
              </div>
              {state.fieldErrors?.fees && (
                <p
                  id="transaction-fees-error"
                  className="text-negative-text text-xs mt-1"
                >
                  {state.fieldErrors.fees[0]}
                </p>
              )}
            </div>

            {/* Notas / Observações */}
            <div>
              <label
                htmlFor="transaction-notes"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Observações / Estratégia (opcional)
              </label>
              <textarea
                id="transaction-notes"
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Anotações sobre a operação..."
                className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
              <button
                id="transaction-cancel-btn"
                type="button"
                onClick={onClose}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancelar
              </button>
              <button
                id="transaction-submit"
                type="submit"
                disabled={pending}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 disabled:opacity-50 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
              >
                {pending ? 'Salvando...' : 'Salvar Operação'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal Desacoplado de Criação de Ativo Customizado (Renderizado como Irmão) */}
      <CustomAssetModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        initialTicker={customTickerInitial}
        onAssetCreated={(newAsset) => {
          setSelectedAsset(newAsset);
          setIsCustomModalOpen(false);
        }}
      />
    </>
  );
}
