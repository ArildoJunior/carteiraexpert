'use client';

import type { SerializedCashTransaction } from '../domain/cash.types';
import { Decimal } from '@/lib/decimal';

interface CashTransactionListProps {
  transactions: SerializedCashTransaction[];
  currency?: string;
  isFrozen?: boolean;
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

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

export function CashTransactionList({
  transactions,
  currency = 'BRL',
}: CashTransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div
        id="empty-cash-transactions-state"
        className="bg-surface border border-border-theme rounded-2xl p-8 text-center space-y-2"
      >
        <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center mx-auto text-lg text-text-secondary">
          💵
        </div>
        <h4 className="text-sm font-semibold text-text-primary">
          Nenhuma movimentação em dinheiro registrada
        </h4>
        <p className="text-xs text-text-secondary max-w-sm mx-auto">
          Depósitos e retiradas registrados nesta conta de caixa aparecerão detalhados aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table
          id="cash-transactions-table"
          className="w-full text-left text-sm text-text-primary"
        >
          <thead className="bg-background/60 text-xs uppercase text-text-secondary font-semibold border-b border-border-theme">
            <tr>
              <th scope="col" className="px-4 py-3">
                Tipo
              </th>
              <th scope="col" className="px-4 py-3">
                Data
              </th>
              <th scope="col" className="px-4 py-3">
                Descrição
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme">
            {transactions.map((tx) => {
              const isDeposit = tx.type === 'DEPOSIT';
              return (
                <tr
                  key={tx.id}
                  id={`cash-transaction-row-${tx.id}`}
                  className="hover:bg-surface-elevated/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        isDeposit
                          ? 'bg-positive-bg/40 text-positive-text border border-positive-border/40'
                          : 'bg-surface-elevated text-text-secondary border border-border-theme'
                      }`}
                    >
                      {isDeposit ? '↓ Depósito' : '↑ Retirada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                    {formatDate(tx.transactionDate)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-primary">
                    {tx.description || (isDeposit ? 'Depósito em conta corrente' : 'Retirada de caixa')}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono text-xs font-bold whitespace-nowrap tabular-nums ${
                      isDeposit ? 'text-positive-text' : 'text-text-primary'
                    }`}
                  >
                    {isDeposit ? '+' : '-'}{formatMoney(tx.amount, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
