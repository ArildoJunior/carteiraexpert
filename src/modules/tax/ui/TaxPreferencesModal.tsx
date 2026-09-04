import React, { useState } from 'react';
import type { SerializedUserTaxPreferences } from '../domain/tax.types';
import { saveUserTaxPreferencesAction } from '../server/tax.actions';

interface TaxPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: SerializedUserTaxPreferences;
  onSaved: (updated: SerializedUserTaxPreferences) => void;
}

export function TaxPreferencesModal({
  isOpen,
  onClose,
  preferences,
  onSaved,
}: TaxPreferencesModalProps) {
  const [capitalGainsRate, setCapitalGainsRate] = useState(
    (parseFloat(preferences.defaultCapitalGainsRate) * 100).toFixed(1)
  );
  const [exemptThreshold, setExemptThreshold] = useState(preferences.exemptThresholdBrl);
  const [dayTradeRate, setDayTradeRate] = useState(
    (parseFloat(preferences.dayTradeRate) * 100).toFixed(1)
  );
  const [includeDayTrade, setIncludeDayTrade] = useState(preferences.includeDayTrade);
  const [compensationEnabled, setCompensationEnabled] = useState(preferences.compensationEnabled);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const decCapRate = (parseFloat(capitalGainsRate) / 100).toFixed(4);
      const decDayRate = (parseFloat(dayTradeRate) / 100).toFixed(4);

      const res = await saveUserTaxPreferencesAction({
        defaultCapitalGainsRate: decCapRate,
        exemptThresholdBrl: parseFloat(exemptThreshold).toFixed(2),
        dayTradeRate: decDayRate,
        includeDayTrade,
        compensationEnabled,
      });

      if (!res.success) {
        setErrorMessage(res.error);
        return;
      }

      onSaved(res.data);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao salvar preferências.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tax-preferences-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 id="tax-preferences-title" className="text-lg font-bold text-text-primary">
            Configuração de Parâmetros Fiscais
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 font-medium"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label
              htmlFor="tax-pref-cap-rate"
              className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1"
            >
              Alíquota Padrão Mercado à Vista (Swing Trade %)
            </label>
            <input
              id="tax-pref-cap-rate"
              type="number"
              step="0.1"
              min="0"
              max="30"
              value={capitalGainsRate}
              onChange={(e) => setCapitalGainsRate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-brand-primary focus:outline-none"
              required
            />
            <p className="text-2xs text-text-muted mt-1">Padrão legal brasileiro: 15% (0.1500).</p>
          </div>

          <div>
            <label
              htmlFor="tax-pref-exempt-threshold"
              className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1"
            >
              Limite Mensal de Isenção em Ações (R$)
            </label>
            <input
              id="tax-pref-exempt-threshold"
              type="number"
              step="100"
              min="0"
              max="10000000"
              value={exemptThreshold}
              onChange={(e) => setExemptThreshold(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-brand-primary focus:outline-none"
              required
            />
            <p className="text-2xs text-text-muted mt-1">
              Padrão legal vigente: R$ 20.000,00 mensais em vendas de ações.
            </p>
          </div>

          <div>
            <label
              htmlFor="tax-pref-daytrade-rate"
              className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1"
            >
              Alíquota Day-Trade (%)
            </label>
            <input
              id="tax-pref-daytrade-rate"
              type="number"
              step="0.1"
              min="0"
              max="30"
              value={dayTradeRate}
              onChange={(e) => setDayTradeRate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary focus:border-brand-primary focus:outline-none"
              required
            />
            <p className="text-2xs text-text-muted mt-1">Padrão legal: 20% (sem isenção de 20k).</p>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                id="tax-pref-include-daytrade"
                type="checkbox"
                checked={includeDayTrade}
                onChange={(e) => setIncludeDayTrade(e.target.checked)}
                className="rounded border-border text-brand-primary focus:ring-0"
              />
              <span className="text-xs text-text-primary font-medium">
                Separar e tributar operações de Day-Trade
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                id="tax-pref-compensation"
                type="checkbox"
                checked={compensationEnabled}
                onChange={(e) => setCompensationEnabled(e.target.checked)}
                className="rounded border-border text-brand-primary focus:ring-0"
              />
              <span className="text-xs text-text-primary font-medium">
                Habilitar compensação contínua de prejuízos acumulados (FIFO)
              </span>
            </label>
          </div>

          <div className="rounded-lg bg-surface-elevated p-3 text-2xs text-text-muted">
            ⚠️ As preferências aqui alteradas personalizam as estimativas informativas do motor, mas não
            isentam o usuário da legislação tributária em vigor no país.
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-elevated transition-colors"
            >
              Cancelar
            </button>
            <button
              id="save-tax-preferences-button"
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Salvando...' : 'Salvar Preferências'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
