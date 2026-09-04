import React, { useState } from 'react';
import type { SerializedOptionContract, OptionStatus } from '../domain/options.types';
import { updateOptionStatusAction, deleteOptionContractAction } from '../server/options.actions';

interface OptionsContractListProps {
  options: SerializedOptionContract[];
  selectedContractId: string | null;
  onSelectOption: (contractId: string) => void;
  onOpenNewModal: () => void;
  onOptionUpdated: () => void;
}

export function OptionsContractList({
  options,
  selectedContractId,
  onSelectOption,
  onOpenNewModal,
  onOptionUpdated,
}: OptionsContractListProps) {
  const [filterStatus, setFilterStatus] = useState<OptionStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const filteredOptions = options.filter((opt) => {
    if (filterStatus === 'ALL') return true;
    return opt.status === filterStatus;
  });

  async function handleClosePosition(contractId: string) {
    if (!confirm('Deseja marcar este contrato de opção como ENCERRADO?')) return;
    setLoadingId(contractId);
    setActionError(null);
    try {
      const res = await updateOptionStatusAction(contractId, 'CLOSED');
      if (!res.success) {
        setActionError(res.error);
        return;
      }
      onOptionUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao encerrar contrato.';
      setActionError(msg);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDeleteContract(contractId: string) {
    if (!confirm('Tem certeza de que deseja excluir este contrato? Esta ação pode ser desfeita pelo suporte.')) return;
    setLoadingId(contractId);
    setActionError(null);
    try {
      const res = await deleteOptionContractAction(contractId);
      if (!res.success) {
        setActionError(res.error);
        return;
      }
      onOptionUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao excluir contrato.';
      setActionError(msg);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div
      role="region"
      aria-label="Lista de Contratos de Opções"
      className="rounded-xl border border-border-theme bg-surface p-5 sm:p-6 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-theme pb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary tracking-tight">
            Contratos de Opções Cadastrados
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Acompanhe posições de derivativos, strikes, prêmios e vencimentos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filtro de Status */}
          <div className="flex items-center rounded-lg border border-border-theme p-0.5 bg-surface-subtle text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                filterStatus === 'ALL'
                  ? 'bg-surface text-text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Todas ({options.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('OPEN')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                filterStatus === 'OPEN'
                  ? 'bg-surface text-text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Abertas
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('CLOSED')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                filterStatus === 'CLOSED'
                  ? 'bg-surface text-text-primary shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Encerradas
            </button>
          </div>

          <button
            type="button"
            id="btn-nova-opcao"
            onClick={onOpenNewModal}
            className="px-3 py-1.5 rounded-lg bg-action-primary hover:bg-action-primary-hover text-action-primary-text text-xs font-semibold shadow-sm transition-all"
          >
            + Nova Opção
          </button>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400"
        >
          {actionError}
        </div>
      )}

      {filteredOptions.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed border-border-theme rounded-lg space-y-3">
          <div className="text-3xl" aria-hidden="true">📈</div>
          <h4 className="text-sm font-semibold text-text-primary">
            Nenhum contrato de opção encontrado
          </h4>
          <p className="text-xs text-text-muted max-w-md mx-auto">
            Cadastre sua primeira posição de opção para acompanhar gregas teóricas pelo modelo de Black-Scholes e alertas de vencimento da B3.
          </p>
          <button
            type="button"
            onClick={onOpenNewModal}
            className="mt-2 px-3.5 py-2 rounded-lg bg-action-primary hover:bg-action-primary-hover text-action-primary-text text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5"
          >
            + Cadastrar Opção
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-text-secondary border-collapse">
            <thead>
              <tr className="border-b border-border-theme text-[11px] font-semibold text-text-muted uppercase">
                <th scope="col" className="py-2.5 px-3">Ticker / Ativo</th>
                <th scope="col" className="py-2.5 px-2">Tipo</th>
                <th scope="col" className="py-2.5 px-2">Posição</th>
                <th scope="col" className="py-2.5 px-2">Strike</th>
                <th scope="col" className="py-2.5 px-2">Prêmio</th>
                <th scope="col" className="py-2.5 px-2">Qtd</th>
                <th scope="col" className="py-2.5 px-2">Vencimento</th>
                <th scope="col" className="py-2.5 px-2">Status</th>
                <th scope="col" className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-theme/40">
              {filteredOptions.map((opt) => {
                const isSelected = opt.id === selectedContractId;
                const isCall = opt.optionType === 'CALL';
                const isBuy = opt.direction === 'BUY';

                return (
                  <tr
                    key={opt.id}
                    className={`transition-colors cursor-pointer hover:bg-surface-hover/70 ${
                      isSelected ? 'bg-action-primary/5 border-l-2 border-l-action-primary' : ''
                    }`}
                    onClick={() => onSelectOption(opt.id)}
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-text-primary text-xs flex items-center gap-1.5">
                        {opt.ticker}
                        {opt.custodyAccountName && (
                          <span
                            className="text-[9px] px-1 py-0.2 rounded bg-surface-hover text-text-muted"
                            title={`Custódia: ${opt.custodyAccountName}`}
                          >
                            {opt.custodyAccountName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {opt.underlyingAssetTicker || 'Ativo-objeto'}
                      </div>
                    </td>

                    <td className="py-3 px-2">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isCall
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {opt.optionType}
                      </span>
                    </td>

                    <td className="py-3 px-2">
                      <span className="text-[11px] font-medium text-text-primary">
                        {isBuy ? 'Titular' : 'Lançador'}
                      </span>
                    </td>

                    <td className="py-3 px-2 font-medium text-text-primary">
                      R$ {opt.strikePrice}
                    </td>

                    <td className="py-3 px-2 text-text-primary">
                      R$ {opt.premiumPaidReceived}
                    </td>

                    <td className="py-3 px-2 text-text-secondary">
                      {opt.quantity}
                    </td>

                    <td className="py-3 px-2 text-text-secondary whitespace-nowrap">
                      {opt.expirationDate}
                    </td>

                    <td className="py-3 px-2">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          opt.status === 'OPEN'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : opt.status === 'CLOSED'
                            ? 'bg-zinc-500/10 text-zinc-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}
                      >
                        {opt.status === 'OPEN' ? 'Aberta' : opt.status === 'CLOSED' ? 'Encerrada' : 'Vencida'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectOption(opt.id)}
                          className="px-2 py-1 rounded text-[11px] font-medium text-action-primary hover:bg-action-primary/10 transition-colors"
                        >
                          Análise
                        </button>

                        {opt.status === 'OPEN' && (
                          <button
                            type="button"
                            disabled={loadingId === opt.id}
                            onClick={() => handleClosePosition(opt.id)}
                            className="px-2 py-1 rounded text-[11px] font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                            title="Encerrar posição"
                          >
                            Encerrar
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={loadingId === opt.id}
                          onClick={() => handleDeleteContract(opt.id)}
                          className="px-2 py-1 rounded text-[11px] font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Excluir contrato"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
