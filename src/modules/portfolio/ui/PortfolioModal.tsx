'use client';

import { useState, useEffect } from 'react';
import {
  createPortfolioAction,
  updatePortfolioAction,
  type ActionResult,
} from '../server/portfolio.actions';
import type { Portfolio, PortfolioPurpose } from '../domain/portfolio.types';

interface PortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioToEdit?: Portfolio | null;
  hasExistingRealPortfolio?: boolean;
  onSuccess?: () => void;
}

export function PortfolioModal({
  isOpen,
  onClose,
  portfolioToEdit,
  hasExistingRealPortfolio = false,
  onSuccess,
}: PortfolioModalProps) {
  const isEditing = Boolean(portfolioToEdit);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [status, setStatus] = useState<'active' | 'archived' | ''>('active');
  const [purpose, setPurpose] = useState<PortfolioPurpose>('REAL');
  const [confirmPurposeChange, setConfirmPurposeChange] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<Portfolio>>({ success: false });

  useEffect(() => {
    if (portfolioToEdit) {
      setName(portfolioToEdit.name || '');
      setDescription(portfolioToEdit.description || '');
      setBaseCurrency(portfolioToEdit.baseCurrency || 'BRL');
      setPurpose((portfolioToEdit.purpose as PortfolioPurpose) || 'REAL');
      if (portfolioToEdit.status === 'frozen') {
        setStatus('');
      } else {
        setStatus((portfolioToEdit.status as 'active' | 'archived') || 'active');
      }
    } else {
      setName('');
      setDescription('');
      setBaseCurrency('BRL');
      setStatus('active');
      setPurpose(hasExistingRealPortfolio ? 'ESTUDO' : 'REAL');
    }
    setConfirmPurposeChange(false);
    setState({ success: false });
  }, [portfolioToEdit, isOpen, hasExistingRealPortfolio]);

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
        formData.set('purpose', purpose);
        formData.set('confirmPurposeChange', confirmPurposeChange ? 'true' : 'false');
        if (status === 'active' || status === 'archived') {
          formData.set('status', status);
        }
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
        formData.set('purpose', purpose);
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
      <div className="bg-surface border border-border-theme rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-theme">
          <h2
            id="portfolio-modal-title"
            className="text-lg font-semibold text-text-primary"
          >
            {isEditing ? 'Editar Carteira' : 'Nova Carteira'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-border-theme/40 transition-colors"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Mensagem de Erro Geral */}
          {state.error && (
            <div
              id="portfolio-form-error"
              className="p-3 bg-negative-background/20 border border-negative-border rounded-lg text-negative-text text-sm"
              role="alert"
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

          {/* Finalidade da Carteira */}
          <div>
            <label
              htmlFor="portfolio-purpose"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Finalidade da Carteira <span className="text-negative-text">*</span>
            </label>
            <select
              id="portfolio-purpose"
              name="purpose"
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value as PortfolioPurpose);
                setConfirmPurposeChange(false);
              }}
              className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
            >
              <option
                value="REAL"
                disabled={!isEditing && hasExistingRealPortfolio}
              >
                Patrimônio Real {!isEditing && hasExistingRealPortfolio ? '(Você já possui uma carteira Real)' : '— Oficial para consolidação'}
              </option>
              <option value="ESTUDO">Estudo — Ambiente simulado / educacional</option>
              <option value="ANALISE">Análise — Teses e modelagens hipotéticas</option>
            </select>
            {state.fieldErrors?.purpose && (
              <p
                id="portfolio-purpose-error"
                className="text-negative-text text-xs mt-1"
              >
                {state.fieldErrors.purpose[0]}
              </p>
            )}
            <p className="text-[11px] text-text-secondary mt-1">
              {purpose === 'REAL'
                ? 'Representa o patrimônio real consolidado da sua conta (máximo de 1 por usuário).'
                : 'Carteira hipotética. Não compõe seu patrimônio real nem relatórios fiscais.'}
            </p>
          </div>

          {/* Aviso e Confirmação de Mudança de Finalidade REAL -> ESTUDO/ANALISE */}
          {isEditing && portfolioToEdit?.purpose === 'REAL' && purpose !== 'REAL' && (
            <div
              id="confirm-purpose-change-box"
              className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2 text-xs text-amber-900 dark:text-amber-200"
            >
              <p className="font-semibold">⚠️ Alteração de Finalidade Patrimonial</p>
              <p>
                Você está alterando esta carteira de <strong>Patrimônio Real</strong> para{' '}
                <strong>{purpose === 'ESTUDO' ? 'Estudo' : 'Análise'}</strong>. Você ficará sem uma
                carteira de patrimônio real ativa até criar uma nova ou reverter esta alteração.
              </p>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-text-primary pt-1">
                <input
                  id="confirm-purpose-change"
                  type="checkbox"
                  checked={confirmPurposeChange}
                  onChange={(e) => setConfirmPurposeChange(e.target.checked)}
                  className="rounded border-border-theme text-action-primary focus:ring-action-primary"
                />
                <span>Confirmo a alteração da finalidade</span>
              </label>
            </div>
          )}

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
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivos, estratégia ou notas da carteira..."
              className="w-full bg-background border border-border-theme rounded-lg px-3.5 py-2 text-text-primary placeholder:text-text-secondary/60 text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all resize-none"
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
                  setStatus(e.target.value as 'active' | 'archived' | '')
                }
                className="w-full bg-background border border-border-theme rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-transparent transition-all"
              >
                {portfolioToEdit?.status === 'frozen' && (
                  <option value="" disabled>
                    Congelada (Somente Leitura)
                  </option>
                )}
                <option value="active">
                  {portfolioToEdit?.status === 'frozen' ? 'Reativar (Ativa)' : 'Ativa'}
                </option>
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
