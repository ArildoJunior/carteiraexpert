'use client';

import { useState } from 'react';
import type { SerializedCashAccount } from '../domain/cash.types';
import {
  depositCashAction,
  withdrawCashAction,
  createCashAccountAction,
} from '../server/cash.actions';
import { Decimal } from '@/lib/decimal';

interface CashTransactionModalProps {
  portfolioId: string;
  accounts: SerializedCashAccount[];
  initialAccountId?: string;
  initialMode?: 'DEPOSIT' | 'WITHDRAWAL' | 'NEW_ACCOUNT';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CashTransactionModal({
  portfolioId,
  accounts,
  initialAccountId,
  initialMode = 'DEPOSIT',
  isOpen,
  onClose,
  onSuccess,
}: CashTransactionModalProps) {
  const [mode, setMode] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'NEW_ACCOUNT'>(initialMode);
  const [accountId, setAccountId] = useState<string>(
    initialAccountId || accounts[0]?.id || ''
  );
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountCurrency, setNewAccountCurrency] = useState<'BRL' | 'USD' | 'EUR'>('BRL');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedAccount = accounts.find((a) => a.id === accountId) || accounts[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'NEW_ACCOUNT') {
        if (!newAccountName.trim()) {
          setError('O nome da conta é obrigatório.');
          setIsLoading(false);
          return;
        }

        const res = await createCashAccountAction({
          portfolioId,
          name: newAccountName.trim(),
          currency: newAccountCurrency,
        });

        if (!res.success) {
          setError(res.error);
          setIsLoading(false);
          return;
        }

        onSuccess();
        onClose();
        return;
      }

      if (!selectedAccount) {
        setError('Nenhuma conta de caixa selecionada.');
        setIsLoading(false);
        return;
      }

      if (!amount || Number(amount) <= 0) {
        setError('Informe um valor monetário positivo maior que zero.');
        setIsLoading(false);
        return;
      }

      if (mode === 'WITHDRAWAL') {
        const available = new Decimal(selectedAccount.balance);
        const requested = new Decimal(amount);
        if (requested.greaterThan(available)) {
          setError(
            `Saldo insuficiente. Disponível para retirada: ${selectedAccount.currency} ${available.toFixed(2)}.`
          );
          setIsLoading(false);
          return;
        }

        const res = await withdrawCashAction(
          {
            cashAccountId: selectedAccount.id,
            type: 'WITHDRAWAL',
            amount: requested.toFixed(8),
            transactionDate: new Date(transactionDate + 'T12:00:00Z'),
            description: description.trim() || null,
          },
          portfolioId
        );

        if (!res.success) {
          setError(res.error);
          setIsLoading(false);
          return;
        }
      } else {
        const res = await depositCashAction(
          {
            cashAccountId: selectedAccount.id,
            type: 'DEPOSIT',
            amount: new Decimal(amount).toFixed(8),
            transactionDate: new Date(transactionDate + 'T12:00:00Z'),
            description: description.trim() || null,
          },
          portfolioId
        );

        if (!res.success) {
          setError(res.error);
          setIsLoading(false);
          return;
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado na operação.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      id="cash-transaction-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border-theme rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border-theme/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {mode === 'DEPOSIT' ? '📥' : mode === 'WITHDRAWAL' ? '📤' : '🏦'}
            </span>
            <h3 className="font-bold text-text-primary text-lg">
              {mode === 'DEPOSIT'
                ? 'Depositar em Caixa'
                : mode === 'WITHDRAWAL'
                ? 'Retirar de Caixa'
                : 'Nova Conta de Caixa'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Seletor de Modo / Abas */}
        <div className="grid grid-cols-3 gap-1 bg-surface-elevated p-1 rounded-xl border border-border-theme">
          <button
            type="button"
            id="tab-deposit"
            onClick={() => {
              setMode('DEPOSIT');
              setError(null);
            }}
            className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'DEPOSIT'
                ? 'bg-action-primary text-action-primary-text shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Depositar
          </button>
          <button
            type="button"
            id="tab-withdraw"
            onClick={() => {
              setMode('WITHDRAWAL');
              setError(null);
            }}
            className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'WITHDRAWAL'
                ? 'bg-action-primary text-action-primary-text shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Retirar
          </button>
          <button
            type="button"
            id="tab-new-account"
            onClick={() => {
              setMode('NEW_ACCOUNT');
              setError(null);
            }}
            className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'NEW_ACCOUNT'
                ? 'bg-action-primary text-action-primary-text shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            + Conta
          </button>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="p-3 text-xs font-medium text-negative-text bg-negative-bg/20 border border-negative-border rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'NEW_ACCOUNT' ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">
                  Nome da Conta
                </label>
                <input
                  id="input-new-cash-account-name"
                  type="text"
                  required
                  placeholder="Ex: Reserva em Dólar, Caixa Oportunidade"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">
                  Moeda da Conta
                </label>
                <select
                  id="select-new-cash-account-currency"
                  value={newAccountCurrency}
                  onChange={(e) => setNewAccountCurrency(e.target.value as 'BRL' | 'USD' | 'EUR')}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                >
                  <option value="BRL">BRL (Real Brasileiro)</option>
                  <option value="USD">USD (Dólar Americano)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
            </>
          ) : (
            <>
              {/* Seletor de Conta se houver mais de 1 */}
              {accounts.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">
                    Conta de Caixa
                  </label>
                  <select
                    id="select-cash-account"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency}) — Saldo: {acc.currency} {Number(acc.balance).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Informação do Saldo Atual se for Retirada */}
              {mode === 'WITHDRAWAL' && selectedAccount && (
                <div className="p-2.5 bg-surface-elevated rounded-xl border border-border-theme/70 flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-medium">Saldo disponível:</span>
                  <span className="font-mono font-bold text-text-primary">
                    {selectedAccount.currency} {Number(selectedAccount.balance).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Valor */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">
                  Valor ({selectedAccount?.currency || 'BRL'})
                </label>
                <input
                  id="input-cash-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                />
              </div>

              {/* Data da Operação */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">
                  Data da Movimentação
                </label>
                <input
                  id="input-cash-date"
                  type="date"
                  required
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                />
              </div>

              {/* Descrição opcional */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">
                  Descrição (opcional)
                </label>
                <input
                  id="input-cash-description"
                  type="text"
                  maxLength={255}
                  placeholder="Ex: Aporte mensal, Retirada para despesas"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border-theme rounded-xl focus:outline-none focus:ring-2 focus:ring-action-primary text-text-primary"
                />
              </div>
            </>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              id="btn-submit-cash-transaction"
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-xs font-semibold text-action-primary-text bg-action-primary hover:bg-action-primary-hover active:scale-[0.98] rounded-xl shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary disabled:opacity-50"
            >
              {isLoading
                ? 'Processando...'
                : mode === 'DEPOSIT'
                ? 'Confirmar Depósito'
                : mode === 'WITHDRAWAL'
                ? 'Confirmar Retirada'
                : 'Criar Conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
