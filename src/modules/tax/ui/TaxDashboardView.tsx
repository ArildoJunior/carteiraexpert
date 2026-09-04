'use client';

import React, { useState, useTransition } from 'react';
import { TaxDisclaimerBanner } from './TaxDisclaimerBanner';
import { TaxPreferencesModal } from './TaxPreferencesModal';
import { TaxAnnualReportView } from './TaxAnnualReportView';
import { executeTaxCalculationAction } from '../server/tax.actions';
import type {
  SerializedTaxAnnualReport,
  SerializedUserTaxPreferences,
} from '../domain/tax.types';

interface PortfolioOption {
  id: string;
  name: string;
}

interface TaxDashboardViewProps {
  initialReport: SerializedTaxAnnualReport;
  initialPreferences: SerializedUserTaxPreferences;
  portfolios: PortfolioOption[];
  currentYear: number;
}

export function TaxDashboardView({
  initialReport,
  initialPreferences,
  portfolios,
  currentYear,
}: TaxDashboardViewProps) {
  const [report, setReport] = useState<SerializedTaxAnnualReport>(initialReport);
  const [preferences, setPreferences] = useState<SerializedUserTaxPreferences>(initialPreferences);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('ALL');
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Anos disponíveis: do ano corrente até 5 anos atrás
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const handleRecalculate = (force = false) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await executeTaxCalculationAction({
          year: selectedYear,
          portfolioId: selectedPortfolioId === 'ALL' ? null : selectedPortfolioId,
          forceRecalculate: force,
        });

        if (!res.success) {
          setErrorMessage(res.error);
          return;
        }

        setReport(res.data);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao processar apuração fiscal.');
      }
    });
  };

  const onYearChange = (year: number) => {
    setSelectedYear(year);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await executeTaxCalculationAction({
          year,
          portfolioId: selectedPortfolioId === 'ALL' ? null : selectedPortfolioId,
          forceRecalculate: false,
        });

        if (!res.success) {
          setErrorMessage(res.error);
          return;
        }

        setReport(res.data);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao carregar dados do ano.');
      }
    });
  };

  const onPortfolioChange = (pId: string) => {
    setSelectedPortfolioId(pId);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await executeTaxCalculationAction({
          year: selectedYear,
          portfolioId: pId === 'ALL' ? null : pId,
          forceRecalculate: false,
        });

        if (!res.success) {
          setErrorMessage(res.error);
          return;
        }

        setReport(res.data);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao filtrar por carteira.');
      }
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Módulo Fiscal e Apoio ao IRPF
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Apuração contínua de ganho de capital, controle de prejuízos e relatórios auxiliares para declaração anual.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="open-tax-preferences-button"
            type="button"
            onClick={() => setIsPreferencesOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-elevated transition-colors shadow-sm"
          >
            ⚙️ Parâmetros Fiscais
          </button>
          <button
            id="recalculate-tax-button"
            type="button"
            disabled={isPending}
            onClick={() => handleRecalculate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Apurando...' : '🔄 Recalcular Ano'}
          </button>
        </div>
      </div>

      {/* Banner Regulatório Obrigatório */}
      <TaxDisclaimerBanner />

      {/* Barra de Filtros (Ano e Carteira) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label
              htmlFor="tax-year-select"
              className="block text-2xs uppercase tracking-wider font-semibold text-text-muted mb-1"
            >
              Ano-Calendário
            </label>
            <select
              id="tax-year-select"
              value={selectedYear}
              disabled={isPending}
              onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-text-primary focus:border-brand-primary focus:outline-none"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Exercício {y + 1} (Ano-base {y})
                </option>
              ))}
            </select>
          </div>

          {portfolios.length > 0 && (
            <div>
              <label
                htmlFor="tax-portfolio-select"
                className="block text-2xs uppercase tracking-wider font-semibold text-text-muted mb-1"
              >
                Carteira
              </label>
              <select
                id="tax-portfolio-select"
                value={selectedPortfolioId}
                disabled={isPending}
                onChange={(e) => onPortfolioChange(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-text-primary focus:border-brand-primary focus:outline-none"
              >
                <option value="ALL">Todas as Carteiras Consolidadas</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="text-right text-xs text-text-muted">
          <span>
            Limite de Isenção em Ações:{' '}
            <strong className="text-text-primary">
              R$ {parseFloat(preferences.exemptThresholdBrl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
            </strong>
          </span>
          <span className="mx-2">•</span>
          <span>
            Alíquota Padrão:{' '}
            <strong className="text-text-primary">
              {(parseFloat(preferences.defaultCapitalGainsRate) * 100).toFixed(1)}%
            </strong>
          </span>
        </div>
      </div>

      {/* Alerta de Erro se houver */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-semibold text-rose-400"
        >
          {errorMessage}
        </div>
      )}

      {/* Visualizador Anual Principal */}
      <TaxAnnualReportView report={report} preferences={preferences} />

      {/* Modal de Preferências Fiscais */}
      <TaxPreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        preferences={preferences}
        onSaved={(updated) => {
          setPreferences(updated);
          handleRecalculate(true);
        }}
      />
    </div>
  );
}
