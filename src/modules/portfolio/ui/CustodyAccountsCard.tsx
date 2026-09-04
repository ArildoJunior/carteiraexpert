'use client';

import { useState } from 'react';
import type { SerializedCustodyAccount } from '../domain/custody.types';
import { archiveCustodyAccountAction } from '../server/custody.actions';

interface CustodyAccountsCardProps {
  accounts: SerializedCustodyAccount[];
  portfolioId: string;
  onOpenNewAccount: () => void;
  onRefresh?: () => void;
}

export function CustodyAccountsCard({
  accounts,
  portfolioId,
  onOpenNewAccount,
  onRefresh,
}: CustodyAccountsCardProps) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const archivedAccounts = accounts.filter((a) => a.status === 'archived');

  async function handleArchive(id: string) {
    if (!window.confirm('Tem certeza que deseja arquivar esta conta de custódia?')) {
      return;
    }

    setArchivingId(id);
    setError(null);

    try {
      const res = await archiveCustodyAccountAction(id, portfolioId);
      if (!res.success) {
        setError(res.error);
      } else if (onRefresh) {
        onRefresh();
      }
    } catch {
      setError('Erro ao arquivar a conta de custódia.');
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div
      id="custody-accounts-card"
      className="bg-surface border border-border-theme rounded-2xl p-6 shadow-sm space-y-6"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Instituições de Custódia e Corretoras
            </h2>
            <span
              id="custody-accounts-badge-count"
              className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-action-primary/10 text-action-primary border border-action-primary/20"
            >
              {activeAccounts.length} {activeAccounts.length === 1 ? 'conta' : 'contas'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Vincule suas corretoras e contas de custódia para organizar a origem e custódia dos ativos.
          </p>
        </div>

        <button
          id="btn-new-custody-account"
          type="button"
          onClick={onOpenNewAccount}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-action-primary hover:bg-action-primary/90 text-text-primary text-xs font-semibold shadow-sm transition-all cursor-pointer shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Adicionar Corretora
        </button>
      </div>

      {error && (
        <div
          id="custody-accounts-error-alert"
          className="p-3 bg-action-destructive/10 border border-action-destructive/20 text-action-destructive text-xs rounded-xl"
        >
          {error}
        </div>
      )}

      {/* Lista de Contas */}
      {accounts.length === 0 ? (
        <div
          id="empty-custody-accounts-state"
          className="py-10 text-center border border-dashed border-border-theme rounded-xl space-y-3"
        >
          <div className="w-12 h-12 rounded-xl bg-surface-secondary flex items-center justify-center mx-auto text-text-secondary">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Nenhuma conta de custódia vinculada
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Cadastre suas contas na XP, BTG, Inter, NuInvest ou outras instituições para associar aos lançamentos.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewAccount}
            className="inline-flex items-center gap-1.5 text-xs text-action-primary hover:underline font-semibold"
          >
            Cadastrar primeira corretora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {activeAccounts.map((account) => (
            <div
              key={account.id}
              className="p-4 rounded-xl bg-surface-secondary border border-border-theme flex flex-col justify-between space-y-3 relative group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-surface text-text-secondary border border-border-theme">
                    {account.institution?.name ?? 'Instituição'}
                  </span>
                  <h4 className="text-sm font-semibold text-text-primary pt-1">
                    {account.name}
                  </h4>
                  {account.accountNumber ? (
                    <p className="text-xs font-mono text-text-secondary">
                      Conta: {account.accountNumber}
                    </p>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">
                      Identificador não informado
                    </p>
                  )}
                </div>

                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Ativa
                </span>
              </div>

              <div className="pt-2 border-t border-border-theme flex items-center justify-between text-xs">
                <span className="text-[10px] text-text-secondary">
                  Código: {account.institution?.code ?? 'N/A'}
                </span>
                <button
                  type="button"
                  disabled={archivingId === account.id}
                  onClick={() => handleArchive(account.id)}
                  className="text-[11px] text-text-secondary hover:text-action-destructive transition-colors disabled:opacity-50"
                  title="Arquivar esta conta de custódia"
                >
                  {archivingId === account.id ? 'Arquivando...' : 'Arquivar'}
                </button>
              </div>
            </div>
          ))}

          {archivedAccounts.map((account) => (
            <div
              key={account.id}
              className="p-4 rounded-xl bg-surface-secondary/50 border border-border-theme/60 opacity-60 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-surface text-text-secondary border border-border-theme">
                    {account.institution?.name ?? 'Instituição'}
                  </span>
                  <h4 className="text-sm font-medium text-text-primary line-through pt-1">
                    {account.name}
                  </h4>
                  {account.accountNumber && (
                    <p className="text-xs font-mono text-text-secondary">
                      Conta: {account.accountNumber}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                  Arquivada
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
