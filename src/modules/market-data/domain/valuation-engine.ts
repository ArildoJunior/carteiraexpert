import { Decimal } from '@/lib/decimal';
import type {
  MarketQuote,
  ExchangeRate,
  AssetValuation,
  SerializedAssetValuation,
} from './market-data.types';
import type { AssetPosition } from '@/modules/portfolio/domain/position.types';

/**
 * Calcula o valuation determinístico e a marcação a mercado de uma posição individual.
 * Toda a matemática é executada via Decimal com precisão arbitrária.
 */
export function calculateAssetValuation(
  position: AssetPosition,
  quote?: MarketQuote | null,
  fxRate?: ExchangeRate | null
): AssetValuation {
  const assetId = position.assetId;
  const quoteCurrency = quote?.currency ?? position.currency ?? 'BRL';

  // 1. Caso sem cotação cadastrada (Fallback Gracioso)
  if (!quote) {
    return {
      assetId,
      hasQuote: false,
      marketPrice: null,
      marketValue: null,
      unrealizedPnL: null,
      unrealizedPnLPercent: null,
      quoteCurrency,
      quoteDate: null,
      quoteSource: null,
      delayStatus: null,
      marketValueBrl: null,
      fxRateUsed: null,
      fxDateUsed: null,
      assetPriceReturnPercent: null,
      fxReturnPercent: null,
    };
  }

  const marketPrice = quote.price;

  // 2. Posição zerada em custódia
  if (position.quantity.isZero()) {
    return {
      assetId,
      hasQuote: true,
      marketPrice,
      marketValue: new Decimal(0),
      unrealizedPnL: new Decimal(0),
      unrealizedPnLPercent: new Decimal(0),
      quoteCurrency,
      quoteDate: quote.quoteDate,
      quoteSource: quote.source,
      delayStatus: quote.delayStatus,
      marketValueBrl: new Decimal(0),
      fxRateUsed: quoteCurrency === 'BRL' ? new Decimal(1) : (fxRate?.rate ?? null),
      fxDateUsed: fxRate?.rateDate ?? null,
      assetPriceReturnPercent: new Decimal(0),
      fxReturnPercent: new Decimal(0),
    };
  }

  // 3. Valor de Mercado e PnL Não Realizado
  const marketValue = position.quantity.times(marketPrice);
  const unrealizedPnL = marketValue.minus(position.totalCost);

  // Retorno percentual do PnL não realizado
  let unrealizedPnLPercent: Decimal | null = null;
  if (position.totalCost.greaterThan(0)) {
    unrealizedPnLPercent = unrealizedPnL
      .dividedBy(position.totalCost)
      .times(100);
  } else if (position.totalCost.isZero() && marketValue.greaterThan(0)) {
    // Custo zero (ex: ações 100% bonificadas com custo zero)
    unrealizedPnLPercent = null;
  }

  // 4. Retorno puro de preço do ativo (descolado do câmbio)
  let assetPriceReturnPercent: Decimal | null = null;
  if (position.averagePrice.greaterThan(0)) {
    assetPriceReturnPercent = marketPrice
      .minus(position.averagePrice)
      .dividedBy(position.averagePrice)
      .times(100);
  }

  // 5. Conversão Cambial para BRL
  let marketValueBrl: Decimal | null = null;
  let fxRateUsed: Decimal | null = null;
  let fxDateUsed: Date | null = null;

  if (quoteCurrency === 'BRL') {
    marketValueBrl = marketValue;
    fxRateUsed = new Decimal(1);
  } else if (fxRate && fxRate.rate.greaterThan(0)) {
    marketValueBrl = marketValue.times(fxRate.rate);
    fxRateUsed = fxRate.rate;
    fxDateUsed = fxRate.rateDate;
  }

  return {
    assetId,
    hasQuote: true,
    marketPrice,
    marketValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    quoteCurrency,
    quoteDate: quote.quoteDate,
    quoteSource: quote.source,
    delayStatus: quote.delayStatus,
    marketValueBrl,
    fxRateUsed,
    fxDateUsed,
    assetPriceReturnPercent,
    fxReturnPercent: null, // Reservado para quando histórico cambial for comparado
  };
}

/**
 * Serializa o AssetValuation para envio seguro a componentes React, SSR ou APIs em formato string/JSON.
 */
export function serializeAssetValuation(valuation: AssetValuation): SerializedAssetValuation {
  return {
    assetId: valuation.assetId,
    hasQuote: valuation.hasQuote,
    marketPrice: valuation.marketPrice ? valuation.marketPrice.toFixed(8) : null,
    marketValue: valuation.marketValue ? valuation.marketValue.toFixed(8) : null,
    unrealizedPnL: valuation.unrealizedPnL ? valuation.unrealizedPnL.toFixed(8) : null,
    unrealizedPnLPercent: valuation.unrealizedPnLPercent
      ? valuation.unrealizedPnLPercent.toFixed(4)
      : null,
    quoteCurrency: valuation.quoteCurrency,
    quoteDate: valuation.quoteDate ? valuation.quoteDate.toISOString() : null,
    quoteSource: valuation.quoteSource,
    delayStatus: valuation.delayStatus,
    marketValueBrl: valuation.marketValueBrl ? valuation.marketValueBrl.toFixed(8) : null,
    fxRateUsed: valuation.fxRateUsed ? valuation.fxRateUsed.toFixed(8) : null,
    fxDateUsed: valuation.fxDateUsed ? valuation.fxDateUsed.toISOString() : null,
    assetPriceReturnPercent: valuation.assetPriceReturnPercent
      ? valuation.assetPriceReturnPercent.toFixed(4)
      : null,
    fxReturnPercent: valuation.fxReturnPercent
      ? valuation.fxReturnPercent.toFixed(4)
      : null,
  };
}
