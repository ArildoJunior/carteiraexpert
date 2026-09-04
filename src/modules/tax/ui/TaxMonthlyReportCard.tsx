import React, { useState } from 'react';
import type { SerializedTaxMonthlyCalculationResult } from '../domain/tax.types';

interface TaxMonthlyReportCardProps {
  monthResult: SerializedTaxMonthlyCalculationResult;
  defaultRatePercent?: string;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatBrl(valStr: string): string {
  const num = parseFloat(valStr || '0');
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

export function TaxMonthlyReportCard({ monthResult, defaultRatePercent = '15%' }: TaxMonthlyReportCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const monthName = MONTH_NAMES[monthResult.month - 1] || `Mês ${monthResult.month}`;
  const isExempt = monthResult.isStockExempt;
  const hasOperations =
    parseFloat(monthResult.totalSalesOverall) > 0 ||
    parseFloat(monthResult.exemptGainStock) !== 0 ||
    parseFloat(monthResult.taxableGainStock) !== 0 ||
    parseFloat(monthResult.taxableLossStock) !== 0 ||
    parseFloat(monthResult.fiiGain) !== 0 ||
    parseFloat(monthResult.dayTradeGain) !== 0;

  const netResultNum =
    parseFloat(monthResult.exemptGainStock) +
    parseFloat(monthResult.taxableGainStock) -
    parseFloat(monthResult.taxableLossStock) +
    parseFloat(monthResult.fiiGain) -
    parseFloat(monthResult.fiiLoss) +
    parseFloat(monthResult.etfBdrGain) -
    parseFloat(monthResult.etfBdrLoss) +
    parseFloat(monthResult.dayTradeGain) -
    parseFloat(monthResult.dayTradeLoss);

  return (
    <div
      data-testid={`monthly-card-${monthResult.month}`}
      className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden transition-all duration-200"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 gap-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated font-bold text-sm text-text-primary">
            {monthResult.month.toString().padStart(2, '0')}
          </div>
          <div>
            <h4 className="text-base font-bold text-text-primary">
              {monthName} de {monthResult.year}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
              {isExempt ? (
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-2xs font-semibold text-emerald-400">
                  Isenção Aplicada (Vendas de ações ≤ R$ 20k)
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-2xs font-semibold text-amber-400">
                  Tributável (Vendas de ações &gt; R$ 20k)
                </span>
              )}
              {!hasOperations && (
                <span className="text-2xs text-text-muted">Sem movimentações de venda</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-right">
          <div>
            <span className="block text-2xs text-text-muted uppercase tracking-wider">Total de Vendas</span>
            <span className="text-sm font-semibold text-text-primary font-mono">
              {formatBrl(monthResult.totalSalesOverall)}
            </span>
          </div>

          <div>
            <span className="block text-2xs text-text-muted uppercase tracking-wider">Resultado Líquido</span>
            <span
              className={`text-sm font-bold font-mono ${
                netResultNum > 0
                  ? 'text-emerald-400'
                  : netResultNum < 0
                  ? 'text-rose-400'
                  : 'text-text-muted'
              }`}
            >
              {formatBrl(netResultNum.toFixed(2))}
            </span>
          </div>

          <div>
            <span className="block text-2xs text-text-muted uppercase tracking-wider">IR Estimado</span>
            <span className="text-sm font-bold text-amber-400 font-mono">
              {formatBrl(monthResult.totalEstimatedTax)}
            </span>
          </div>

          {monthResult.assetResults.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
            >
              {isExpanded ? 'Ocultar Detalhes' : `Ver Ativos (${monthResult.assetResults.length})`}
            </button>
          )}
        </div>
      </div>

      {isExpanded && monthResult.assetResults.length > 0 && (
        <div className="p-4 sm:p-5 bg-surface-elevated/40 space-y-3">
          <h5 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            Detalhamento por Ativo Alienado no Mês
          </h5>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-elevated text-2xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2.5 px-3">Ativo</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-right">Qtd Vendida</th>
                  <th className="py-2.5 px-3 text-right">Total Venda</th>
                  <th className="py-2.5 px-3 text-right">Custo Médio</th>
                  <th className="py-2.5 px-3 text-right">Lucro / Prejuízo</th>
                  <th className="py-2.5 px-3 text-center">Modalidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {monthResult.assetResults.map((ar) => {
                  const gainNum = parseFloat(ar.netGainLoss);
                  return (
                    <tr key={`${ar.assetId}-${ar.isDayTrade}`} className="hover:bg-surface-elevated/60">
                      <td className="py-2.5 px-3 font-semibold text-text-primary">
                        {ar.assetSymbol}
                        <span className="block text-2xs text-text-muted font-normal">{ar.assetName}</span>
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary uppercase">{ar.assetType}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                        {ar.totalQuantitySold}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                        {formatBrl(ar.totalSalesProceeds)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-secondary">
                        {formatBrl(ar.averageCostAtSale)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          gainNum > 0
                            ? 'text-emerald-400'
                            : gainNum < 0
                            ? 'text-rose-400'
                            : 'text-text-muted'
                        }`}
                      >
                        {formatBrl(ar.netGainLoss)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {ar.isDayTrade ? (
                          <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-2xs font-bold text-indigo-400">
                            Day-Trade
                          </span>
                        ) : (
                          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-2xs text-text-muted">
                            Swing
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
