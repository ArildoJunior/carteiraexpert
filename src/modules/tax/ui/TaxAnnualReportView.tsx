import React, { useState } from 'react';
import type {
  SerializedTaxAnnualReport,
  SerializedUserTaxPreferences,
} from '../domain/tax.types';
import { TaxMonthlyReportCard } from './TaxMonthlyReportCard';

interface TaxAnnualReportViewProps {
  report: SerializedTaxAnnualReport;
  preferences: SerializedUserTaxPreferences;
}

type TabType =
  | 'APURACAO_MENSAL'
  | 'BENS_E_DIREITOS'
  | 'RENDIMENTOS_ISENTOS'
  | 'TRIBUTACAO_EXCLUSIVA'
  | 'PREJUIZOS';

function formatBrl(valStr: string): string {
  const num = parseFloat(valStr || '0');
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

export function TaxAnnualReportView({ report, preferences }: TaxAnnualReportViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('APURACAO_MENSAL');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const exportCsv = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (activeTab === 'APURACAO_MENSAL') {
      csvContent += 'Mes,Vendas_Totais,Isencao_20k,Ganho_Isento,Ganho_Tributavel,Prejuizo_Tributavel,IR_Estimado\n';
      report.months.forEach((m) => {
        csvContent += `${m.month},${m.totalSalesOverall},${m.isStockExempt ? 'SIM' : 'NAO'},${m.exemptGainStock},${m.taxableGainStock},${m.taxableLossStock},${m.totalEstimatedTax}\n`;
      });
    } else if (activeTab === 'BENS_E_DIREITOS') {
      csvContent += 'Ativo,Tipo,Quantidade_31_12,Custo_Medio,Custo_Total_31_12,Discriminacao\n';
      report.bensEDireitosSheet.forEach((b) => {
        csvContent += `"${b.assetSymbol}","${b.assetType}",${b.quantityAtYearEnd},${b.averageCostAtYearEnd},${b.totalCostAtYearEnd},"${b.discrimination.replace(/"/g, '""')}"\n`;
      });
    } else if (activeTab === 'RENDIMENTOS_ISENTOS') {
      csvContent += 'Ativo,Tipo,Data,Valor_Bruto,IRRF,Valor_Liquido\n';
      report.rendimentosIsentosSheet.forEach((r) => {
        csvContent += `"${r.assetSymbol}","${r.type}","${r.date}",${r.grossAmount},${r.irrfAmount},${r.netAmount}\n`;
      });
    } else if (activeTab === 'TRIBUTACAO_EXCLUSIVA') {
      csvContent += 'Ativo,Tipo,Data,Valor_Bruto,IRRF_Retido,Valor_Liquido\n';
      report.tributacaoExclusivaSheet.forEach((r) => {
        csvContent += `"${r.assetSymbol}","${r.type}","${r.date}",${r.grossAmount},${r.irrfAmount},${r.netAmount}\n`;
      });
    } else {
      csvContent += 'Ano_Origem,Mes_Origem,Ativo,Prejuizo_Original,Saldo_Remanescente,Validade\n';
      report.remainingLossCredits.forEach((c) => {
        csvContent += `${c.year},${c.monthOrigin},"${c.assetSymbol}",${c.originalLossAmount},${c.remainingAmount},"${c.expiresOn}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `carteiraexpert_fiscal_${report.year}_${activeTab.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Anuais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">Total Vendas (Ano)</span>
          <span className="text-base font-bold text-text-primary font-mono mt-1 block">
            {formatBrl(report.totalAnnualSales)}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">Resultado Líquido</span>
          <span
            className={`text-base font-bold font-mono mt-1 block ${
              parseFloat(report.totalAnnualNetGainLoss) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatBrl(report.totalAnnualNetGainLoss)}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">IR Estimado Total</span>
          <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
            {formatBrl(report.totalAnnualEstimatedTax)}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">IRRF Retido (JCP)</span>
          <span className="text-base font-bold text-indigo-400 font-mono mt-1 block">
            {formatBrl(report.totalIrrfRetidoJcp)}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">Proventos Isentos</span>
          <span className="text-base font-bold text-teal-400 font-mono mt-1 block">
            {formatBrl(
              (
                parseFloat(report.totalRendimentosIsentosDividendos) +
                parseFloat(report.totalRendimentosIsentosFii)
              ).toFixed(2)
            )}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <span className="block text-2xs uppercase tracking-wider text-text-muted">Prejuízos a Compensar</span>
          <span className="text-base font-bold text-cyan-400 font-mono mt-1 block">
            {report.remainingLossCredits.length > 0
              ? formatBrl(
                  report.remainingLossCredits
                    .reduce((acc, c) => acc + parseFloat(c.remainingAmount), 0)
                    .toFixed(2)
                )
              : 'R$ 0,00'}
          </span>
        </div>
      </div>

      {/* Barra de Ações e Abas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist">
          <button
            id="tab-btn-monthly"
            type="button"
            role="tab"
            aria-selected={activeTab === 'APURACAO_MENSAL'}
            onClick={() => setActiveTab('APURACAO_MENSAL')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'APURACAO_MENSAL'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            Apuração Mensal
          </button>

          <button
            id="tab-btn-bens"
            type="button"
            role="tab"
            aria-selected={activeTab === 'BENS_E_DIREITOS'}
            onClick={() => setActiveTab('BENS_E_DIREITOS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'BENS_E_DIREITOS'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            Bens e Direitos ({report.bensEDireitosSheet.length})
          </button>

          <button
            id="tab-btn-isentos"
            type="button"
            role="tab"
            aria-selected={activeTab === 'RENDIMENTOS_ISENTOS'}
            onClick={() => setActiveTab('RENDIMENTOS_ISENTOS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'RENDIMENTOS_ISENTOS'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            Rendimentos Isentos
          </button>

          <button
            id="tab-btn-exclusiva"
            type="button"
            role="tab"
            aria-selected={activeTab === 'TRIBUTACAO_EXCLUSIVA'}
            onClick={() => setActiveTab('TRIBUTACAO_EXCLUSIVA')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'TRIBUTACAO_EXCLUSIVA'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            Tributação Exclusiva (JCP)
          </button>

          <button
            id="tab-btn-prejuizos"
            type="button"
            role="tab"
            aria-selected={activeTab === 'PREJUIZOS'}
            onClick={() => setActiveTab('PREJUIZOS')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'PREJUIZOS'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
            }`}
          >
            Prejuízos Acumulados ({report.remainingLossCredits.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="export-csv-button"
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors shadow-sm"
          >
            ⬇️ Exportar CSV
          </button>
          <button
            id="print-pdf-button"
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors shadow-sm"
          >
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'APURACAO_MENSAL' && (
        <div className="space-y-3.5">
          {report.months.map((m) => (
            <TaxMonthlyReportCard
              key={m.month}
              monthResult={m}
              defaultRatePercent={`${(parseFloat(preferences.defaultCapitalGainsRate) * 100).toFixed(0)}%`}
            />
          ))}
        </div>
      )}

      {activeTab === 'BENS_E_DIREITOS' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden space-y-4 p-5">
          <div>
            <h4 className="text-base font-bold text-text-primary">
              Ficha de Bens e Direitos (Posição em 31/12/{report.year})
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Custódia com base nos custos médios contínuos de aquisição ponderada, conforme IN RFB.
            </p>
          </div>

          {report.bensEDireitosSheet.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              Nenhum ativo sob custódia em 31/12/{report.year}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-2xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-2.5 px-3">Ativo</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3 text-right">Qtd em 31/12</th>
                    <th className="py-2.5 px-3 text-right">Custo Médio Unitário</th>
                    <th className="py-2.5 px-3 text-right">Custo Total de Aquisição</th>
                    <th className="py-2.5 px-3">Discriminação Sugerida</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {report.bensEDireitosSheet.map((item, idx) => (
                    <tr key={item.assetId} className="hover:bg-surface-elevated/40">
                      <td className="py-2.5 px-3 font-semibold text-text-primary">
                        {item.assetSymbol}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary uppercase">{item.assetType}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                        {item.quantityAtYearEnd}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-secondary">
                        {formatBrl(item.averageCostAtYearEnd)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-text-primary">
                        {formatBrl(item.totalCostAtYearEnd)}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary max-w-xs truncate" title={item.discrimination}>
                        {item.discrimination}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleCopy(item.discrimination, idx)}
                          className="rounded border border-border px-2 py-1 text-2xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors"
                        >
                          {copiedIndex === idx ? 'Copiado!' : 'Copiar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'RENDIMENTOS_ISENTOS' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden space-y-4 p-5">
          <div>
            <h4 className="text-base font-bold text-text-primary">
              Ficha de Rendimentos Isentos e Não Tributáveis ({report.year})
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Dividendos de ações e rendimentos mensais distribuídos por FIIs (isentos na fonte para PF).
            </p>
          </div>

          {report.rendimentosIsentosSheet.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              Nenhum rendimento isento registrado em {report.year}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-2xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Ativo</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3 text-right">Valor Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {report.rendimentosIsentosSheet.map((r, i) => (
                    <tr key={`${r.assetSymbol}-${r.date}-${i}`} className="hover:bg-surface-elevated/40">
                      <td className="py-2.5 px-3 text-text-muted">{r.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-text-primary">{r.assetSymbol}</td>
                      <td className="py-2.5 px-3 text-text-secondary">
                        {r.type === 'DIVIDEND' ? 'Dividendo de Ações' : 'Rendimento de FII'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {formatBrl(r.netAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'TRIBUTACAO_EXCLUSIVA' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden space-y-4 p-5">
          <div>
            <h4 className="text-base font-bold text-text-primary">
              Ficha de Tributação Exclusiva / Definitiva ({report.year})
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Juros sobre Capital Próprio (JCP) com retenção de 15% de IRRF na fonte pagadora.
            </p>
          </div>

          {report.tributacaoExclusivaSheet.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              Nenhum evento de JCP registrado em {report.year}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-2xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Ativo</th>
                    <th className="py-2.5 px-3 text-right">Valor Bruto</th>
                    <th className="py-2.5 px-3 text-right">IRRF Retido (15%)</th>
                    <th className="py-2.5 px-3 text-right">Valor Líquido Creditado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {report.tributacaoExclusivaSheet.map((j, i) => (
                    <tr key={`${j.assetSymbol}-${j.date}-${i}`} className="hover:bg-surface-elevated/40">
                      <td className="py-2.5 px-3 text-text-muted">{j.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-text-primary">{j.assetSymbol}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-text-primary">
                        {formatBrl(j.grossAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                        {formatBrl(j.irrfAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {formatBrl(j.netAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'PREJUIZOS' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden space-y-4 p-5">
          <div>
            <h4 className="text-base font-bold text-text-primary">
              Controle de Prejuízos Acumulados a Compensar
            </h4>
            <p className="text-xs text-text-muted mt-0.5">
              Prejuízos gerados em meses com vendas &gt; R$ 20k, válidos por até 5 anos-calendário (ordem FIFO).
            </p>
          </div>

          {report.remainingLossCredits.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              Nenhum saldo de prejuízo pendente de compensação.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated text-2xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-2.5 px-3">Ano / Mês de Origem</th>
                    <th className="py-2.5 px-3">Ativo / Origem</th>
                    <th className="py-2.5 px-3 text-right">Prejuízo Original</th>
                    <th className="py-2.5 px-3 text-right">Saldo Remanescente</th>
                    <th className="py-2.5 px-3 text-center">Válido Até</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {report.remainingLossCredits.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-elevated/40">
                      <td className="py-2.5 px-3 font-semibold text-text-primary">
                        {c.monthOrigin.toString().padStart(2, '0')}/{c.year}
                      </td>
                      <td className="py-2.5 px-3 text-text-secondary">{c.assetSymbol}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-400">
                        {formatBrl(c.originalLossAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                        {formatBrl(c.remainingAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-text-muted">
                        {c.expiresOn ? c.expiresOn.slice(0, 10) : '31/12'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
