'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { OptionsDisclaimerBanner } from './OptionsDisclaimerBanner';
import { OptionsAlertsBanner } from './OptionsAlertsBanner';
import { OptionsContractList } from './OptionsContractList';
import { OptionsContractForm } from './OptionsContractForm';
import { OptionsGreeksCard } from './OptionsGreeksCard';
import { OptionsPayoffChart } from './OptionsPayoffChart';
import {
  listUserOptionsAction,
  getUserOptionAlertsAction,
  getOptionContractAnalyticsAction,
  calculateCustomGreeksAction,
  simulatePayoffAction,
} from '../server/options.actions';
import type {
  SerializedOptionContract,
  SerializedOptionProximityAlert,
  SerializedOptionAnalytics,
  SerializedGreeksResult,
  SerializedPayoffAnalysis,
} from '../domain/options.types';

interface PortfolioOption {
  id: string;
  name: string;
}

interface AssetOption {
  id: string;
  ticker: string;
  name: string;
}

interface CustodyAccountOption {
  id: string;
  name: string;
  portfolioId: string;
}

interface OptionsDashboardViewProps {
  initialOptions: SerializedOptionContract[];
  initialAlerts: SerializedOptionProximityAlert[];
  portfolios: PortfolioOption[];
  assets: AssetOption[];
  custodyAccounts?: CustodyAccountOption[];
}

export function OptionsDashboardView({
  initialOptions,
  initialAlerts,
  portfolios,
  assets,
  custodyAccounts = [],
}: OptionsDashboardViewProps) {
  const [options, setOptions] = useState<SerializedOptionContract[]>(initialOptions);
  const [alerts, setAlerts] = useState<SerializedOptionProximityAlert[]>(initialAlerts);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    initialOptions[0]?.id ?? null
  );

  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'CALCULATOR'>('POSITIONS');
  const [isCreatingModal, setIsCreatingModal] = useState<boolean>(false);

  // Analytics do contrato selecionado
  const [analytics, setAnalytics] = useState<SerializedOptionAnalytics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Estado da Calculadora Avulsa
  const [calcSpot, setCalcSpot] = useState<string>('38.00');
  const [calcStrike, setCalcStrike] = useState<string>('38.00');
  const [calcDays, setCalcDays] = useState<string>('21');
  const [calcVol, setCalcVol] = useState<string>('35.0');
  const [calcRate, setCalcRate] = useState<string>('10.5');
  const [calcType, setCalcType] = useState<'CALL' | 'PUT'>('CALL');
  const [calcDir, setCalcDir] = useState<'BUY' | 'SELL'>('BUY');
  const [calcPremium, setCalcPremium] = useState<string>('1.50');
  const [standaloneGreeks, setStandaloneGreeks] = useState<SerializedGreeksResult | null>(null);
  const [standalonePayoff, setStandalonePayoff] = useState<SerializedPayoffAnalysis | null>(null);

  // Carregar analytics quando o contrato selecionado mudar
  useEffect(() => {
    if (!selectedContractId) {
      setAnalytics(null);
      return;
    }

    let isMounted = true;
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);

    getOptionContractAnalyticsAction(selectedContractId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setAnalytics(res.data);
        } else {
          setAnalyticsError(res.error);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setAnalyticsError(err instanceof Error ? err.message : 'Erro ao apurar analytics.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingAnalytics(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedContractId]);

  // Recarregar lista e alertas quando houver mutação
  async function refreshData() {
    const [optRes, alertRes] = await Promise.all([
      listUserOptionsAction(),
      getUserOptionAlertsAction(),
    ]);

    if (optRes.success) {
      setOptions(optRes.data);
      if (!optRes.data.some((o) => o.id === selectedContractId)) {
        setSelectedContractId(optRes.data[0]?.id ?? null);
      }
    }
    if (alertRes.success) {
      setAlerts(alertRes.data);
    }
  }

  // Executar cálculo da calculadora avulsa
  async function handleRunStandaloneCalculator(e: React.FormEvent) {
    e.preventDefault();
    try {
      const daysNum = Math.max(0, Number(calcDays));
      const years = (daysNum / 252).toFixed(6);

      const [greeksRes, payoffRes] = await Promise.all([
        calculateCustomGreeksAction({
          spotPrice: calcSpot,
          strikePrice: calcStrike,
          timeToExpirationYears: years,
          riskFreeRate: (Number(calcRate) / 100).toFixed(4),
          volatility: (Number(calcVol) / 100).toFixed(4),
          optionType: calcType,
          direction: calcDir,
          premium: calcPremium,
        }),
        simulatePayoffAction({
          strikePrice: calcStrike,
          premium: calcPremium,
          quantity: '100',
          optionType: calcType,
          direction: calcDir,
          currentSpotPrice: calcSpot,
        }),
      ]);

      if (greeksRes.success) setStandaloneGreeks(greeksRes.data);
      if (payoffRes.success) setStandalonePayoff(payoffRes.data);
    } catch {
      // Falha silenciosa ou log
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Módulo Operacional de Opções
            </h1>
            <p className="text-sm text-text-secondary">
              Controle descritivo de contratos, alertas de vencimento da B3 e apuração de gregas informativas por Black-Scholes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border-theme p-1 bg-surface-subtle text-xs">
              <button
                type="button"
                id="tab-minhas-posicoes"
                onClick={() => setActiveTab('POSITIONS')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  activeTab === 'POSITIONS'
                    ? 'bg-surface text-text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Minhas Posições ({options.length})
              </button>
              <button
                type="button"
                id="tab-simulador-avulso"
                onClick={() => setActiveTab('CALCULATOR')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  activeTab === 'CALCULATOR'
                    ? 'bg-surface text-text-primary shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Simulador Avulso de Gregas
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Aviso Regulatório Obrigatório */}
      <OptionsDisclaimerBanner />

      {/* Alertas de Proximidade (D-5 a D-0) */}
      <OptionsAlertsBanner
        alerts={alerts}
        onSelectOption={(id) => {
          setSelectedContractId(id);
          setActiveTab('POSITIONS');
        }}
      />

      {/* Aba 1: Minhas Posições */}
      {activeTab === 'POSITIONS' && (
        <div className="space-y-6">
          {isCreatingModal && (
            <OptionsContractForm
              portfolios={portfolios}
              assets={assets}
              custodyAccounts={custodyAccounts}
              onSuccess={(created) => {
                setIsCreatingModal(false);
                refreshData();
                setSelectedContractId(created.id);
              }}
              onCancel={() => setIsCreatingModal(false)}
            />
          )}

          <OptionsContractList
            options={options}
            selectedContractId={selectedContractId}
            onSelectOption={(id) => setSelectedContractId(id)}
            onOpenNewModal={() => setIsCreatingModal(true)}
            onOptionUpdated={refreshData}
          />

          {/* Seção de Análise do Contrato Selecionado */}
          {selectedContractId && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-text-primary tracking-tight">
                  Detalhamento Analítico Teórico
                </h3>
                {isLoadingAnalytics && (
                  <span className="text-xs text-text-muted flex items-center gap-1.5">
                    <span className="animate-spin" aria-hidden="true">⏳</span> Calculando modelo...
                  </span>
                )}
              </div>

              {analyticsError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-400"
                >
                  {analyticsError}
                </div>
              )}

              {analytics && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <OptionsGreeksCard
                    contract={analytics.contract}
                    initialGreeks={analytics.greeks}
                    businessDaysRemaining={analytics.expirationStatus.businessDays}
                  />

                  <OptionsPayoffChart
                    ticker={analytics.contract.ticker}
                    optionType={analytics.contract.optionType}
                    direction={analytics.contract.direction}
                    payoff={analytics.payoff}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Aba 2: Calculadora / Simulador Avulso de Gregas */}
      {activeTab === 'CALCULATOR' && (
        <div className="space-y-6">
          <form
            onSubmit={handleRunStandaloneCalculator}
            className="rounded-xl border border-border-theme bg-surface p-5 sm:p-6 shadow-sm space-y-5"
          >
            <div className="border-b border-border-theme pb-3">
              <h3 className="text-base font-semibold text-text-primary tracking-tight">
                Simulador Independente de Black-Scholes e Curvas de Payoff
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Calcule gregas e analise cenários de qualquer contrato hipotético sem necessidade de persistir em banco.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="calc-type" className="block text-xs font-medium text-text-secondary mb-1">
                  Tipo de Opção
                </label>
                <select
                  id="calc-type"
                  value={calcType}
                  onChange={(e) => setCalcType(e.target.value as 'CALL' | 'PUT')}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                >
                  <option value="CALL">CALL (Compra)</option>
                  <option value="PUT">PUT (Venda)</option>
                </select>
              </div>

              <div>
                <label htmlFor="calc-dir" className="block text-xs font-medium text-text-secondary mb-1">
                  Direção da Posição
                </label>
                <select
                  id="calc-dir"
                  value={calcDir}
                  onChange={(e) => setCalcDir(e.target.value as 'BUY' | 'SELL')}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                >
                  <option value="BUY">Titular (Comprada)</option>
                  <option value="SELL">Lançador (Vendida)</option>
                </select>
              </div>

              <div>
                <label htmlFor="calc-spot" className="block text-xs font-medium text-text-secondary mb-1">
                  Preço Ativo-Objeto (R$)
                </label>
                <input
                  id="calc-spot"
                  type="text"
                  value={calcSpot}
                  onChange={(e) => setCalcSpot(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>

              <div>
                <label htmlFor="calc-strike" className="block text-xs font-medium text-text-secondary mb-1">
                  Preço de Exercício / Strike (R$)
                </label>
                <input
                  id="calc-strike"
                  type="text"
                  value={calcStrike}
                  onChange={(e) => setCalcStrike(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>

              <div>
                <label htmlFor="calc-days" className="block text-xs font-medium text-text-secondary mb-1">
                  Dias Úteis até o Vencimento (DU)
                </label>
                <input
                  id="calc-days"
                  type="number"
                  value={calcDays}
                  onChange={(e) => setCalcDays(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>

              <div>
                <label htmlFor="calc-vol" className="block text-xs font-medium text-text-secondary mb-1">
                  Volatilidade Implícita (% a.a.)
                </label>
                <input
                  id="calc-vol"
                  type="text"
                  value={calcVol}
                  onChange={(e) => setCalcVol(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>

              <div>
                <label htmlFor="calc-rate" className="block text-xs font-medium text-text-secondary mb-1">
                  Taxa Livre de Risco (% a.a.)
                </label>
                <input
                  id="calc-rate"
                  type="text"
                  value={calcRate}
                  onChange={(e) => setCalcRate(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>

              <div>
                <label htmlFor="calc-prem" className="block text-xs font-medium text-text-secondary mb-1">
                  Prêmio Unitário Negociado (R$)
                </label>
                <input
                  id="calc-prem"
                  type="text"
                  value={calcPremium}
                  onChange={(e) => setCalcPremium(e.target.value)}
                  className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                id="btn-calcular-avulso"
                className="px-4 py-2 rounded-lg bg-action-primary hover:bg-action-primary-hover text-action-primary-text text-xs font-semibold shadow-sm transition-all"
              >
                Calcular Gregas e Payoff
              </button>
            </div>
          </form>

          {standaloneGreeks && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <OptionsGreeksCard
                contract={{
                  id: 'standalone-sim',
                  userId: 'sim',
                  portfolioId: 'sim',
                  underlyingAssetId: 'sim',
                  ticker: `OPÇÃO ${calcType} ${calcStrike}`,
                  optionType: calcType,
                  optionStyle: 'AMERICAN',
                  direction: calcDir,
                  strikePrice: calcStrike,
                  premiumPaidReceived: calcPremium,
                  quantity: '100',
                  expirationDate: '—',
                  status: 'OPEN',
                }}
                initialGreeks={standaloneGreeks}
                businessDaysRemaining={Number(calcDays)}
              />

              {standalonePayoff && (
                <OptionsPayoffChart
                  ticker={`OPÇÃO ${calcType} ${calcStrike}`}
                  optionType={calcType}
                  direction={calcDir}
                  payoff={standalonePayoff}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
