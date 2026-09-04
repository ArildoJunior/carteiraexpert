'use client';

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Decimal } from '@/lib/decimal';
import type {
  ContributionTiming,
  SerializedMonthlyProjectionPoint,
  SerializedProjectionResultSet,
} from '../domain/projection.types';
import {
  calculateProjections,
  serializeProjectionResultSet,
} from '../domain/projection-engine';
import { projectionPremisesInputSchema } from '../domain/projection.schema';

function formatBrl(valStr: string | null | undefined): string {
  if (!valStr) return 'R$ 0,00';
  try {
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    return `${isNegative ? '-' : ''}R$ ${integerPart},${decimalPart}`;
  } catch {
    return '—';
  }
}

function formatPercent(valStr: string | null | undefined): string {
  if (!valStr) return '0,00%';
  try {
    const d = new Decimal(valStr);
    const parts = d.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    return `${integerPart},${decimalPart}%`;
  } catch {
    return '—';
  }
}

export function CompoundInterestSimulator() {
  // Parâmetros editáveis da simulação
  const [initialCapitalInput, setInitialCapitalInput] = useState<string>('10000');
  const [monthlyContributionInput, setMonthlyContributionInput] = useState<string>('1000');
  const [annualRatePercentInput, setAnnualRatePercentInput] = useState<string>('10.0');
  const [annualInflationPercentInput, setAnnualInflationPercentInput] = useState<string>('4.0');
  const [dividendYieldPercentInput, setDividendYieldPercentInput] = useState<string>('6.0');
  const [totalYearsInput, setTotalYearsInput] = useState<number>(10);
  const [timing, setTiming] = useState<ContributionTiming>('END_OF_PERIOD');

  // Controles de visualização da tabela
  const [tableFrequency, setTableFrequency] = useState<'ANNUAL' | 'MONTHLY'>('ANNUAL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Validação e cálculo determinístico reativo
  const calculation = useMemo<{
    resultSet: SerializedProjectionResultSet | null;
    error: string | null;
  }>(() => {
    try {
      const annualRateDecimal = new Decimal(annualRatePercentInput || '0').dividedBy(100).toString();
      const annualInflationDecimal = new Decimal(annualInflationPercentInput || '0').dividedBy(100).toString();
      const dyDecimal = new Decimal(dividendYieldPercentInput || '0').dividedBy(100).toString();
      const totalMonths = Math.max(1, Math.min(600, Math.round(totalYearsInput * 12)));

      const parseResult = projectionPremisesInputSchema.safeParse({
        initialCapital: initialCapitalInput || '0',
        monthlyContribution: monthlyContributionInput || '0',
        annualInterestRate: annualRateDecimal,
        annualInflationRate: annualInflationDecimal,
        targetDividendYield: dyDecimal,
        totalMonths,
        contributionTiming: timing,
      });

      if (!parseResult.success) {
        const firstError = parseResult.error.issues[0]?.message || 'Premissas de simulação inválidas';
        return { resultSet: null, error: firstError };
      }

      const domainResultSet = calculateProjections({
        initialCapital: new Decimal(parseResult.data.initialCapital),
        monthlyContribution: new Decimal(parseResult.data.monthlyContribution),
        annualInterestRate: new Decimal(parseResult.data.annualInterestRate),
        annualInflationRate: new Decimal(parseResult.data.annualInflationRate),
        targetDividendYield: new Decimal(parseResult.data.targetDividendYield),
        totalMonths: parseResult.data.totalMonths,
        contributionTiming: parseResult.data.contributionTiming,
      });

      const serialized = serializeProjectionResultSet(domainResultSet);
      return { resultSet: serialized, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar simulação financeira';
      return { resultSet: null, error: msg };
    }
  }, [
    initialCapitalInput,
    monthlyContributionInput,
    annualRatePercentInput,
    annualInflationPercentInput,
    dividendYieldPercentInput,
    totalYearsInput,
    timing,
  ]);

  const { resultSet, error } = calculation;

  // Dados para o gráfico temporal
  const chartData = useMemo(() => {
    if (!resultSet) return [];
    return resultSet.timeline.map((point) => ({
      month: point.month,
      year: Math.floor(point.month / 12),
      nominal: Number(point.nominalBalance),
      real: Number(point.realBalance),
      contributed: Number(point.accumulatedContributions),
      interest: Number(point.accumulatedInterest),
    }));
  }, [resultSet]);

  // Dados para a tabela (anual ou mensal paginada)
  const filteredTablePoints = useMemo<SerializedMonthlyProjectionPoint[]>(() => {
    if (!resultSet) return [];
    if (tableFrequency === 'ANNUAL') {
      return resultSet.timeline.filter(
        (p) => p.month % 12 === 0 || p.month === resultSet.timeline.length
      );
    }
    return resultSet.timeline;
  }, [resultSet, tableFrequency]);

  const totalTablePages = Math.max(1, Math.ceil(filteredTablePoints.length / pageSize));
  const paginatedTablePoints = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTablePoints.slice(start, start + pageSize);
  }, [filteredTablePoints, currentPage, pageSize]);

  return (
    <div className="w-full space-y-8" id="compound-interest-simulator">
      {/* Cabeçalho da Seção */}
      <div className="border-b border-border-theme pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-action-primary/10 text-action-primary border border-action-primary/20 mb-3">
              <span>Módulo de Projeções Financeiras</span>
              <span className="w-1 h-1 rounded-full bg-action-primary" />
              <span>Etapa 7</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
              Simulador de Juros Compostos e Aportes
            </h1>
            <p className="mt-1 text-sm text-text-secondary max-w-2xl">
              Projeção matemática determinística de crescimento patrimonial, acumulação de juros,
              preservação do poder de compra frente à inflação e estimativa de renda passiva.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-text-secondary bg-surface-elevated border border-border-theme px-3 py-2 rounded-lg">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Motor 100% Determinístico em Decimal</span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Parâmetros de Entrada e KPIs Resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel de Controles / Premissas (4 colunas) */}
        <div className="lg:col-span-5 space-y-5 bg-surface rounded-xl border border-border-theme p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border-theme pb-3">
            <h2 className="text-base font-semibold text-text-primary">
              Premissas da Simulação
            </h2>
            <span className="text-xs text-text-secondary">Configurável</span>
          </div>

          {/* Capital Inicial */}
          <div className="space-y-1.5">
            <label
              htmlFor="sim-initial-capital"
              className="text-xs font-semibold text-text-primary flex justify-between"
            >
              <span>Capital Inicial</span>
              <span className="text-text-secondary font-normal">Valor de partida</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-text-secondary">
                R$
              </span>
              <input
                id="sim-initial-capital"
                type="number"
                min="0"
                step="1000"
                value={initialCapitalInput}
                onChange={(e) => setInitialCapitalInput(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-action-primary"
                placeholder="10000"
              />
            </div>
          </div>

          {/* Aporte Mensal */}
          <div className="space-y-1.5">
            <label
              htmlFor="sim-monthly-contribution"
              className="text-xs font-semibold text-text-primary flex justify-between"
            >
              <span>Aporte Mensal Recorrente</span>
              <span className="text-text-secondary font-normal">Investimento mensal</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-text-secondary">
                R$
              </span>
              <input
                id="sim-monthly-contribution"
                type="number"
                min="0"
                step="100"
                value={monthlyContributionInput}
                onChange={(e) => setMonthlyContributionInput(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-action-primary"
                placeholder="1000"
              />
            </div>
          </div>

          {/* Taxas Anuais: Juros e Inflação em 2 Colunas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="sim-annual-rate"
                className="text-xs font-semibold text-text-primary flex justify-between"
              >
                <span>Taxa Anual (Nominal)</span>
              </label>
              <div className="relative">
                <input
                  id="sim-annual-rate"
                  type="number"
                  step="0.5"
                  min="-50"
                  max="200"
                  value={annualRatePercentInput}
                  onChange={(e) => setAnnualRatePercentInput(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-action-primary"
                  placeholder="10.0"
                />
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-text-secondary">
                  % a.a.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="sim-annual-inflation"
                className="text-xs font-semibold text-text-primary flex justify-between"
              >
                <span>Inflação Anual (IPCA)</span>
              </label>
              <div className="relative">
                <input
                  id="sim-annual-inflation"
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={annualInflationPercentInput}
                  onChange={(e) => setAnnualInflationPercentInput(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-action-primary"
                  placeholder="4.0"
                />
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-text-secondary">
                  % a.a.
                </span>
              </div>
            </div>
          </div>

          {/* Dividend Yield Alvo */}
          <div className="space-y-1.5">
            <label
              htmlFor="sim-dividend-yield"
              className="text-xs font-semibold text-text-primary flex justify-between"
            >
              <span>Dividend Yield Projetado</span>
              <span className="text-text-secondary font-normal">Para renda passiva</span>
            </label>
            <div className="relative">
              <input
                id="sim-dividend-yield"
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={dividendYieldPercentInput}
                onChange={(e) => setDividendYieldPercentInput(e.target.value)}
                className="w-full pl-3 pr-8 py-2 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-action-primary"
                placeholder="6.0"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-text-secondary">
                % a.a.
              </span>
            </div>
          </div>

          {/* Prazo em Anos / Meses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-text-primary">
              <label htmlFor="sim-years-slider">Prazo da Simulação</label>
              <span className="text-action-primary font-bold">
                {totalYearsInput} anos ({totalYearsInput * 12} meses)
              </span>
            </div>
            <input
              id="sim-years-slider"
              type="range"
              min="1"
              max="40"
              step="1"
              value={totalYearsInput}
              onChange={(e) => {
                setTotalYearsInput(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full accent-action-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-text-secondary">
              <span>1 ano</span>
              <span>10 anos</span>
              <span>20 anos</span>
              <span>30 anos</span>
              <span>40 anos</span>
            </div>
          </div>

          {/* Momento do Aporte (Antecipado vs Postecipado) */}
          <div className="space-y-1.5 pt-2 border-t border-border-theme">
            <span className="text-xs font-semibold text-text-primary">Momento dos Aportes</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="sim-timing-end"
                onClick={() => setTiming('END_OF_PERIOD')}
                className={`text-xs py-2 px-3 rounded-lg border font-medium transition-colors text-center ${
                  timing === 'END_OF_PERIOD'
                    ? 'border-action-primary bg-action-primary/10 text-action-primary font-semibold'
                    : 'border-border-theme bg-surface-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                Fim do Mês (Postecipado)
              </button>
              <button
                type="button"
                id="sim-timing-start"
                onClick={() => setTiming('BEGINNING_OF_PERIOD')}
                className={`text-xs py-2 px-3 rounded-lg border font-medium transition-colors text-center ${
                  timing === 'BEGINNING_OF_PERIOD'
                    ? 'border-action-primary bg-action-primary/10 text-action-primary font-semibold'
                    : 'border-border-theme bg-surface-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                Início do Mês (Antecipado)
              </button>
            </div>
          </div>

          {/* Erro de Validação se houver */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Painel de Resultados Agregados e KPIs (7 colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {resultSet ? (
            <>
              {/* Cards de Métricas Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Saldo Final Nominal */}
                <div className="p-5 rounded-xl border border-border-theme bg-surface shadow-xs space-y-1">
                  <span className="text-xs font-semibold text-text-secondary">
                    Patrimônio Final (Nominal)
                  </span>
                  <p className="text-2xl sm:text-3xl font-extrabold text-positive-text tracking-tight">
                    {formatBrl(resultSet.summary.finalNominalBalance)}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    Total bruto acumulado ao término de {resultSet.premises.totalMonths} meses
                  </p>
                </div>

                {/* Saldo Final Real */}
                <div className="p-5 rounded-xl border border-border-theme bg-surface shadow-xs space-y-1">
                  <span className="text-xs font-semibold text-text-secondary">
                    Patrimônio Final (Poder de Compra Real)
                  </span>
                  <p className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
                    {formatBrl(resultSet.summary.finalRealBalance)}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    Descontada a inflação anual de {formatPercent(new Decimal(resultSet.premises.annualInflationRate).times(100).toString())}
                  </p>
                </div>

                {/* Total Aportado */}
                <div className="p-5 rounded-xl border border-border-theme bg-surface shadow-xs space-y-1">
                  <span className="text-xs font-semibold text-text-secondary">
                    Total Efetivamente Aportado
                  </span>
                  <p className="text-xl sm:text-2xl font-bold text-text-primary">
                    {formatBrl(resultSet.summary.totalContributed)}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    Capital inicial + soma de todos os aportes mensais
                  </p>
                </div>

                {/* Total de Juros e Rendimentos */}
                <div className="p-5 rounded-xl border border-border-theme bg-surface shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-secondary">
                      Total em Juros Acumulados
                    </span>
                    <span className="text-xs font-bold text-action-primary bg-action-primary/10 px-2 py-0.5 rounded">
                      {formatPercent(resultSet.summary.interestSharePercentage)} do total
                    </span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-positive-text">
                    {formatBrl(resultSet.summary.totalInterestEarned)}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    Ganho gerado pelo efeito exponencial dos juros compostos
                  </p>
                </div>
              </div>

              {/* Bloco de Renda Passiva e Marcos da Simulação */}
              <div className="p-5 rounded-xl border border-border-theme bg-surface shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-border-theme pb-3 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      Projeção de Renda Passiva Estimada
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Com base no Dividend Yield de {formatPercent(new Decimal(resultSet.premises.targetDividendYield).times(100).toString())} a.a.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-text-secondary block">Rendimento Mensal Médio</span>
                    <span className="text-lg font-bold text-positive-text">
                      {formatBrl(resultSet.summary.projectedMonthlyDividends)}
                      <span className="text-xs font-normal text-text-secondary"> /mês</span>
                    </span>
                  </div>
                </div>

                {/* Indicadores de Marcos Relevantes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme text-xs space-y-1">
                    <span className="font-semibold text-text-primary block">
                      Ponto de Inflexão (Crossover)
                    </span>
                    {resultSet.summary.crossoverMonth ? (
                      <p className="text-text-secondary">
                        No <strong className="text-text-primary">Mês {resultSet.summary.crossoverMonth}</strong> (~
                        {(resultSet.summary.crossoverMonth / 12).toFixed(1)} anos), os juros mensais superam o aporte
                        de {formatBrl(resultSet.premises.monthlyContribution)}.
                      </p>
                    ) : (
                      <p className="text-text-secondary">
                        Os rendimentos não superam os aportes dentro do horizonte simulado.
                      </p>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-surface-elevated border border-border-theme text-xs space-y-1">
                    <span className="font-semibold text-text-primary block">
                      Duplicação do Capital Inicial
                    </span>
                    {resultSet.summary.timeToDoubleInitialMonths ? (
                      <p className="text-text-secondary">
                        O patrimônio dobra o capital inicial no{' '}
                        <strong className="text-text-primary">
                          Mês {resultSet.summary.timeToDoubleInitialMonths}
                        </strong>{' '}
                        (~{(resultSet.summary.timeToDoubleInitialMonths / 12).toFixed(1)} anos).
                      </p>
                    ) : (
                      <p className="text-text-secondary">
                        Capital inicial nulo ou duplicação além do prazo configurado.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-8 rounded-xl border border-dashed border-border-theme bg-surface text-center">
              <p className="text-sm text-text-secondary">
                Ajuste os parâmetros à esquerda para visualizar a projeção patrimonial.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gráfico de Evolução Temporal */}
      {resultSet && chartData.length > 0 && (
        <div className="p-6 rounded-xl border border-border-theme bg-surface shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-theme pb-4">
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Curva de Evolução Patrimonial
              </h2>
              <p className="text-xs text-text-secondary">
                Comparação entre Saldo Nominal, Saldo Real (deflacionado) e Total Aportado
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-3 h-3 rounded-xs bg-[#059669]" /> Saldo Nominal
              </span>
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-3 h-3 rounded-xs bg-[#6366F1]" /> Saldo Real
              </span>
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-3 h-3 rounded-xs bg-[#94A3B8]" /> Total Aportado
              </span>
            </div>
          </div>

          <div className="w-full h-[360px] pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="nominalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m) => (m % 12 === 0 ? `Ano ${m / 12}` : '')}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(val) => {
                    if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
                    if (val >= 1000) return `R$ ${(val / 1000).toFixed(0)}k`;
                    return `R$ ${val}`;
                  }}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    const formatted = formatBrl(num.toFixed(2));
                    if (name === 'nominal') return [formatted, 'Saldo Nominal'];
                    if (name === 'real') return [formatted, 'Saldo Real'];
                    if (name === 'contributed') return [formatted, 'Total Aportado'];
                    if (name === 'interest') return [formatted, 'Juros Acumulados'];
                    return [formatted, String(name)];
                  }}
                  labelFormatter={(m) => `Mês ${m} (~${(Number(m) / 12).toFixed(1)} anos)`}
                  contentStyle={{
                    backgroundColor: 'var(--color-surface, #FFFFFF)',
                    borderColor: 'var(--color-border-theme, #E2E8F0)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="nominal"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#nominalGrad)"
                  name="nominal"
                />
                <Area
                  type="monotone"
                  dataKey="real"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#realGrad)"
                  name="real"
                />
                <Line
                  type="monotone"
                  dataKey="contributed"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="contributed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabela de Evolução Detalhada */}
      {resultSet && filteredTablePoints.length > 0 && (
        <div className="p-6 rounded-xl border border-border-theme bg-surface shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-theme pb-4">
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Tabela de Evolução da Acumulação
              </h2>
              <p className="text-xs text-text-secondary">
                Detalhamento período a período de aportes, juros, saldos e proventos projetados
              </p>
            </div>

            {/* Toggle de Frequência da Tabela */}
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-border-theme p-0.5 bg-surface-elevated">
                <button
                  type="button"
                  id="btn-table-annual"
                  onClick={() => {
                    setTableFrequency('ANNUAL');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    tableFrequency === 'ANNUAL'
                      ? 'bg-action-primary text-action-primary-text shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Resumo Anual
                </button>
                <button
                  type="button"
                  id="btn-table-monthly"
                  onClick={() => {
                    setTableFrequency('MONTHLY');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    tableFrequency === 'MONTHLY'
                      ? 'bg-action-primary text-action-primary-text shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Todos os Meses
                </button>
              </div>
            </div>
          </div>

          {/* Tabela Responsiva */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-text-primary" id="table-projections">
              <thead className="bg-surface-elevated border-b border-border-theme text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3">Período</th>
                  <th className="py-3 px-3">Aporte no Mês</th>
                  <th className="py-3 px-3">Juros no Mês</th>
                  <th className="py-3 px-3">Total Aportado</th>
                  <th className="py-3 px-3">Saldo Nominal</th>
                  <th className="py-3 px-3">Saldo Real (Poder de Compra)</th>
                  <th className="py-3 px-3">Proventos Mensais Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {paginatedTablePoints.map((point) => {
                  const isAnnualMilestone = point.month % 12 === 0;
                  return (
                    <tr
                      key={point.month}
                      className={`hover:bg-surface-elevated/50 transition-colors ${
                        isAnnualMilestone ? 'font-medium bg-surface-elevated/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        Mês {point.month}{' '}
                        {isAnnualMilestone && (
                          <span className="text-[10px] text-action-primary font-bold ml-1">
                            (Ano {point.month / 12})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-text-secondary">
                        {formatBrl(point.contribution)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-positive-text font-medium">
                        +{formatBrl(point.monthlyInterestEarned)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-text-secondary">
                        {formatBrl(point.accumulatedContributions)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-bold text-text-primary">
                        {formatBrl(point.nominalBalance)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-text-secondary">
                        {formatBrl(point.realBalance)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-positive-text">
                        {formatBrl(point.projectedMonthlyDividends)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação da Tabela */}
          {totalTablePages > 1 && (
            <div className="flex items-center justify-between border-t border-border-theme pt-3 text-xs text-text-secondary">
              <div>
                Página {currentPage} de {totalTablePages} ({filteredTablePoints.length} registros)
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="btn-pagination-prev"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  className="px-2.5 py-1 rounded border border-border-theme bg-surface-elevated disabled:opacity-40 hover:text-text-primary"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  id="btn-pagination-next"
                  disabled={currentPage >= totalTablePages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalTablePages, prev + 1))}
                  className="px-2.5 py-1 rounded border border-border-theme bg-surface-elevated disabled:opacity-40 hover:text-text-primary"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aviso Regulatório e Educacional CVM Obrigatório */}
      <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-900 dark:text-amber-200 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
          <svg
            className="w-4 h-4 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Aviso Regulatório e Educacional (CVM)</span>
        </div>
        <p className="leading-relaxed">
          {resultSet?.disclaimer ||
            'Esta simulação tem finalidade exclusivamente educacional e organizacional. Não constitui recomendação de investimento nem garantia de rentabilidade futura. Simulações determinísticas utilizam taxas constantes e não contemplam oscilações de mercado, tributação (IR/IOF), custos operacionais de corretagem ou eventos societários. Moeda de referência: Real (BRL).'}
        </p>
      </div>
    </div>
  );
}
