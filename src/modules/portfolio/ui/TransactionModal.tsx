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
}

export function TransactionModal({
  isOpen,
  onClose,
  portfolioId,
  onSuccess,
}: TransactionModalProps) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [availableQty, setAvailableQty] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<PortfolioEvent>>({ success: false });

  // Estado para abertura do modal de cadastro de ativo customizado
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customTickerInitial, setCustomTickerInitial] = useState('');

  // Formata a data atual para YYYY-MM-DD (padrão do input date)
  const todayStr = new Date().toISOString().split('T')[0];

  // Busca posição disponível quando seleciona ativo em modo VENDA com proteção contra estado obsoleto
  useEffect(() => {
    // 1. Limpa imediatamente a posição disponível para não exibir dados do ativo anterior
    setAvailableQty(null);

    let active = true;

    async function fetchAvailable() {
      if (selectedAsset && transactionType === 'SELL') {
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
  }, [selectedAsset, transactionType, portfolioId]);

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
        <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2
              id="transaction-modal-title"
              className="text-lg font-semibold text-white"
            >
              Registrar Nova Operação
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
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
                className="bg-red-950/60 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
              >
                {state.error}
              </div>
            )}

            {/* Seletor Tipo: Compra / Venda */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Tipo de Operação <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="transaction-type-buy"
                  type="button"
                  onClick={() => setTransactionType('BUY')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                    transactionType === 'BUY'
                      ? 'bg-emerald-950/70 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>🟢</span> Compra (BUY)
                </button>
                <button
                  id="transaction-type-sell"
                  type="button"
                  onClick={() => setTransactionType('SELL')}
                  className={`py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                    transactionType === 'SELL'
                      ? 'bg-blue-950/70 border-blue-500 text-blue-400 ring-2 ring-blue-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>🔵</span> Venda (SELL)
                </button>
              </div>
            </div>

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

            {/* Indicação de Posição Disponível para Venda */}
            {transactionType === 'SELL' && availableQty !== null && (
              <div
                id="available-position-badge"
                className="bg-blue-950/40 border border-blue-800/60 rounded-lg px-3 py-2 flex items-center justify-between text-xs"
              >
                <span className="text-slate-400">Posição disponível em custódia:</span>
                <span
                  id="available-position-value"
                  className="font-mono font-bold text-blue-400"
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
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Data do Negócio <span className="text-red-400">*</span>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {state.fieldErrors?.tradeDate && (
                  <p
                    id="transaction-trade-date-error"
                    className="text-red-400 text-xs mt-1"
                  >
                    {state.fieldErrors.tradeDate[0]}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="transaction-settlement-date"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {state.fieldErrors?.settlementDate && (
                  <p
                    id="transaction-settlement-date-error"
                    className="text-red-400 text-xs mt-1"
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
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Quantidade <span className="text-red-400">*</span>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                {state.fieldErrors?.quantity && (
                  <p
                    id="transaction-quantity-error"
                    className="text-red-400 text-xs mt-1"
                  >
                    {state.fieldErrors.quantity[0]}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="transaction-unit-price"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Preço Unitário <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 text-sm">
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3.5 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
                {state.fieldErrors?.unitPrice && (
                  <p
                    id="transaction-unit-price-error"
                    className="text-red-400 text-xs mt-1"
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
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Taxas / Corretagem / Emolumentos
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 text-sm">
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3.5 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              {state.fieldErrors?.fees && (
                <p
                  id="transaction-fees-error"
                  className="text-red-400 text-xs mt-1"
                >
                  {state.fieldErrors.fees[0]}
                </p>
              )}
            </div>

            {/* Notas / Observações */}
            <div>
              <label
                htmlFor="transaction-notes"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Observações / Estratégia (opcional)
              </label>
              <textarea
                id="transaction-notes"
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Anotações sobre a operação..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                id="transaction-cancel-btn"
                type="button"
                onClick={onClose}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                id="transaction-submit"
                type="submit"
                disabled={pending}
                className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-950"
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
