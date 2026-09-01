import React from 'react';
import { Decimal } from '@/lib/decimal';
import type { AssetFundamentalsViewData } from '@/modules/market-data';

export interface AssetFundamentalsCardProps {
  fundamentals?: AssetFundamentalsViewData | null;
  isLoading?: boolean;
  error?: string | null;
}

function formatCurrency(valStr: string | null | undefined, currency = 'BRL'): string {
  if (!valStr) return '—';
  try {
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    const prefix = currency === 'BRL' ? 'R$ ' : `${currency} `;
    return `${isNegative ? '-' : ''}${prefix}${integerPart},${decimalPart}`;
  } catch {
    return '—';
  }
}

function formatPercent(valStr: string | null | undefined): string {
  if (!valStr) return '—';
  try {
    const d = new Decimal(valStr).mul(100);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    return `${isNegative ? '-' : ''}${integerPart},${decimalPart}%`;
  } catch {
    return '—';
  }
}

function formatDecimal(valStr: string | null | undefined, digits = 2): string {
  if (!valStr) return '—';
  try {
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(digits).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] ? `,${parts[1]}` : '';
    return `${isNegative ? '-' : ''}${integerPart}${decimalPart}`;
  } catch {
    return '—';
  }
}

function formatShares(valStr: string | null | undefined): string {
  if (!valStr) return '—';
  try {
    const d = new Decimal(valStr);
    const parts = d.toFixed(0).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  } catch {
    return '—';
  }
}

function formatCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return '—';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) {
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  }
  return cnpj;
}

function formatDate(dateStr: string | null | undefined): string {
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

export function AssetFundamentalsCard({
  fundamentals,
  isLoading = false,
  error = null,
}: AssetFundamentalsCardProps) {
  // 1. Estado de Carregamento (Skeleton Animado)
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-theme">
          <div className="space-y-2">
            <div className="h-6 w-72 bg-surface-elevated rounded-md" />
            <div className="h-4 w-48 bg-surface-elevated/70 rounded-md" />
          </div>
          <div className="h-8 w-36 bg-surface-elevated rounded-md" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-40 bg-surface-elevated rounded-md" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={`skel-ind-${i}`} className="h-20 bg-surface-elevated rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-44 bg-surface-elevated rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={`skel-raw-${i}`} className="h-10 bg-surface-elevated rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro de Consulta
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-2">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/10 text-rose-500 text-sm font-bold mb-1">
          !
        </div>
        <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          Não foi possível carregar as demonstrações contábeis
        </h4>
        <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
          {error}
        </p>
      </div>
    );
  }

  // 3. Estado de Ausência de Dados CVM
  if (!fundamentals) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-6 text-center text-text-muted space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Demonstrações Contábeis e Fundamentos
        </h4>
        <p className="text-xs text-text-muted max-w-lg mx-auto leading-relaxed">
          Demonstrações financeiras oficiais ainda não cadastradas para este ativo no catálogo público.
        </p>
        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-medium bg-surface-elevated border border-border-theme text-text-muted">
          Fonte oficial CVM / B3
        </span>
      </div>
    );
  }

  const { statement, indicators, cvmCompany } = fundamentals;
  const quoteAudit = indicators.quoteAudit;
  const isConsolidated = statement.statementType === 'CONSOLIDATED';
  const isCvmSource = statement.source.toLowerCase() === 'cvm';

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
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                isConsolidated
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
              }`}
            >
              {isConsolidated ? 'Consolidado' : 'Individual'}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-elevated border border-border-theme text-text-muted">
              v{statement.version} {statement.isRestated && '(Reapresentado)'}
            </span>
            {statement.isRestated && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Retificado
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            Fonte oficial:{' '}
            <span className="font-semibold text-text-secondary">
              {isCvmSource ? 'CVM (Comissão de Valores Mobiliários)' : statement.source.toUpperCase()}
            </span>
            {statement.sourceReference && ` • Protocolo: ${statement.sourceReference}`}
          </p>
        </div>

        {/* Datas Oficiais */}
        <div className="text-left sm:text-right text-xs space-y-0.5">
          <div className="text-text-muted">
            Data-base: <span className="font-medium text-text-primary">{formatDate(statement.referenceDate)}</span>
          </div>
          {statement.filingDate && (
            <div className="text-text-muted">
              Divulgação:{' '}
              <span className="font-medium text-text-primary">{formatDate(statement.filingDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner de Informações Corporativas CVM (quando disponível) */}
      {cvmCompany && (
        <div className="rounded-lg bg-surface-elevated/50 border border-border-theme p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-text-muted">Companhia Aberta Registrada: </span>
              <span className="font-bold text-text-primary">{cvmCompany.legalName}</span>
              {cvmCompany.tradeName && cvmCompany.tradeName !== cvmCompany.legalName && (
                <span className="text-text-muted"> ({cvmCompany.tradeName})</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <div>
                <span className="text-text-muted">CNPJ: </span>
                <span className="font-semibold text-text-secondary">{formatCnpj(cvmCompany.cnpj)}</span>
              </div>
              <div>
                <span className="text-text-muted">Cód. CVM: </span>
                <span className="font-semibold text-text-secondary">{cvmCompany.cvmCode}</span>
              </div>
            </div>
          </div>
          {(cvmCompany.industrySector || cvmCompany.marketType) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border-theme/60 text-[11px] text-text-muted">
              {cvmCompany.industrySector && (
                <div>
                  <span>Setor CVM: </span>
                  <span className="font-medium text-text-secondary">{cvmCompany.industrySector}</span>
                </div>
              )}
              {cvmCompany.marketType && (
                <div>
                  <span>• Mercado: </span>
                  <span className="font-medium text-text-secondary">{cvmCompany.marketType}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid de Indicadores e Múltiplos Principais */}
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
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.netRevenue, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">EBITDA:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.ebitda, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Lucro Líquido:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.netIncome, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Patrimônio Líquido:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.totalEquity, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Ativo Total:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.totalAssets, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Dívida Bruta:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.grossDebt, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Caixa e Equivalentes:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.cashEquivalents, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted font-medium">Dívida Líquida (Derivada):</span>
            <span className="font-semibold text-text-primary">
              {formatCurrency(indicators.netDebt, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Proventos Declarados no Exercício:</span>
            <span className="font-medium text-text-primary">
              {formatCurrency(statement.dividendsDeclared, statement.currency)}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-border-theme">
            <span className="text-text-muted">Total de Ações Emitidas:</span>
            <span className="font-medium text-text-primary">
              {formatShares(statement.sharesCount)}
            </span>
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
