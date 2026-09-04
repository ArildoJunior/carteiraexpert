'use client';

import { useState } from 'react';
import type { SerializedCustodyInstitution } from '../domain/custody.types';
import { createCustodyAccountAction } from '../server/custody.actions';

interface CustodyAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  institutions: SerializedCustodyInstitution[];
  onSuccess?: () => void;
}

export function CustodyAccountModal({
  isOpen,
  onClose,
  portfolioId,
  institutions,
  onSuccess,
}: CustodyAccountModalProps) {
  const [institutionId, setInstitutionId] = useState('');
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleInstitutionChange(id: string) {
    setInstitutionId(id);
    const inst = institutions.find((i) => i.id === id);
    if (inst && (!name || institutions.some((i) => name.includes(i.name)))) {
      setName(`Conta ${inst.name}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institutionId) {
      setError('Selecione uma instituição financeira ou corretora.');
      return;
    }
    if (!name.trim()) {
      setError('Informe um nome para a conta de custódia.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const res = await createCustodyAccountAction({
        portfolioId,
        institutionId,
        name: name.trim(),
        accountNumber: accountNumber.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error);
      } else {
        setName('');
        setAccountNumber('');
        setInstitutionId('');
        onClose();
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch {
      setError('Falha inesperada ao criar a conta de custódia.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="custody-account-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        className="bg-surface border border-border-theme rounded-2xl p-6 w-full max-w-md shadow-xl space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custody-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <div>
            <h3
              id="custody-modal-title"
              className="text-base font-bold text-text-primary"
            >
              Nova Conta de Custódia
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Vincule uma corretora ou instituição à sua carteira
            </p>
          </div>
          <button
            id="btn-close-custody-modal"
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            id="custody-modal-error-alert"
            className="p-3 bg-action-destructive/10 border border-action-destructive/20 text-action-destructive text-xs rounded-xl"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Instituição / Corretora */}
          <div className="space-y-1.5">
            <label
              htmlFor="custody-institution-select"
              className="block text-xs font-semibold text-text-secondary"
            >
              Instituição Financeira / Corretora *
            </label>
            <select
              id="custody-institution-select"
              value={institutionId}
              onChange={(e) => handleInstitutionChange(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border-theme text-sm text-text-primary focus:outline-hidden focus:ring-2 focus:ring-action-primary/30"
            >
              <option value="">Selecione a corretora ou banco...</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.country})
                </option>
              ))}
            </select>
          </div>

          {/* Nome da Conta */}
          <div className="space-y-1.5">
            <label
              htmlFor="custody-account-name-input"
              className="block text-xs font-semibold text-text-secondary"
            >
              Nome / Apelido da Conta *
            </label>
            <input
              id="custody-account-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: XP Principal, NuInvest Ações"
              maxLength={100}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border-theme text-sm text-text-primary focus:outline-hidden focus:ring-2 focus:ring-action-primary/30"
            />
          </div>

          {/* Identificador / Número da Conta */}
          <div className="space-y-1.5">
            <label
              htmlFor="custody-account-number-input"
              className="block text-xs font-semibold text-text-secondary"
            >
              Número ou Código da Conta <span className="text-text-tertiary font-normal">(opcional)</span>
            </label>
            <input
              id="custody-account-number-input"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Ex: 12345-6 ou ***789"
              maxLength={50}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border-theme text-sm text-text-primary focus:outline-hidden focus:ring-2 focus:ring-action-primary/30 font-mono"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-submit-custody-account"
              type="submit"
              disabled={pending}
              className="px-5 py-2.5 rounded-xl bg-action-primary hover:bg-action-primary/90 text-text-primary text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {pending ? 'Salvando...' : 'Salvar Conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
