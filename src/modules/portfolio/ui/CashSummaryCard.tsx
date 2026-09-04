'use client';

import { useState } from 'react';
import type { SerializedCashAccount, SerializedCashSummary } from '../domain/cash.types';
import { Decimal } from '@/lib/decimal';

interface CashSummaryCardProps {
  portfolioId: string;
  cashSummary: SerializedCashSummary;
  portfolioStatus: string;
  onOpenDeposit: (accountId?: string) => void;
  onOpenWithdraw: (accountId?: string) => void;
  onOpenNewAccount: () => void;
}

function formatMoney(value: string | Decimal, currency = 'BRL'): string {
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

export function CashSummaryCard({
  cashSummary,
  portfolioStatus,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenNewAccount,
}: CashSummaryCardProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    cashSummary.accounts[0]?.id || ''
  );

  const isReadOnly = portfolioStatus === 'archived' || portfolioStatus === 'frozen';
  const selectedAccount =
    cashSummary.accounts.find((a) => a.id === selectedAccountId) ||
    cashSummary.accounts[0];

  return (
    <div
      id="portfolio-cash-summary-card"
      className="bg-surface border border-border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-theme/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-action-primary/10 text-action-primary flex items-center justify-center font-bold text-base">
            💵
          </div>
          <div>
            <h3 className="font-bold text-text-primary text-base tracking-tight">
              Recursos em Caixa
            </h3>
            <p className="text-xs text-text-secondary">
              Saldo não investido e movimentações em conta corrente
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!isReadOnly && (
            <>
              <button
                id="btn-deposit-cash"
                type="button"
                onClick={() => onOpenDeposit(selectedAccount?.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-action-primary-text bg-action-primary hover:bg-action-primary-hover active:scale-[0.98] rounded-xl shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
              >
                <span>+</span> Depositar
              </button>
              <button
                id="btn-withdraw-cash"
                type="button"
                onClick={() => onOpenWithdraw(selectedAccount?.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-text-primary bg-surface-elevated border border-border-theme hover:bg-surface-elevated/80 active:scale-[0.98] rounded-xl shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
              >
                <span>-</span> Retirar
              </button>
              <button
                id="btn-new-cash-account"
                type="button"
                onClick={onOpenNewAccount}
                title="Adicionar nova conta de caixa"
                className="px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface border border-border-theme hover:bg-surface-elevated rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
              >
                + Nova Conta
              </button>
            </>
          )}
          {isReadOnly && (
            <span className="text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme px-2.5 py-1 rounded-lg">
              {portfolioStatus === 'frozen' ? 'Carteira Congelada' : 'Carteira Arquivada'}
            </span>
          )}
        </div>
      </div>

      {/* Seletor de Contas de Caixa se houver mais de uma */}
      {cashSummary.accounts.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-text-secondary font-semibold shrink-0">Contas:</span>
          <div className="flex gap-1.5">
            {cashSummary.accounts.map((acc) => (
              <button
                key={acc.id}
                id={`btn-cash-account-tab-${acc.id}`}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all border shrink-0 ${
                  (selectedAccount?.id === acc.id)
                    ? 'bg-action-primary text-action-primary-text border-action-primary shadow-xs'
                    : 'bg-surface text-text-secondary border-border-theme hover:bg-surface-elevated'
                }`}
              >
                {acc.name} ({acc.currency})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Métricas de Saldo */}
      {selectedAccount ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface-elevated border border-border-theme/70 rounded-xl p-3.5 space-y-1">
            <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">
              Saldo Disponível ({selectedAccount.name})
            </p>
            <p
              id="cash-account-balance"
              className="text-xl font-bold font-mono tabular-nums text-text-primary"
            >
              {formatMoney(selectedAccount.balance, selectedAccount.currency)}
            </p>
            <p className="text-[11px] text-text-secondary">
              Pronto para alocação e compras
            </p>
          </div>

          <div className="bg-surface-elevated border border-border-theme/70 rounded-xl p-3.5 space-y-1">
            <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">
              Total Depositado
            </p>
            <p
              id="cash-account-total-deposits"
              className="text-lg font-bold font-mono tabular-nums text-positive-text"
            >
              +{formatMoney(selectedAccount.totalDeposits, selectedAccount.currency)}
            </p>
            <p className="text-[11px] text-text-secondary">
              Aportes acumulados na conta
            </p>
          </div>

          <div className="bg-surface-elevated border border-border-theme/70 rounded-xl p-3.5 space-y-1">
            <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">
              Total Retirado
            </p>
            <p
              id="cash-account-total-withdrawals"
              className="text-lg font-bold font-mono tabular-nums text-text-secondary"
            >
              -{formatMoney(selectedAccount.totalWithdrawals, selectedAccount.currency)}
            </p>
            <p className="text-[11px] text-text-secondary">
              Saques e retiradas acumulados
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-text-secondary">
          Nenhuma conta de caixa cadastrada nesta carteira.
        </div>
      )}
    </div>
  );
}
