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
      <div className="relative w-full max-w-md bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-5 text-text-primary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <h2
            id="custom-asset-modal-title"
            className="text-lg font-semibold text-text-primary"
          >
            Cadastrar Ativo Customizado
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
              id="custom-asset-error-alert"
              role="alert"
              className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
            >
              {state.error}
            </div>
          )}

          {/* Ticker */}
          <div>
            <label
              htmlFor="custom-asset-ticker"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Código / Ticker <span className="text-negative-text">*</span>
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
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all uppercase"
            />
            {state.fieldErrors?.ticker && (
              <p
                id="custom-asset-ticker-error"
                className="text-negative-text text-xs mt-1"
              >
                {state.fieldErrors.ticker[0]}
              </p>
            )}
          </div>

          {/* Nome */}
          <div>
            <label
              htmlFor="custom-asset-name"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Nome / Razão Social <span className="text-negative-text">*</span>
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
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
            />
            {state.fieldErrors?.name && (
              <p
                id="custom-asset-name-error"
                className="text-negative-text text-xs mt-1"
              >
                {state.fieldErrors.name[0]}
              </p>
            )}
          </div>

          {/* Moeda */}
          <div>
            <label
              htmlFor="custom-asset-currency"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Moeda Principal <span className="text-negative-text">*</span>
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
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
            >
              <option value="BRL">BRL (R$)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
            {state.fieldErrors?.currency && (
              <p
                id="custom-asset-currency-error"
                className="text-negative-text text-xs mt-1"
              >
                {state.fieldErrors.currency[0]}
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
            <button
              id="custom-asset-cancel-btn"
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancelar
            </button>
            <button
              id="custom-asset-submit"
              type="submit"
              disabled={pending}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 disabled:opacity-50 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
            >
              {pending ? 'Cadastrando...' : 'Cadastrar Ativo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
