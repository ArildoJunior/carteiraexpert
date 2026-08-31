import React from 'react';
import type { AssetFundamentalsViewData } from '@/modules/market-data';

interface AssetFundamentalsCardProps {
  fundamentals: AssetFundamentalsViewData | null;
}

function formatCurrency(valStr: string | null, currency = 'BRL'): string {
  if (valStr === null || valStr === undefined) return '—';
  const num = Number(valStr);
  if (Number.isNaN(num)) return '—';
  return `${currency === 'BRL' ? 'R$ ' : '$ '}${num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(valStr: string | null): string {
  if (valStr === null || valStr === undefined) return '—';
  const num = Number(valStr);
  if (Number.isNaN(num)) return '—';
  return `${(num * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDecimal(valStr: string | null, digits = 2): string {
  if (valStr === null || valStr === undefined) return '—';
  const num = Number(valStr);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Não informada';
  try {
    const clean = dateStr.slice(0, 10);
    const [year, month, day] = clean.split('-');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function AssetFundamentalsCard({ fundamentals }: AssetFundamentalsCardProps) {
  if (!fundamentals) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-6 text-center text-text-muted">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
          Demonstrações Contábeis e Fundamentos
        </h4>
        <p className="text-xs text-text-muted max-w-lg mx-auto leading-relaxed">
          Demonstrações financeiras oficiais ainda não cadastradas para este ativo no catálogo público.
        </p>
      </div>
    );
  }

  const { statement, indicators } = fundamentals;
  const quoteAudit = indicators.quoteAudit;

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6">
      {/* Header do Card de Fundamentos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-theme">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-text-primary">
              Demonstrações e Indicadores Fundamentais
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-brand/10 text-brand border border-brand/20">
              {statement.referencePeriod}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-elevated border border-border-theme text-text-secondary">
              {statement.statementType === 'CONSOLIDATED' ? 'Consolidado' : 'Individual'}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-elevated border border-border-theme text-text-muted">
              v{statement.version} {statement.isRestated && '(Reapresentado)'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Fonte oficial: <span className="font-semibold text-text-secondary">{statement.source.toUpperCase()}</span>
            {statement.sourceReference && ` • Protocolo: ${statement.sourceReference}`}
          </p>

        </div>

        {/* Datas Factuais */}
        <div className="text-left sm:text-right text-xs space-y-0.5">
          <div className="text-text-muted">
            Data-base: <span className="font-medium text-text-primary">{formatDate(statement.referenceDate)}</span>
          </div>
          {statement.filingDate && (
            <div className="text-text-muted">
              Divulgação: <span className="font-medium text-text-primary">{formatDate(statement.filingDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid de Indicadores Principais */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Múltiplos e Indicadores Calculados
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* P/L */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">P/L</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatDecimal(indicators.peRatio)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Preço / Lucro</div>
          </div>

          {/* P/VP */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">P/VP</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatDecimal(indicators.pbRatio)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Preço / Valor Patr.</div>
          </div>

          {/* Dividend Yield */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">Dividend Yield</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatPercent(indicators.dividendYield)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Proventos Decl. / Cotação</div>
          </div>

          {/* ROE */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">ROE</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatPercent(indicators.roe)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Retorno s/ Patr. Líquido</div>
          </div>

          {/* ROA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">ROA</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatPercent(indicators.roa)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Retorno s/ Ativo Total</div>
          </div>

          {/* Margem Líquida */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">Margem Líquida</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatPercent(indicators.netMargin)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Lucro Líq. / Receita</div>
          </div>

          {/* Margem EBITDA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">Margem EBITDA</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatPercent(indicators.ebitdaMargin)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">EBITDA / Receita</div>
          </div>

          {/* LPA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">LPA</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatCurrency(indicators.lpa, statement.currency)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Lucro por Ação</div>
          </div>

          {/* VPA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">VPA</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatCurrency(indicators.vpa, statement.currency)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Valor Patr. por Ação</div>
          </div>

          {/* Dívida Líquida / EBITDA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme">
            <div className="text-[11px] text-text-muted font-medium">Dív. Líquida / EBITDA</div>
            <div className="text-lg font-bold text-text-primary mt-0.5">
              {formatDecimal(indicators.netDebtToEbitda)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Alavancagem Financeira</div>
          </div>
        </div>

        {/* Auditoria da Cotação Utilizada nos Múltiplos */}
        {quoteAudit && (
          <div className="mt-3 p-2.5 rounded bg-surface-elevated/60 border border-border-theme text-[11px] text-text-muted flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-text-secondary">Cotação base utilizada:</span>{' '}
              {formatCurrency(quoteAudit.quotePriceUsed, quoteAudit.currency)} (
              {quoteAudit.quoteSource === 'cotahist' ? 'B3 COTAHIST Fechamento' : 'Cotação de Mercado'})
            </div>
            <div>
              <span className="font-semibold text-text-secondary">Data do pregão:</span>{' '}
              {formatDate(quoteAudit.quoteDateUsed)}
            </div>
          </div>
        )}

        {indicators.currencyMismatch && (
          <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
            Aviso: Cotação e demonstrativo contábil possuem moedas diferentes. Múltiplos dependentes de preço foram desabilitados para evitar distorções.
          </div>
        )}
      </div>

      {/* Demonstrativos Contábeis Brutos e Grandeza Derivada */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Dados Contábeis Reportados ({statement.currency})
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Receita Líquida:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.netRevenue, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">EBITDA:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.ebitda, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Lucro Líquido:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.netIncome, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Patrimônio Líquido:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.totalEquity, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Ativo Total:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.totalAssets, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Dívida Bruta:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.grossDebt, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Caixa e Equivalentes:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.cashEquivalents, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted font-medium">Dívida Líquida (Derivada):</span>
            <span className="font-semibold text-text-primary">{formatCurrency(indicators.netDebt, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Proventos Declarados no Exercício:</span>
            <span className="font-medium text-text-primary">{formatCurrency(statement.dividendsDeclared, statement.currency)}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Total de Ações Emitidas:</span>
            <span className="font-medium text-text-primary">{statement.sharesCount ? Number(statement.sharesCount).toLocaleString('pt-BR') : '—'}</span>
          </div>
        </div>
      </div>

      {/* Aviso Regulatório de Neutralidade */}
      <div className="text-[11px] text-text-muted bg-surface-elevated/40 p-3 rounded-lg border border-border-theme">
        <strong className="text-text-secondary">Finalidade Informativa e Educacional:</strong> Os indicadores apresentados são calculados de forma determinística com base nas demonstrações financeiras oficiais divulgadas pela companhia. O CarteiraExpert não formula recomendações de investimento, análise preditiva, classificação de risco ou consultoria de valores mobiliários.
      </div>
    </div>
  );
}
