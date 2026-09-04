'use client';

import React, { useState, useMemo } from 'react';
import { Decimal } from '@/lib/decimal';
import type {
  SerializedTheoreticalValuationResultSet,
  ValuationCalculationStatus,
  ValuationFundamentalContext,
  ValuationQuoteContext,
} from '@/modules/market-data/domain/theoretical-valuation.types';
import {
  calculateTheoreticalValuations,
  serializeTheoreticalValuationResultSet,
} from '@/modules/market-data/domain/theoretical-valuation-engine';

export interface TheoreticalValuationCardProps {
  valuationData?: SerializedTheoreticalValuationResultSet | null;
  isLoading?: boolean;
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
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    return `${isNegative ? '-' : '+'}${integerPart},${decimalPart}%`;
  } catch {
    return '—';
  }
}

function formatRate(valStr: string | null | undefined): string {
  if (!valStr) return '—';
  try {
    const d = new Decimal(valStr).times(100);
    return `${d.toFixed(1).replace('.', ',')}%`;
  } catch {
    return '—';
  }
}

function getStatusBadge(status: ValuationCalculationStatus) {
  switch (status) {
    case 'VALID':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          Cálculo Válido
        </span>
      );
    case 'NOT_APPLICABLE':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          Não Aplicável
        </span>
      );
    case 'INSUFFICIENT_DATA':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-elevated text-text-muted border border-border-theme">
          Dados Insuficientes
        </span>
      );
    case 'INVALID_PREMISES':
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          Premissas Inválidas
        </span>
      );
  }
}

export function TheoreticalValuationCard({
  valuationData,
  isLoading = false,
}: TheoreticalValuationCardProps) {
  // Estado local para simulação interativa de premissas pelo usuário
  const [showSimulator, setShowSimulator] = useState(false);

  // Premissas locais interativas
  const [bazinDyInput, setBazinDyInput] = useState<string>('6.0');
  const [grahamMultiplierInput, setGrahamMultiplierInput] = useState<string>('22.5');
  const [dcfDiscountRateInput, setDcfDiscountRateInput] = useState<string>('12.0');
  const [dcfGrowthRateInput, setDcfGrowthRateInput] = useState<string>('8.0');
  const [dcfTerminalGrowthInput, setDcfTerminalGrowthInput] = useState<string>('3.0');
  const [dcfYearsInput, setDcfYearsInput] = useState<number>(5);

  // Se o usuário estiver simulando premissas customizadas, recalcula localmente de forma determinística
  const activeData: SerializedTheoreticalValuationResultSet | null = useMemo(() => {
    if (!valuationData) return null;
    if (!showSimulator) return valuationData;

    try {
      // Reconstrói contexto contábil básico dos fatos reportados
      const rawNetIncome = valuationData.graham.factualInputs.netIncome;
      const rawEquity = valuationData.graham.factualInputs.totalEquity;
      const rawShares = valuationData.graham.factualInputs.sharesCount;
      const rawDivs = valuationData.bazin.factualInputs.dividendsDeclared;

      const fundamentalContext: ValuationFundamentalContext = {
        netRevenue: null,
        ebitda: null,
        netIncome: rawNetIncome ? new Decimal(rawNetIncome) : null,
        totalEquity: rawEquity ? new Decimal(rawEquity) : null,
        totalAssets: null,
        grossDebt: null,
        cashEquivalents: null,
        sharesCount: rawShares ? new Decimal(rawShares) : null,
        dividendsDeclared: rawDivs ? new Decimal(rawDivs) : null,
        currency: valuationData.currency,
        referencePeriod: valuationData.referencePeriod,
        referenceDate: valuationData.quoteAudit?.quoteDateUsed || new Date(),
        statementType: valuationData.statementType,
      };

      const quoteContext: ValuationQuoteContext | null = valuationData.quoteAudit
        ? {
            price: new Decimal(valuationData.quoteAudit.quotePriceUsed),
            quoteDate: valuationData.quoteAudit.quoteDateUsed,
            source: valuationData.quoteAudit.quoteSource,
            delayStatus: valuationData.quoteAudit.quoteDelayStatus,
            isStale: valuationData.quoteAudit.isQuoteStale,
            currency: valuationData.quoteAudit.currency,
          }
        : null;

      const customPremises = {
        bazin: {
          targetDividendYield: new Decimal(bazinDyInput || '6.0').dividedBy(100),
        },
        graham: {
          grahamMultiplier: new Decimal(grahamMultiplierInput || '22.5'),
        },
        dcf: {
          discountRate: new Decimal(dcfDiscountRateInput || '12.0').dividedBy(100),
          growthRateStage1: new Decimal(dcfGrowthRateInput || '8.0').dividedBy(100),
          terminalGrowthRate: new Decimal(dcfTerminalGrowthInput || '3.0').dividedBy(100),
          projectionYears: dcfYearsInput,
        },
      };

      const recalculated = calculateTheoreticalValuations(
        valuationData.assetId,
        valuationData.ticker,
        fundamentalContext,
        quoteContext,
        customPremises
      );

      return serializeTheoreticalValuationResultSet(recalculated);
    } catch {
      return valuationData;
    }
  }, [
    valuationData,
    showSimulator,
    bazinDyInput,
    grahamMultiplierInput,
    dcfDiscountRateInput,
    dcfGrowthRateInput,
    dcfTerminalGrowthInput,
    dcfYearsInput,
  ]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-theme">
          <div className="space-y-2">
            <div className="h-6 w-64 bg-surface-elevated rounded-md" />
            <div className="h-4 w-44 bg-surface-elevated/70 rounded-md" />
          </div>
          <div className="h-8 w-28 bg-surface-elevated rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`skel-val-${i}`} className="h-48 bg-surface-elevated rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!activeData) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-6 text-center text-text-muted space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Modelos Teóricos de Valuation
        </h4>
        <p className="text-xs text-text-muted max-w-lg mx-auto leading-relaxed">
          Demonstrações financeiras necessárias para cálculo dos modelos teóricos ainda não disponíveis para este ativo.
        </p>
        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-medium bg-surface-elevated border border-border-theme text-text-muted">
          Décio Bazin • Benjamin Graham • DCF Simplificado
        </span>
      </div>
    );
  }

  const { bazin, graham, dcf, currency, quoteAudit, currencyMismatch } = activeData;

  const handleResetDefaults = () => {
    setBazinDyInput('6.0');
    setGrahamMultiplierInput('22.5');
    setDcfDiscountRateInput('12.0');
    setDcfGrowthRateInput('8.0');
    setDcfTerminalGrowthInput('3.0');
    setDcfYearsInput(5);
    setShowSimulator(false);
  };

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6">
      {/* 1. Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-theme">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-text-primary">
              Modelos Teóricos de Valuation
            </h3>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-brand/10 text-brand border border-brand/20">
              {activeData.referencePeriod}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-surface-elevated border border-border-theme text-text-secondary">
              {activeData.statementType === 'CONSOLIDATED' ? 'Consolidado' : 'Individual'}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Estimativas matemáticas baseadas em demonstrativos oficiais e premissas de precificação teórica.
          </p>
        </div>

        {/* Botão de Toggle do Simulador */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSimulator(!showSimulator)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              showSimulator
                ? 'bg-brand text-brand-foreground border-brand'
                : 'bg-surface-elevated text-text-secondary border-border-theme hover:bg-surface-elevated/80'
            }`}
          >
            {showSimulator ? 'Ocultar Parâmetros' : 'Ajustar Premissas'}
          </button>
          {showSimulator && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary border border-border-theme bg-surface hover:bg-surface-elevated transition-colors"
            >
              Restaurar Padrões
            </button>
          )}
        </div>
      </div>

      {/* 2. Painel Colapsável de Ajuste de Premissas (Simulador Interativo) */}
      {showSimulator && (
        <div className="p-4 rounded-xl bg-surface-elevated/70 border border-brand/20 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand">
              Simulador Interativo de Premissas
            </h4>
            <span className="text-[11px] text-text-muted">
              Cálculo puramente local e determinístico
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Premissa Bazin: DY Alvo */}
            <div className="space-y-1.5">
              <label htmlFor="sim-bazin-dy" className="block text-text-secondary font-medium">
                Bazin: DY Alvo (%)
              </label>
              <div className="relative">
                <input
                  id="sim-bazin-dy"
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={bazinDyInput}
                  onChange={(e) => setBazinDyInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                />
                <span className="absolute right-3 top-1.5 text-text-muted text-xs">%</span>
              </div>
              <p className="text-[10px] text-text-muted">Padrão: 6,0% ao ano</p>
            </div>

            {/* Premissa Graham: Multiplicador */}
            <div className="space-y-1.5">
              <label htmlFor="sim-graham-mult" className="block text-text-secondary font-medium">
                Graham: Multiplicador
              </label>
              <input
                id="sim-graham-mult"
                type="number"
                step="0.5"
                min="1"
                max="50"
                value={grahamMultiplierInput}
                onChange={(e) => setGrahamMultiplierInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
              />
              <p className="text-[10px] text-text-muted">Padrão: 22,5 (15 P/L x 1,5 P/VP)</p>
            </div>

            {/* Premissa DCF: Taxa de Desconto (WACC) */}
            <div className="space-y-1.5">
              <label htmlFor="sim-dcf-wacc" className="block text-text-secondary font-medium">
                DCF: Taxa de Desconto (r)
              </label>
              <div className="relative">
                <input
                  id="sim-dcf-wacc"
                  type="number"
                  step="0.5"
                  min="4"
                  max="30"
                  value={dcfDiscountRateInput}
                  onChange={(e) => setDcfDiscountRateInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                />
                <span className="absolute right-3 top-1.5 text-text-muted text-xs">%</span>
              </div>
              <p className="text-[10px] text-text-muted">Padrão: 12,0% ao ano</p>
            </div>

            {/* Premissa DCF: Crescimento Fase 1 */}
            <div className="space-y-1.5">
              <label htmlFor="sim-dcf-g1" className="block text-text-secondary font-medium">
                DCF: Crescimento Inicial (g1)
              </label>
              <div className="relative">
                <input
                  id="sim-dcf-g1"
                  type="number"
                  step="0.5"
                  min="-20"
                  max="50"
                  value={dcfGrowthRateInput}
                  onChange={(e) => setDcfGrowthRateInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                />
                <span className="absolute right-3 top-1.5 text-text-muted text-xs">%</span>
              </div>
              <p className="text-[10px] text-text-muted">Padrão: 8,0% ao ano (5 anos)</p>
            </div>

            {/* Premissa DCF: Crescimento Perpétuo */}
            <div className="space-y-1.5">
              <label htmlFor="sim-dcf-gt" className="block text-text-secondary font-medium">
                DCF: Crescimento Terminal (gt)
              </label>
              <div className="relative">
                <input
                  id="sim-dcf-gt"
                  type="number"
                  step="0.25"
                  min="0"
                  max="8"
                  value={dcfTerminalGrowthInput}
                  onChange={(e) => setDcfTerminalGrowthInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                />
                <span className="absolute right-3 top-1.5 text-text-muted text-xs">%</span>
              </div>
              <p className="text-[10px] text-text-muted">Padrão: 3,0% (deve ser menor que r)</p>
            </div>

            {/* Premissa DCF: Anos de Projeção */}
            <div className="space-y-1.5">
              <label htmlFor="sim-dcf-years" className="block text-text-secondary font-medium">
                DCF: Anos Explícitos (N)
              </label>
              <input
                id="sim-dcf-years"
                type="number"
                step="1"
                min="1"
                max="10"
                value={dcfYearsInput}
                onChange={(e) => setDcfYearsInput(Number.parseInt(e.target.value, 10) || 5)}
                className="w-full px-3 py-1.5 rounded-md bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
              />
              <p className="text-[10px] text-text-muted">Padrão: 5 anos de projeção</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Grid dos 3 Modelos Teóricos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Preço Teto de Bazin */}
        <div className="rounded-xl bg-surface-elevated border border-border-theme p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Décio Bazin
              </span>
              {getStatusBadge(bazin.status)}
            </div>

            <h4 className="text-sm font-semibold text-text-primary">
              Preço Teto de Bazin
            </h4>

            {bazin.status === 'VALID' ? (
              <div className="pt-2">
                <div className="text-2xl font-extrabold text-text-primary">
                  {formatCurrency(bazin.intrinsicValue, currency)}
                </div>
                {bazin.marginOfSafetyPercent !== null && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                    <span className="text-text-muted">Margem de segurança:</span>
                    <span
                      className={`font-bold ${
                        Number(bazin.marginOfSafetyPercent) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatPercent(bazin.marginOfSafetyPercent)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-2 text-xs text-text-muted bg-surface/60 p-2.5 rounded-lg border border-border-theme">
                {bazin.statusReason || 'Não aplicável para este ativo.'}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border-theme text-[11px] space-y-1.5">
            <div className="flex justify-between text-text-muted">
              <span>Proventos por Ação (DPA):</span>
              <span className="font-semibold text-text-primary">
                {formatCurrency(bazin.factualInputs.dpa, currency)}
              </span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>DY Alvo Adotado:</span>
              <span className="font-semibold text-text-primary">
                {formatRate(bazin.premisesUsed.targetDividendYield)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Fórmula de Benjamin Graham */}
        <div className="rounded-xl bg-surface-elevated border border-border-theme p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Benjamin Graham
              </span>
              {getStatusBadge(graham.status)}
            </div>

            <h4 className="text-sm font-semibold text-text-primary">
              Fórmula de Graham
            </h4>

            {graham.status === 'VALID' ? (
              <div className="pt-2">
                <div className="text-2xl font-extrabold text-text-primary">
                  {formatCurrency(graham.intrinsicValue, currency)}
                </div>
                {graham.marginOfSafetyPercent !== null && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                    <span className="text-text-muted">Margem de segurança:</span>
                    <span
                      className={`font-bold ${
                        Number(graham.marginOfSafetyPercent) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatPercent(graham.marginOfSafetyPercent)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-2 text-xs text-text-muted bg-surface/60 p-2.5 rounded-lg border border-border-theme">
                {graham.statusReason || 'Não aplicável para este ativo.'}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border-theme text-[11px] space-y-1.5">
            <div className="flex justify-between text-text-muted">
              <span>LPA / VPA:</span>
              <span className="font-semibold text-text-primary">
                {formatCurrency(graham.factualInputs.lpa, currency)} / {formatCurrency(graham.factualInputs.vpa, currency)}
              </span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>Multiplicador Graham:</span>
              <span className="font-semibold text-text-primary">
                {graham.premisesUsed.grahamMultiplier}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: DCF Simplificado */}
        <div className="rounded-xl bg-surface-elevated border border-border-theme p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                DCF 2 Estágios
              </span>
              {getStatusBadge(dcf.status)}
            </div>

            <h4 className="text-sm font-semibold text-text-primary">
              DCF Simplificado
            </h4>

            {dcf.status === 'VALID' ? (
              <div className="pt-2">
                <div className="text-2xl font-extrabold text-text-primary">
                  {formatCurrency(dcf.intrinsicValue, currency)}
                </div>
                {dcf.marginOfSafetyPercent !== null && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                    <span className="text-text-muted">Margem de segurança:</span>
                    <span
                      className={`font-bold ${
                        Number(dcf.marginOfSafetyPercent) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatPercent(dcf.marginOfSafetyPercent)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-2 text-xs text-text-muted bg-surface/60 p-2.5 rounded-lg border border-border-theme">
                {dcf.statusReason || 'Não aplicável para este ativo.'}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border-theme text-[11px] space-y-1.5">
            <div className="flex justify-between text-text-muted">
              <span>Taxa Desconto / Cresc.:</span>
              <span className="font-semibold text-text-primary">
                {formatRate(dcf.premisesUsed.discountRate)} / {formatRate(dcf.premisesUsed.growthRateStage1)}
              </span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>Cresc. Perpétuo / Anos:</span>
              <span className="font-semibold text-text-primary">
                {formatRate(dcf.premisesUsed.terminalGrowthRate)} ({dcf.premisesUsed.projectionYears}a)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Auditoria de Cotação de Referência */}
      {quoteAudit && (
        <div className="p-3 rounded-lg bg-surface-elevated/40 border border-border-theme text-[11px] text-text-muted flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-text-secondary">Cotação base para margem de segurança:</span>{' '}
            {formatCurrency(quoteAudit.quotePriceUsed, quoteAudit.currency)} (
            {quoteAudit.quoteSource === 'cotahist' ? 'B3 COTAHIST Fechamento' : 'Cotação de Mercado'})
          </div>
          <div>
            {quoteAudit.isQuoteStale && (
              <span className="text-amber-500 font-medium mr-2">• Cotação de pregão anterior</span>
            )}
          </div>
        </div>
      )}

      {currencyMismatch && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
          Aviso: A moeda da cotação difere da moeda contábil do demonstrativo. O cálculo de margem de segurança foi suprimido para evitar distorções cambiais.
        </div>
      )}

      {/* 5. Aviso Regulatório Obrigatório de Neutralidade */}
      <div className="text-[11px] text-text-muted bg-surface-elevated/30 p-3.5 rounded-lg border border-border-theme leading-relaxed">
        <strong className="text-text-secondary">Finalidade Informativa e Educacional (CVM):</strong>{' '}
        {activeData.globalDisclaimer}
      </div>
    </div>
  );
}
