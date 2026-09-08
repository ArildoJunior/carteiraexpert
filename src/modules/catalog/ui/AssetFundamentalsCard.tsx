'use client';

import React, { useState } from 'react';
import { Decimal } from '@/lib/decimal';
import type { AssetFundamentalsViewData } from '@/modules/market-data';
import {
  IndicatorTraceabilityModal,
  type TraceabilityInputItem,
} from './IndicatorTraceabilityModal';

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

function formatCleanSourceReference(sourceRef: string | null | undefined): React.ReactNode {
  if (!sourceRef) return null;
  const trimmed = sourceRef.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.source === 'cvm_dfp') {
        const year = parsed.referenceDate ? parsed.referenceDate.slice(0, 4) : '';
        return (
          <span>
            • Documento:{' '}
            <span className="font-medium text-text-secondary">
              DFP {year ? `(${year})` : ''}
            </span>
          </span>
        );
      }
      if (parsed.source === 'cvm_itr') {
        return (
          <span>
            • Documento: <span className="font-medium text-text-secondary">ITR</span>
          </span>
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  return (
    <span>
      • Protocolo: <span className="font-medium text-text-secondary">{trimmed}</span>
    </span>
  );
}

function getDataQualityBadge(status?: string | null) {
  if (!status || status === 'VALID') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        Dados Válidos
      </span>
    );
  }
  if (status === 'STALE') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        Cotação Defasada
      </span>
    );
  }
  if (status === 'INCOMPATIBLE') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
        Incompatibilidade Cambial
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-elevated text-text-muted border border-border-theme">
      {status}
    </span>
  );
}

export function AssetFundamentalsCard({
  fundamentals,
  isLoading = false,
  error = null,
}: AssetFundamentalsCardProps) {
  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    formula: string;
    inputs: TraceabilityInputItem[];
    notes?: string[];
    methodology?: string;
  }>({
    open: false,
    title: '',
    formula: '',
    inputs: [],
  });

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
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={`skel-ind-${i}`} className="h-20 bg-surface-elevated rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

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
  const isVersionRestated = statement.isRestated || statement.version > 1;

  const isNetCash =
    (indicators.netDebt && Number(indicators.netDebt) < 0) ||
    (indicators.netDebtToEquity && Number(indicators.netDebtToEquity) < 0);

  const openTraceability = (
    key: string,
    title: string,
    fallbackFormula: string,
    defaultInputs: TraceabilityInputItem[] = [],
    defaultNotes?: string[]
  ) => {
    const trace = indicators.traceability?.[key];
    if (trace) {
      const inputs: TraceabilityInputItem[] = Object.entries(trace.premises || {}).map(
        ([k, v]) => ({
          label: k,
          value: String(v),
          source: trace.source,
        })
      );
      setModalState({
        open: true,
        title,
        formula: trace.formula || fallbackFormula,
        inputs: inputs.length > 0 ? inputs : defaultInputs,
        notes: trace.limitations && trace.limitations.length > 0 ? trace.limitations : defaultNotes,
        methodology: trace.methodology,
      });
    } else {
      setModalState({
        open: true,
        title,
        formula: fallbackFormula,
        inputs: defaultInputs,
        notes: defaultNotes,
      });
    }
  };

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6">
      {/* 1. Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-theme">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-text-primary">
              Demonstrações e Indicadores Fundamentais
            </h3>
            {getDataQualityBadge(indicators.dataQualityStatus)}
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-brand/10 text-brand border border-brand/20">
              {statement.referencePeriod}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                isConsolidated
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
              }`}
            >
              {isConsolidated ? 'Consolidado' : 'Individual'}
            </span>
            {isVersionRestated ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                v{statement.version} • Retificado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-surface-elevated border border-border-theme text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                v{statement.version} • Original
              </span>
            )}
          </div>

          <p className="text-xs text-text-muted flex items-center gap-1.5 flex-wrap">
            <span>Fonte oficial:</span>
            <span className="font-semibold text-text-secondary">
              {isCvmSource ? 'CVM (Comissão de Valores Mobiliários)' : statement.source.toUpperCase()}
            </span>
            {formatCleanSourceReference(statement.sourceReference)}
          </p>
        </div>

        <div className="flex flex-wrap md:flex-col md:items-end gap-x-4 gap-y-1 text-xs">
          <div className="text-text-muted">
            Data-base:{' '}
            <span className="font-semibold text-text-primary">
              {formatDate(statement.referenceDate)}
            </span>
          </div>
          {statement.filingDate && (
            <div className="text-text-muted">
              Divulgação:{' '}
              <span className="font-semibold text-text-primary">
                {formatDate(statement.filingDate)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Informações Corporativas CVM */}
      {cvmCompany && (
        <div className="rounded-lg bg-surface-elevated/60 border border-border-theme p-4 text-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Companhia Aberta Registrada
              </div>
              <div className="text-sm font-bold text-text-primary mt-0.5">
                {cvmCompany.legalName}
                {cvmCompany.tradeName && cvmCompany.tradeName !== cvmCompany.legalName && (
                  <span className="font-normal text-text-muted ml-1.5">
                    ({cvmCompany.tradeName})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-text-muted">CNPJ: </span>
                <span className="font-semibold text-text-secondary font-mono">
                  {formatCnpj(cvmCompany.cnpj)}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Cód. CVM: </span>
                <span className="font-semibold text-text-secondary font-mono">
                  {cvmCompany.cvmCode}
                </span>
              </div>
            </div>
          </div>

          {(cvmCompany.industrySector || cvmCompany.marketType) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2.5 border-t border-border-theme/60 text-[11px] text-text-muted">
              {cvmCompany.industrySector && (
                <div>
                  <span>Setor CVM: </span>
                  <span className="font-semibold text-text-secondary">
                    {cvmCompany.industrySector}
                  </span>
                </div>
              )}
              {cvmCompany.marketType && (
                <div>
                  <span>Segmento de Mercado: </span>
                  <span className="font-semibold text-text-secondary">
                    {cvmCompany.marketType}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Grid dos 15 Indicadores e Múltiplos Calculados */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Múltiplos e Indicadores Calculados
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. P/L */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">P/L</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'peRatio',
                      'P/L (Preço / Lucro)',
                      'Preço da Ação / Lucro por Ação (LPA)',
                      [
                        { label: 'Cotação', value: quoteAudit ? formatCurrency(quoteAudit.quotePriceUsed, statement.currency) : '—' },
                        { label: 'LPA', value: formatCurrency(indicators.lpa, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do P/L"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatDecimal(indicators.peRatio)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Preço / Lucro</div>
          </div>

          {/* 2. P/VP */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">P/VP</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'pbRatio',
                      'P/VP (Preço / Valor Patrimonial)',
                      'Preço da Ação / Valor Patrimonial por Ação (VPA)',
                      [
                        { label: 'Cotação', value: quoteAudit ? formatCurrency(quoteAudit.quotePriceUsed, statement.currency) : '—' },
                        { label: 'VPA', value: formatCurrency(indicators.vpa, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do P/VP"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatDecimal(indicators.pbRatio)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Preço / Valor Patr.</div>
          </div>

          {/* 3. Dividend Yield */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Dividend Yield</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'dividendYield',
                      'Dividend Yield',
                      '(Proventos Declarados / Ações) / Cotação',
                      [
                        { label: 'Proventos Totais', value: formatCurrency(statement.dividendsDeclared, statement.currency) },
                        { label: 'Ações Emitidas', value: formatShares(statement.sharesCount) },
                        { label: 'Cotação Base', value: quoteAudit ? formatCurrency(quoteAudit.quotePriceUsed, statement.currency) : '—' },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do Dividend Yield"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.dividendYield)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Proventos Decl. / Cotação</div>
          </div>

          {/* 4. ROE */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">ROE</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'roe',
                      'ROE (Return on Equity)',
                      'Lucro Líquido / Patrimônio Líquido',
                      [
                        { label: 'Lucro Líquido', value: formatCurrency(statement.netIncome, statement.currency) },
                        { label: 'Patrimônio Líquido', value: formatCurrency(statement.totalEquity, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do ROE"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.roe)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Retorno s/ Patr. Líquido</div>
          </div>

          {/* 5. ROIC (Novo na Etapa 5.2) */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">ROIC</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'roic',
                      'ROIC (Retorno sobre o Capital Investido)',
                      'NOPAT / Capital Investido = [EBIT * (1 - t)] / [Patrimônio Líquido + Dívida Bruta - Caixa]',
                      [
                        { label: 'EBIT (ou EBITDA aprox.)', value: formatCurrency(statement.ebitda, statement.currency) },
                        { label: 'Patrimônio Líquido', value: formatCurrency(statement.totalEquity, statement.currency) },
                        { label: 'Dívida Bruta', value: formatCurrency(statement.grossDebt, statement.currency) },
                        { label: 'Caixa e Equivalentes', value: formatCurrency(statement.cashEquivalents, statement.currency) },
                      ],
                      ['Quando EBIT não está diretamente disponível no demonstrativo, utiliza-se EBITDA como aproximação operacional; o resultado pode diferir do ROIC teórico contábil.']
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do ROIC"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.roic)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Retorno s/ Cap. Investido</div>
          </div>

          {/* 6. ROA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">ROA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'roa',
                      'ROA (Return on Assets)',
                      'Lucro Líquido / Ativo Total',
                      [
                        { label: 'Lucro Líquido', value: formatCurrency(statement.netIncome, statement.currency) },
                        { label: 'Ativo Total', value: formatCurrency(statement.totalAssets, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do ROA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.roa)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Retorno s/ Ativo Total</div>
          </div>

          {/* 7. Margem Líquida */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Margem Líquida</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'netMargin',
                      'Margem Líquida',
                      'Lucro Líquido / Receita Líquida',
                      [
                        { label: 'Lucro Líquido', value: formatCurrency(statement.netIncome, statement.currency) },
                        { label: 'Receita Líquida', value: formatCurrency(statement.netRevenue, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo da Margem Líquida"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.netMargin)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Lucro Líq. / Receita</div>
          </div>

          {/* 8. Margem EBITDA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Margem EBITDA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'ebitdaMargin',
                      'Margem EBITDA',
                      'EBITDA / Receita Líquida',
                      [
                        { label: 'EBITDA', value: formatCurrency(statement.ebitda, statement.currency) },
                        { label: 'Receita Líquida', value: formatCurrency(statement.netRevenue, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo da Margem EBITDA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatPercent(indicators.ebitdaMargin)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">EBITDA / Receita</div>
          </div>

          {/* 9. LPA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">LPA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'lpa',
                      'LPA (Lucro por Ação)',
                      'Lucro Líquido / Ações Emitidas',
                      [
                        { label: 'Lucro Líquido', value: formatCurrency(statement.netIncome, statement.currency) },
                        { label: 'Total de Ações', value: formatShares(statement.sharesCount) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do LPA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatCurrency(indicators.lpa, statement.currency)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Lucro por Ação</div>
          </div>

          {/* 10. VPA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">VPA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'vpa',
                      'VPA (Valor Patrimonial por Ação)',
                      'Patrimônio Líquido / Ações Emitidas',
                      [
                        { label: 'Patrimônio Líquido', value: formatCurrency(statement.totalEquity, statement.currency) },
                        { label: 'Total de Ações', value: formatShares(statement.sharesCount) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do VPA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatCurrency(indicators.vpa, statement.currency)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Valor Patr. por Ação</div>
          </div>

          {/* 11. Enterprise Value / EV (Novo na Etapa 5.2) */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Enterprise Value (EV)</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'enterpriseValue',
                      'Enterprise Value (EV)',
                      'Valor de Mercado (Cotação * Ações) + Dívida Líquida',
                      [
                        { label: 'Cotação Base', value: quoteAudit ? formatCurrency(quoteAudit.quotePriceUsed, statement.currency) : '—' },
                        { label: 'Ações Emitidas', value: formatShares(statement.sharesCount) },
                        { label: 'Dívida Líquida', value: formatCurrency(indicators.netDebt, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do EV"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatCurrency(indicators.enterpriseValue, statement.currency)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Valor da Firma (Cap + Dív. Líq.)</div>
          </div>

          {/* 12. EV / EBITDA (Novo na Etapa 5.2) */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">EV / EBITDA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'evToEbitda',
                      'EV / EBITDA',
                      'Enterprise Value / EBITDA',
                      [
                        { label: 'Enterprise Value', value: formatCurrency(indicators.enterpriseValue, statement.currency) },
                        { label: 'EBITDA', value: formatCurrency(statement.ebitda, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo do EV/EBITDA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatDecimal(indicators.evToEbitda)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Múltiplo da Firma / EBITDA</div>
          </div>

          {/* 13. Dívida Líquida / EBITDA */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Dív. Líquida / EBITDA</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'netDebtToEbitda',
                      'Dívida Líquida / EBITDA',
                      'Dívida Líquida / EBITDA',
                      [
                        { label: 'Dívida Líquida', value: formatCurrency(indicators.netDebt, statement.currency) },
                        { label: 'EBITDA', value: formatCurrency(statement.ebitda, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo de Dív. Líquida / EBITDA"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatDecimal(indicators.netDebtToEbitda)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Alavancagem Financeira</div>
          </div>

          {/* 14. Dívida Bruta / PL (Novo na Etapa 5.2) */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Dív. Bruta / PL</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'grossDebtToEquity',
                      'Dívida Bruta / PL',
                      'Dívida Bruta / Patrimônio Líquido',
                      [
                        { label: 'Dívida Bruta', value: formatCurrency(statement.grossDebt, statement.currency) },
                        { label: 'Patrimônio Líquido', value: formatCurrency(statement.totalEquity, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo de Dív. Bruta / PL"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5">
                {formatDecimal(indicators.grossDebtToEquity)}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">Endividamento Bruto / PL</div>
          </div>

          {/* 15. Dívida Líquida / PL com Caixa Líquido (Novo na Etapa 5.2) */}
          <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-text-muted font-medium">Dív. Líquida / PL</div>
                <button
                  type="button"
                  onClick={() =>
                    openTraceability(
                      'netDebtToEquity',
                      'Dívida Líquida / PL',
                      'Dívida Líquida / Patrimônio Líquido',
                      [
                        { label: 'Dívida Líquida', value: formatCurrency(indicators.netDebt, statement.currency) },
                        { label: 'Patrimônio Líquido', value: formatCurrency(statement.totalEquity, statement.currency) },
                      ]
                    )
                  }
                  className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
                  aria-label="Ver memória de cálculo de Dív. Líquida / PL"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </button>
              </div>
              <div className="text-lg font-bold text-text-primary mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{formatDecimal(indicators.netDebtToEquity)}</span>
                {isNetCash && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Caixa Líquido
                  </span>
                )}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {isNetCash ? 'Disponibilidades > Dívida Bruta' : 'Dív. Líq. / Patr. Líquido'}
            </div>
          </div>
        </div>

        {/* Nota explicativa de aproximação do ROIC via EBITDA */}
        {indicators.roic && (
          <div className="mt-3 text-[11px] text-text-muted bg-surface-elevated/40 p-2.5 rounded-lg border border-border-theme leading-relaxed">
            <strong className="text-text-secondary font-semibold">Nota Metodológica ROIC:</strong>{' '}
            Aproximação operacional via EBITDA (EBIT contábil não desagregado na fonte).
          </div>
        )}

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

      {/* 4. Demonstrativos Contábeis Brutos e Grandeza Derivada */}
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

      {/* 5. Aviso Regulatório de Neutralidade */}
      <div className="text-[11px] text-text-muted bg-surface-elevated/40 p-3 rounded-lg border border-border-theme">
        <strong className="text-text-secondary">Finalidade Informativa e Educacional:</strong> Os indicadores apresentados são calculados de forma determinística com base nas demonstrações financeiras oficiais divulgadas pela companhia. O CarteiraExpert não formula recomendações de investimento, análise preditiva, classificação de risco ou consultoria de valores mobiliários.
      </div>

      {/* 6. Modal de Rastreabilidade Factual de Indicadores */}
      <IndicatorTraceabilityModal
        open={modalState.open}
        onClose={() => setModalState((prev) => ({ ...prev, open: false }))}
        title={modalState.title}
        formula={modalState.formula}
        inputs={modalState.inputs}
        notes={modalState.notes}
        methodology={modalState.methodology}
      />
    </div>
  );
}
