'use client';

import { useState } from 'react';
import type { CspAssetClass, CspWeightingMethod } from '@/modules/market-data/domain/csp.types';
import {
  type CspSimulationInput,
  cspSimulationInputSchema,
} from '@/modules/market-data/domain/csp.schema';

export interface CspParameterFormProps {
  onSubmit: (input: CspSimulationInput) => void;
  isLoading?: boolean;
  className?: string;
}

export function CspParameterForm({
  onSubmit,
  isLoading = false,
  className = '',
}: CspParameterFormProps) {
  // Estado local controlado
  const [assetClass, setAssetClass] = useState<CspAssetClass>('STOCK');
  const [weightingMethod, setWeightingMethod] = useState<CspWeightingMethod>('MARGEM_SEGURANCA');
  const [minMarginOfSafetyPercent, setMinMarginOfSafetyPercent] = useState<string>('0.00');
  const [maxNetDebtToEbitda, setMaxNetDebtToEbitda] = useState<string>('3.50');
  const [maxNetDebtToEquity, setMaxNetDebtToEquity] = useState<string>('2.00');
  const [minRoe, setMinRoe] = useState<string>('0.05');
  const [maxStaleDays, setMaxStaleDays] = useState<number>(5);
  const [maxWeightPerAsset, setMaxWeightPerAsset] = useState<string>('0.20');
  const [maxWeightPerSector, setMaxWeightPerSector] = useState<string>('0.40');
  const [evaluationDate, setEvaluationDate] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);

  const handleResetDefaults = () => {
    setAssetClass('STOCK');
    setWeightingMethod('MARGEM_SEGURANCA');
    setMinMarginOfSafetyPercent('0.00');
    setMaxNetDebtToEbitda('3.50');
    setMaxNetDebtToEquity('2.00');
    setMinRoe('0.05');
    setMaxStaleDays(5);
    setMaxWeightPerAsset('0.20');
    setMaxWeightPerSector('0.40');
    setEvaluationDate('');
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      assetClass,
      weightingMethod,
      criteria: {
        minMarginOfSafetyPercent: minMarginOfSafetyPercent || '0.00',
        maxNetDebtToEbitda: maxNetDebtToEbitda.trim() !== '' ? maxNetDebtToEbitda : null,
        maxNetDebtToEquity: maxNetDebtToEquity.trim() !== '' ? maxNetDebtToEquity : null,
        minRoe: minRoe.trim() !== '' ? minRoe : null,
        maxStaleDays: Number(maxStaleDays) || 5,
        evaluationDate: evaluationDate ? new Date(evaluationDate).toISOString() : undefined,
      },
      constraints: {
        maxWeightPerAsset: maxWeightPerAsset || '0.20',
        maxWeightPerSector: maxWeightPerSector || '0.40',
      },
      evaluationDate: evaluationDate ? new Date(evaluationDate).toISOString() : undefined,
    };

    const parsed = cspSimulationInputSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(`Parâmetro inválido: ${issue.path.join('.')} — ${issue.message}`);
      return;
    }

    onSubmit(parsed.data);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-border-theme bg-surface p-6 shadow-xs space-y-6 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border-theme">
        <div>
          <h3 className="text-base font-bold text-text-primary">
            Parâmetros da Carteira Sugerida (CSP)
          </h3>
          <p className="text-xs text-text-muted">
            Configure os critérios objetivos de elegibilidade contábil e as restrições de concentração.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary bg-surface-elevated border border-border-theme transition-colors self-start sm:self-auto"
        >
          Restaurar Padrões
        </button>
      </div>

      {formError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
          {formError}
        </div>
      )}

      {/* Grid de Configurações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
        {/* 1. Classe de Ativo */}
        <div className="space-y-1.5">
          <label htmlFor="csp-asset-class" className="block font-semibold text-text-secondary">
            Classe de Ativo
          </label>
          <select
            id="csp-asset-class"
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as CspAssetClass)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          >
            <option value="STOCK">Ações Brasileiras (B3)</option>
            <option value="FII">Fundos Imobiliários (FIIs)</option>
            <option value="ETF">ETFs</option>
            <option value="OTHER">Outros / BDRs</option>
          </select>
          <p className="text-[10px] text-text-muted">Universo homogêneo obrigatório (sem classes mistas).</p>
        </div>

        {/* 2. Método de Ponderação */}
        <div className="space-y-1.5">
          <label htmlFor="csp-weighting-method" className="block font-semibold text-text-secondary">
            Método de Ponderação
          </label>
          <select
            id="csp-weighting-method"
            value={weightingMethod}
            onChange={(e) => setWeightingMethod(e.target.value as CspWeightingMethod)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          >
            <option value="MARGEM_SEGURANCA">Margem de Segurança Ponderada</option>
            <option value="EQUIPONDERADA">Equiponderada (Pesos Iguais)</option>
          </select>
          <p className="text-[10px] text-text-muted">Distribuição baseada em desconto teórico ou divisão igualitária.</p>
        </div>

        {/* 3. Margem de Segurança Mínima */}
        <div className="space-y-1.5">
          <label htmlFor="csp-min-margin" className="block font-semibold text-text-secondary">
            Margem de Segurança Mínima (%)
          </label>
          <div className="relative">
            <input
              id="csp-min-margin"
              type="number"
              step="1"
              min="-50"
              max="100"
              value={minMarginOfSafetyPercent}
              onChange={(e) => setMinMarginOfSafetyPercent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
            />
            <span className="absolute right-3 top-2 text-text-muted text-xs">%</span>
          </div>
          <p className="text-[10px] text-text-muted">Padrão: 0.00% (exclui ativos cotados acima do teto).</p>
        </div>

        {/* 4. Teto Dívida Líquida / EBITDA */}
        <div className="space-y-1.5">
          <label htmlFor="csp-max-net-debt-ebitda" className="block font-semibold text-text-secondary">
            Teto Dív. Líquida / EBITDA (x)
          </label>
          <input
            id="csp-max-net-debt-ebitda"
            type="number"
            step="0.5"
            min="0"
            max="15"
            value={maxNetDebtToEbitda}
            onChange={(e) => setMaxNetDebtToEbitda(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 3.50x. Deixe vazio para desativar.</p>
        </div>

        {/* 5. Teto Dívida Líquida / PL */}
        <div className="space-y-1.5">
          <label htmlFor="csp-max-net-debt-equity" className="block font-semibold text-text-secondary">
            Teto Dív. Líquida / PL (x)
          </label>
          <input
            id="csp-max-net-debt-equity"
            type="number"
            step="0.25"
            min="0"
            max="10"
            value={maxNetDebtToEquity}
            onChange={(e) => setMaxNetDebtToEquity(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 2.00x. Deixe vazio para desativar.</p>
        </div>

        {/* 6. ROE Mínimo */}
        <div className="space-y-1.5">
          <label htmlFor="csp-min-roe" className="block font-semibold text-text-secondary">
            ROE Mínimo (Fração Decimal)
          </label>
          <input
            id="csp-min-roe"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={minRoe}
            onChange={(e) => setMinRoe(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 0.05 (5% de retorno mínimo sobre o PL).</p>
        </div>

        {/* 7. Concentração Máxima por Ativo */}
        <div className="space-y-1.5">
          <label htmlFor="csp-max-weight-asset" className="block font-semibold text-text-secondary">
            Concentração Máx. por Ativo
          </label>
          <input
            id="csp-max-weight-asset"
            type="number"
            step="0.05"
            min="0.05"
            max="1.00"
            value={maxWeightPerAsset}
            onChange={(e) => setMaxWeightPerAsset(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 0.20 (limita cada ativo a no máximo 20%).</p>
        </div>

        {/* 8. Concentração Máxima por Setor */}
        <div className="space-y-1.5">
          <label htmlFor="csp-max-weight-sector" className="block font-semibold text-text-secondary">
            Concentração Máx. por Setor
          </label>
          <input
            id="csp-max-weight-sector"
            type="number"
            step="0.05"
            min="0.05"
            max="1.00"
            value={maxWeightPerSector}
            onChange={(e) => setMaxWeightPerSector(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 0.40 (limita cada setor a no máximo 40%).</p>
        </div>

        {/* 9. Defasagem Máxima de Cotação */}
        <div className="space-y-1.5">
          <label htmlFor="csp-max-stale-days" className="block font-semibold text-text-secondary">
            Defasagem Máxima de Cotação (Dias)
          </label>
          <input
            id="csp-max-stale-days"
            type="number"
            step="1"
            min="1"
            max="30"
            value={maxStaleDays}
            onChange={(e) => setMaxStaleDays(Number.parseInt(e.target.value, 10) || 5)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-theme text-text-primary text-xs focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <p className="text-[10px] text-text-muted">Padrão: 5 dias corridos de tolerância.</p>
        </div>
      </div>

      {/* Botão de Envio */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-theme">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 rounded-lg text-xs font-bold bg-brand text-brand-foreground hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Processando Simulação...</span>
            </>
          ) : (
            <span>Executar Simulação CSP</span>
          )}
        </button>
      </div>
    </form>
  );
}
