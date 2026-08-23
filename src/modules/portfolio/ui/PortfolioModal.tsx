'use client';

import { useState, useEffect } from 'react';
import {
  createPortfolioAction,
  updatePortfolioAction,
  type ActionResult,
} from '../server/portfolio.actions';
import type { Portfolio } from '../domain/portfolio.types';

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioToEdit?: Portfolio | null;
  onSuccess?: () => void;
}

export function PortfolioModal({
  isOpen,
  onClose,
  portfolioToEdit,
  onSuccess,
}: PortfolioModalProps) {
  const isEditing = Boolean(portfolioToEdit);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<Portfolio>>({ success: false });

  useEffect(() => {
    if (portfolioToEdit) {
      setName(portfolioToEdit.name || '');
      setDescription(portfolioToEdit.description || '');
      setBaseCurrency(portfolioToEdit.baseCurrency || 'BRL');
      setStatus((portfolioToEdit.status as 'active' | 'archived') || 'active');
    } else {
      setName('');
      setDescription('');
      setBaseCurrency('BRL');
      setStatus('active');
    }
    setState({ success: false });
  }, [portfolioToEdit, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      if (isEditing && portfolioToEdit) {
        formData.set('id', portfolioToEdit.id);
        formData.set('name', name);
        formData.set('description', description);
        formData.set('status', status);
        const res = await updatePortfolioAction(null, formData);
        setState(res);
        if (res.success) {
          onSuccess?.();
          onClose();
        }
      } else {
        formData.set('name', name);
        formData.set('description', description);
        formData.set('baseCurrency', baseCurrency);
        const res = await createPortfolioAction(null, formData);
        setState(res);
        if (res.success) {
          onSuccess?.();
          onClose();
        }
      }
    } catch {
      setState({
        success: false,
        error: isEditing
          ? 'Falha ao atualizar carteira.'
          : 'Falha ao criar carteira.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portfolio-modal-title"
    >
      <div className="relative w-full max-w-md bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-5 text-text-primary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <h2
            id="portfolio-modal-title"
            className="text-lg font-semibold text-text-primary"
          >
            {isEditing ? 'Editar Carteira' : 'Nova Carteira'}
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
              id="portfolio-error-alert"
              role="alert"
              className="bg-negative-text/10 border border-negative-text/30 text-negative-text text-sm rounded-lg px-4 py-3"
            >
              {state.error}
            </div>
          )}

          {/* Nome */}
          <div>
            <label
              htmlFor="portfolio-name"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Nome da Carteira <span className="text-negative-text">*</span>
            </label>
            <input
              id="portfolio-name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Carteira Principal, Dividendos, Internacional..."
              aria-describedby={
                state.fieldErrors?.name ? 'portfolio-name-error' : undefined
              }
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
            />
            {state.fieldErrors?.name && (
              <p
                id="portfolio-name-error"
                className="text-negative-text text-xs mt-1"
              >
                {state.fieldErrors.name[0]}
              </p>
            )}
          </div>

          {/* Descrição */}
          <div>
            <label
              htmlFor="portfolio-description"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Descrição (opcional)
            </label>
            <textarea
              id="portfolio-description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivos, estratégia ou notas da carteira..."
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2.5 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Moeda Base (somente na criação) */}
          {!isEditing ? (
            <div>
              <label
                htmlFor="portfolio-base-currency"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Moeda Base
              </label>
              <select
                id="portfolio-base-currency"
                name="baseCurrency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
              >
                <option value="BRL">BRL (R$ - Real Brasileiro)</option>
                <option value="USD">USD ($ - Dólar Americano)</option>
                <option value="EUR">EUR (€ - Euro)</option>
              </select>
            </div>
          ) : (
            <div>
              <label
                htmlFor="portfolio-status"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Status da Carteira
              </label>
              <select
                id="portfolio-status"
                name="status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'active' | 'archived')
                }
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
              >
                <option value="active">Ativa</option>
                <option value="archived">Arquivada</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary bg-surface hover:bg-border-theme/40 rounded-lg transition-colors border border-border-theme"
            >
              Cancelar
            </button>
            <button
              id="portfolio-submit"
              type="submit"
              disabled={pending}
              className="px-5 py-2 text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
            >
              {pending
                ? isEditing
                  ? 'Salvando...'
                  : 'Criando...'
                : isEditing
                  ? 'Salvar Alterações'
                  : 'Criar Carteira'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
