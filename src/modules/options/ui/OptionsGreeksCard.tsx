import React, { useState, useMemo } from 'react';
import type { SerializedGreeksResult, SerializedOptionContract } from '../domain/options.types';
import { calculateBlackScholesGreeks } from '../domain/black-scholes-engine';
import { Decimal, toDecimal } from '@/lib/decimal';

interface OptionsGreeksCardProps {
  contract: SerializedOptionContract;
  initialGreeks: SerializedGreeksResult;
  businessDaysRemaining: number;
}

export function OptionsGreeksCard({
  contract,
  initialGreeks,
  businessDaysRemaining,
}: OptionsGreeksCardProps) {
  // Parâmetros interativos de simulação
  const [simSpot, setSimSpot] = useState<string>(contract.strikePrice);
  const [simVol, setSimVol] = useState<string>('35.0');
  const [simRate, setSimRate] = useState<string>('10.5');

  // Recálculo reativo on-the-fly das gregas com os parâmetros simulados
  const greeks = useMemo<SerializedGreeksResult>(() => {
    try {
      const s = toDecimal(simSpot);
      const k = toDecimal(contract.strikePrice);
      const days = Math.max(0, businessDaysRemaining);
      const t = new Decimal(days).div(new Decimal('252'));
      const r = toDecimal(simRate).div(new Decimal('100'));
      const vol = toDecimal(simVol).div(new Decimal('100'));

      if (s.lessThanOrEqualTo(0) || vol.lessThanOrEqualTo(0) || r.isNegative()) {
        return initialGreeks;
      }

      const res = calculateBlackScholesGreeks({
        spotPrice: s,
        strikePrice: k,
        timeToExpirationYears: t,
        riskFreeRate: r,
        volatility: vol,
        optionType: contract.optionType,
        direction: contract.direction,
        premium: toDecimal(contract.premiumPaidReceived),
      });

      return {
        theoreticalPrice: res.theoreticalPrice.toFixed(2),
        delta: res.delta.toFixed(4),
        gamma: res.gamma.toFixed(4),
        theta: res.theta.toFixed(4),
        vega: res.vega.toFixed(4),
        rho: res.rho.toFixed(4),
        moneyness: res.moneyness,
        intrinsicValue: res.intrinsicValue.toFixed(2),
        extrinsicValue: res.extrinsicValue.toFixed(2),
        breakevenPrice: res.breakevenPrice.toFixed(2),
      };
    } catch {
      return initialGreeks;
    }
  }, [simSpot, simVol, simRate, contract, businessDaysRemaining, initialGreeks]);

  const moneynessColor =
    greeks.moneyness === 'ITM'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : greeks.moneyness === 'ATM'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
      : 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30';

  const moneynessLabel =
    greeks.moneyness === 'ITM'
      ? 'In The Money (No Dinheiro)'
      : greeks.moneyness === 'ATM'
      ? 'At The Money (No Dinheiro / Limite)'
      : 'Out of The Money (Fora do Dinheiro)';

  return (
    <div
      id="options-greeks-card"
      role="region"
      aria-label="Painel de Gregas Informativas Black-Scholes"
      className="rounded-xl border border-border-theme bg-surface p-5 sm:p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-theme pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-text-primary tracking-tight">
              Gregas Informativas (Black-Scholes)
            </h3>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${moneynessColor}`}
              title={moneynessLabel}
            >
              {greeks.moneyness}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Sensibilidade teórica de {contract.ticker} ({contract.optionType} Strike R$ {contract.strikePrice})
          </p>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-text-muted block">Preço Teórico</span>
          <span className="text-lg font-bold text-text-primary">
            R$ {greeks.theoreticalPrice}
          </span>
        </div>
      </div>

      {/* Grid de Gregas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Delta */}
        <div className="rounded-lg bg-surface-hover/50 border border-border-theme/60 p-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold text-text-primary">Delta (Δ)</span>
            <span className="text-[10px]">dC/dS</span>
          </div>
          <div className="text-sm font-bold text-text-primary">{greeks.delta}</div>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">
            Variação da opção por R$ 1,00 no ativo-objeto
          </p>
        </div>

        {/* Gamma */}
        <div className="rounded-lg bg-surface-hover/50 border border-border-theme/60 p-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold text-text-primary">Gamma (Γ)</span>
            <span className="text-[10px]">d²C/dS²</span>
          </div>
          <div className="text-sm font-bold text-text-primary">{greeks.gamma}</div>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">
            Aceleração do Delta por R$ 1,00 no ativo
          </p>
        </div>

        {/* Theta */}
        <div className="rounded-lg bg-surface-hover/50 border border-border-theme/60 p-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold text-text-primary">Theta (Θ)</span>
            <span className="text-[10px]">dia útil</span>
          </div>
          <div className="text-sm font-bold text-rose-500">{greeks.theta}</div>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">
            Decaimento por passagem de 1 dia útil (base 252)
          </p>
        </div>

        {/* Vega */}
        <div className="rounded-lg bg-surface-hover/50 border border-border-theme/60 p-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold text-text-primary">Vega (ν)</span>
            <span className="text-[10px]">por 1% vol</span>
          </div>
          <div className="text-sm font-bold text-text-primary">{greeks.vega}</div>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">
            Sensibilidade a 1% de oscilação na vol implícita
          </p>
        </div>

        {/* Rho */}
        <div className="rounded-lg bg-surface-hover/50 border border-border-theme/60 p-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span className="font-semibold text-text-primary">Rho (ρ)</span>
            <span className="text-[10px]">por 1% juros</span>
          </div>
          <div className="text-sm font-bold text-text-primary">{greeks.rho}</div>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">
            Sensibilidade a 1% na taxa livre de risco
          </p>
        </div>
      </div>

      {/* Decomposição de Valor Intrínseco e Extrínseco */}
      <div className="rounded-lg border border-border-theme bg-surface-subtle p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium text-text-secondary">Composição Teórica do Preço:</span>
          <span className="font-bold text-text-primary">
            R$ {greeks.theoreticalPrice} = R$ {greeks.intrinsicValue} (Intrínseco) + R$ {greeks.extrinsicValue} (Tempo)
          </span>
        </div>
        <div className="w-full bg-border-theme/40 h-2 rounded-full overflow-hidden flex">
          {Number(greeks.theoreticalPrice) > 0 ? (
            <>
              <div
                style={{
                  width: `${Math.min(
                    100,
                    (Number(greeks.intrinsicValue) / Number(greeks.theoreticalPrice)) * 100
                  )}%`,
                }}
                className="bg-emerald-500 h-full"
                title={`Valor Intrínseco: R$ ${greeks.intrinsicValue}`}
              />
              <div
                style={{
                  width: `${Math.min(
                    100,
                    (Number(greeks.extrinsicValue) / Number(greeks.theoreticalPrice)) * 100
                  )}%`,
                }}
                className="bg-indigo-500 h-full"
                title={`Valor Extrínseco (Tempo): R$ ${greeks.extrinsicValue}`}
              />
            </>
          ) : (
            <div className="w-full bg-zinc-400 h-full opacity-50" />
          )}
        </div>
        <div className="flex justify-between text-[11px] text-text-muted">
          <span>Valor Intrínseco: R$ {greeks.intrinsicValue}</span>
          <span>Valor Extrínseco (Valor Tempo): R$ {greeks.extrinsicValue}</span>
          <span>Breakeven: R$ {greeks.breakevenPrice}</span>
        </div>
      </div>

      {/* Simulador de Cenários Interativo */}
      <div className="rounded-lg border border-border-theme/70 bg-surface p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">
            Simulador de Cenários em Tempo Real
          </span>
          <button
            type="button"
            onClick={() => {
              setSimSpot(contract.strikePrice);
              setSimVol('35.0');
              setSimRate('10.5');
            }}
            className="text-[11px] text-action-primary hover:underline"
          >
            Redefinir Padrões
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="sim-spot" className="block text-[11px] font-medium text-text-secondary mb-1">
              Preço Ativo-Objeto (R$)
            </label>
            <input
              id="sim-spot"
              type="text"
              value={simSpot}
              onChange={(e) => setSimSpot(e.target.value)}
              className="w-full rounded border border-border-theme bg-surface px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
            />
          </div>
          <div>
            <label htmlFor="sim-vol" className="block text-[11px] font-medium text-text-secondary mb-1">
              Volatilidade Implícita (% a.a.)
            </label>
            <input
              id="sim-vol"
              type="text"
              value={simVol}
              onChange={(e) => setSimVol(e.target.value)}
              className="w-full rounded border border-border-theme bg-surface px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
            />
          </div>
          <div>
            <label htmlFor="sim-rate" className="block text-[11px] font-medium text-text-secondary mb-1">
              Taxa Livre de Risco (% a.a.)
            </label>
            <input
              id="sim-rate"
              type="text"
              value={simRate}
              onChange={(e) => setSimRate(e.target.value)}
              className="w-full rounded border border-border-theme bg-surface px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
