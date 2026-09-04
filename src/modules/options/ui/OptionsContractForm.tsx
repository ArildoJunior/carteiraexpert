import React, { useState, useMemo } from 'react';
import { createOptionContractAction } from '../server/options.actions';
import type { SerializedOptionContract } from '../domain/options.types';
import { Decimal } from '@/lib/decimal';

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

interface OptionsContractFormProps {
  portfolios: PortfolioOption[];
  assets: AssetOption[];
  custodyAccounts?: CustodyAccountOption[];
  onSuccess: (created: SerializedOptionContract) => void;
  onCancel?: () => void;
}

export function OptionsContractForm({
  portfolios,
  assets,
  custodyAccounts = [],
  onSuccess,
  onCancel,
}: OptionsContractFormProps) {
  const [portfolioId, setPortfolioId] = useState<string>(portfolios[0]?.id ?? '');
  const [underlyingAssetId, setUnderlyingAssetId] = useState<string>(assets[0]?.id ?? '');
  const [custodyAccountId, setCustodyAccountId] = useState<string>('');
  const [ticker, setTicker] = useState<string>('');
  const [optionType, setOptionType] = useState<'CALL' | 'PUT'>('CALL');
  const [optionStyle, setOptionStyle] = useState<'AMERICAN' | 'EUROPEAN'>('AMERICAN');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [strikePrice, setStrikePrice] = useState<string>('');
  const [premiumPaidReceived, setPremiumPaidReceived] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('100');
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filtrar contas de custódia da carteira selecionada
  const availableCustodyAccounts = useMemo(() => {
    return custodyAccounts.filter((acc) => acc.portfolioId === portfolioId);
  }, [custodyAccounts, portfolioId]);

  // Cálculos prévios em tempo real
  const summaryPreview = useMemo(() => {
    try {
      if (!strikePrice || !premiumPaidReceived || !quantity) return null;
      const k = new Decimal(strikePrice);
      const prem = new Decimal(premiumPaidReceived);
      const qty = new Decimal(quantity);

      if (k.lessThanOrEqualTo(0) || prem.isNegative() || qty.lessThanOrEqualTo(0)) return null;

      const totalPremium = prem.mul(qty);
      const breakeven = optionType === 'CALL'
        ? k.add(prem)
        : Decimal.max(new Decimal(0), k.sub(prem));

      return {
        totalPremium: totalPremium.toFixed(2),
        breakeven: breakeven.toFixed(2),
      };
    } catch {
      return null;
    }
  }, [strikePrice, premiumPaidReceived, quantity, optionType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!portfolioId) {
      setFormError('Selecione uma carteira.');
      return;
    }
    if (!underlyingAssetId) {
      setFormError('Selecione o ativo-objeto.');
      return;
    }
    if (!ticker.trim()) {
      setFormError('Informe o código da opção (ticker).');
      return;
    }
    if (!strikePrice || Number(strikePrice) <= 0) {
      setFormError('Informe um strike válido maior que zero.');
      return;
    }
    if (!premiumPaidReceived || Number(premiumPaidReceived) < 0) {
      setFormError('Informe um prêmio válido maior ou igual a zero.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setFormError('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (!expirationDate) {
      setFormError('Informe a data de vencimento da opção.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createOptionContractAction({
        portfolioId,
        underlyingAssetId,
        custodyAccountId: custodyAccountId || undefined,
        ticker: ticker.trim().toUpperCase(),
        optionType,
        optionStyle,
        direction,
        strikePrice,
        premiumPaidReceived,
        quantity,
        expirationDate,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setFormError(res.error);
        return;
      }

      onSuccess(res.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar contrato.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-theme bg-surface p-5 sm:p-6 shadow-sm space-y-5"
    >
      <div className="flex items-center justify-between border-b border-border-theme pb-3.5">
        <div>
          <h3 className="text-base font-semibold text-text-primary tracking-tight">
            Novo Contrato de Opção
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Cadastre contratos para acompanhamento de vencimento, gregas e payoff descritivo.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-text-muted hover:text-text-primary px-2.5 py-1 rounded border border-border-theme"
          >
            Cancelar
          </button>
        )}
      </div>

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400"
        >
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Carteira */}
        <div>
          <label htmlFor="opt-form-portfolio" className="block text-xs font-medium text-text-secondary mb-1">
            Carteira *
          </label>
          <select
            id="opt-form-portfolio"
            value={portfolioId}
            onChange={(e) => {
              setPortfolioId(e.target.value);
              setCustodyAccountId('');
            }}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ativo-Objeto */}
        <div>
          <label htmlFor="opt-form-asset" className="block text-xs font-medium text-text-secondary mb-1">
            Ativo-Objeto *
          </label>
          <select
            id="opt-form-asset"
            value={underlyingAssetId}
            onChange={(e) => setUnderlyingAssetId(e.target.value)}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ticker} — {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ticker da Opção */}
        <div>
          <label htmlFor="opt-form-ticker" className="block text-xs font-medium text-text-secondary mb-1">
            Código da Opção (Ticker) *
          </label>
          <input
            id="opt-form-ticker"
            type="text"
            placeholder="Ex: PETRH380"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary uppercase"
          />
        </div>

        {/* Tipo: CALL / PUT */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Tipo de Opção *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="opt-form-type-call"
              onClick={() => setOptionType('CALL')}
              className={`rounded-lg py-2 text-xs font-semibold border transition-all ${
                optionType === 'CALL'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              CALL (Compra)
            </button>
            <button
              type="button"
              id="opt-form-type-put"
              onClick={() => setOptionType('PUT')}
              className={`rounded-lg py-2 text-xs font-semibold border transition-all ${
                optionType === 'PUT'
                  ? 'bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              PUT (Venda)
            </button>
          </div>
        </div>

        {/* Direção: BUY / SELL */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Direção da Posição *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="opt-form-dir-buy"
              onClick={() => setDirection('BUY')}
              className={`rounded-lg py-2 text-xs font-semibold border transition-all ${
                direction === 'BUY'
                  ? 'bg-action-primary/10 border-action-primary text-action-primary'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              Titular (Comprada)
            </button>
            <button
              type="button"
              id="opt-form-dir-sell"
              onClick={() => setDirection('SELL')}
              className={`rounded-lg py-2 text-xs font-semibold border transition-all ${
                direction === 'SELL'
                  ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              Lançador (Vendida)
            </button>
          </div>
        </div>

        {/* Estilo: AMERICAN / EUROPEAN */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Estilo de Exercício
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOptionStyle('AMERICAN')}
              className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                optionStyle === 'AMERICAN'
                  ? 'bg-surface-hover border-text-secondary text-text-primary'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              Americana
            </button>
            <button
              type="button"
              onClick={() => setOptionStyle('EUROPEAN')}
              className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                optionStyle === 'EUROPEAN'
                  ? 'bg-surface-hover border-text-secondary text-text-primary'
                  : 'border-border-theme bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              Europeia
            </button>
          </div>
        </div>

        {/* Strike */}
        <div>
          <label htmlFor="opt-form-strike" className="block text-xs font-medium text-text-secondary mb-1">
            Preço de Exercício (Strike R$) *
          </label>
          <input
            id="opt-form-strike"
            type="text"
            placeholder="Ex: 38.00"
            value={strikePrice}
            onChange={(e) => setStrikePrice(e.target.value)}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          />
        </div>

        {/* Prêmio */}
        <div>
          <label htmlFor="opt-form-premium" className="block text-xs font-medium text-text-secondary mb-1">
            Prêmio Unitário (R$) *
          </label>
          <input
            id="opt-form-premium"
            type="text"
            placeholder="Ex: 1.50"
            value={premiumPaidReceived}
            onChange={(e) => setPremiumPaidReceived(e.target.value)}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          />
        </div>

        {/* Quantidade */}
        <div>
          <label htmlFor="opt-form-quantity" className="block text-xs font-medium text-text-secondary mb-1">
            Quantidade de Opções *
          </label>
          <input
            id="opt-form-quantity"
            type="text"
            placeholder="Ex: 100"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          />
        </div>

        {/* Data de Vencimento */}
        <div>
          <label htmlFor="opt-form-expiration" className="block text-xs font-medium text-text-secondary mb-1">
            Data de Vencimento *
          </label>
          <input
            id="opt-form-expiration"
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            required
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          />
        </div>

        {/* Conta de Custódia (Opcional) */}
        <div>
          <label htmlFor="opt-form-custody" className="block text-xs font-medium text-text-secondary mb-1">
            Conta de Custódia (Opcional)
          </label>
          <select
            id="opt-form-custody"
            value={custodyAccountId}
            onChange={(e) => setCustodyAccountId(e.target.value)}
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          >
            <option value="">Sem vínculo de custódia</option>
            {availableCustodyAccounts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Anotações */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="opt-form-notes" className="block text-xs font-medium text-text-secondary mb-1">
            Anotações / Estratégia Descritiva (Opcional)
          </label>
          <input
            id="opt-form-notes"
            type="text"
            placeholder="Ex: Trava de alta para proteção de carteira"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            className="w-full rounded-lg border border-border-theme bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
          />
        </div>
      </div>

      {/* Resumo prévio descritivo */}
      {summaryPreview && (
        <div className="rounded-lg bg-surface-hover/60 border border-border-theme/60 p-3 flex flex-wrap gap-4 text-xs text-text-secondary">
          <div>
            <span className="text-text-muted">Total Financeiro de Prêmios: </span>
            <strong className="text-text-primary">
              {direction === 'BUY' ? 'Débito' : 'Crédito'} R$ {summaryPreview.totalPremium}
            </strong>
          </div>
          <div>
            <span className="text-text-muted">Preço de Equilíbrio (Breakeven): </span>
            <strong className="text-text-primary">R$ {summaryPreview.breakeven}</strong>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-border-theme text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          id="opt-form-submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg bg-action-primary hover:bg-action-primary-hover text-action-primary-text text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          {isSubmitting ? 'Salvando...' : 'Salvar Contrato'}
        </button>
      </div>
    </form>
  );
}
