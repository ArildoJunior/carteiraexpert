'use client';

import { useState, useEffect } from 'react';
import {
  createCustomAssetAction,
  type ActionResult,
} from '../server/portfolio.actions';
import type { Asset } from '../domain/asset.types';

interface CustomAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTicker?: string;
  onAssetCreated?: (asset: Asset) => void;
}

export function CustomAssetModal({
  isOpen,
  onClose,
  initialTicker = '',
  onAssetCreated,
}: CustomAssetModalProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<Asset>>({ success: false });

  useEffect(() => {
    if (isOpen) {
      setTicker(initialTicker ? initialTicker.trim().toUpperCase() : '');
      setName('');
      setState({ success: false });
    }
  }, [isOpen, initialTicker]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      formData.set('ticker', ticker.trim().toUpperCase());
      formData.set('name', name.trim());
      formData.set('currency', currency);

      const res = await createCustomAssetAction(null, formData);
      setState(res);

      if (res.success && res.data) {
        onAssetCreated?.(res.data);
        onClose();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao cadastrar ativo customizado.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="custom-asset-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-asset-modal-title"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2
            id="custom-asset-modal-title"
            className="text-lg font-semibold text-white"
          >
            Cadastrar Ativo Customizado
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
              id="custom-asset-error-alert"
              role="alert"
              className="bg-red-950/60 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
            >
              {state.error}
            </div>
          )}

          {/* Ticker */}
          <div>
            <label
              htmlFor="custom-asset-ticker"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Código / Ticker <span className="text-red-400">*</span>
            </label>
            <input
              id="custom-asset-ticker"
              name="ticker"
              type="text"
              required
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Ex: IMOB-XYZ, NOTA-1, MEUATIVO..."
              aria-describedby={
                state.fieldErrors?.ticker
                  ? 'custom-asset-ticker-error'
                  : undefined
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase"
            />
            {state.fieldErrors?.ticker && (
              <p
                id="custom-asset-ticker-error"
                className="text-red-400 text-xs mt-1"
              >
                {state.fieldErrors.ticker[0]}
              </p>
            )}
          </div>

          {/* Nome */}
          <div>
            <label
              htmlFor="custom-asset-name"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Nome / Razão Social <span className="text-red-400">*</span>
            </label>
            <input
              id="custom-asset-name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fundo Imobiliário Privado XPTO"
              aria-describedby={
                state.fieldErrors?.name ? 'custom-asset-name-error' : undefined
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
            {state.fieldErrors?.name && (
              <p
                id="custom-asset-name-error"
                className="text-red-400 text-xs mt-1"
              >
                {state.fieldErrors.name[0]}
              </p>
            )}
          </div>

          {/* Moeda */}
          <div>
            <label
              htmlFor="custom-asset-currency"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Moeda Principal <span className="text-red-400">*</span>
            </label>
            <select
              id="custom-asset-currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-describedby={
                state.fieldErrors?.currency
                  ? 'custom-asset-currency-error'
                  : undefined
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            >
              <option value="BRL">BRL (R$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
            {state.fieldErrors?.currency && (
              <p
                id="custom-asset-currency-error"
                className="text-red-400 text-xs mt-1"
              >
                {state.fieldErrors.currency[0]}
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              id="custom-asset-cancel-btn"
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              id="custom-asset-submit"
              type="submit"
              disabled={pending}
              className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-950"
            >
              {pending ? 'Cadastrando...' : 'Cadastrar Ativo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
