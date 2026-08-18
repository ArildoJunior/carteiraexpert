import type {
  MarketDataProviderAdapter,
  ManualMarketDataPayload,
  ProviderQuoteItem,
  ProviderExchangeRateItem,
} from '../market-data-provider.types';

function isSameUtcDate(itemDate: Date | string, targetDate: Date): boolean {
  const d = typeof itemDate === 'string' ? new Date(itemDate) : itemDate;
  if (isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === targetDate.getUTCFullYear() &&
    d.getUTCMonth() === targetDate.getUTCMonth() &&
    d.getUTCDate() === targetDate.getUTCDate()
  );
}

/**
 * Adaptador de dados manuais para ingestão sob demanda via CLI ou payloads JSON.
 * Não realiza chamadas de rede externas e opera de forma determinística.
 */
export class ManualPayloadAdapter implements MarketDataProviderAdapter {
  public readonly name = 'manual_payload_adapter';
  private readonly payload: ManualMarketDataPayload;

  constructor(payload: ManualMarketDataPayload) {
    this.payload = payload;
  }

  public async fetchQuotes(
    tickers?: string[],
    targetDate?: Date
  ): Promise<ProviderQuoteItem[]> {
    let quotes = this.payload.quotes || [];

    if (tickers && tickers.length > 0) {
      const upperTickers = new Set(tickers.map((t) => t.toUpperCase().trim()));
      quotes = quotes.filter((q) => {
        const ticker = q.ticker ? q.ticker.toUpperCase().trim() : '';
        return upperTickers.has(ticker) || (q.assetId && upperTickers.has(q.assetId));
      });
    }

    if (targetDate) {
      quotes = quotes.filter((q) => isSameUtcDate(q.quoteDate, targetDate));
    }

    return quotes;
  }

  public async fetchExchangeRates(
    pairs?: Array<{ fromCurrency: string; toCurrency?: string }>,
    targetDate?: Date
  ): Promise<ProviderExchangeRateItem[]> {
    let rates = this.payload.exchangeRates || [];

    if (pairs && pairs.length > 0) {
      const pairKeys = new Set(
        pairs.map(
          (p) =>
            `${p.fromCurrency.toUpperCase().trim()}_${(p.toCurrency || 'BRL').toUpperCase().trim()}`
        )
      );

      rates = rates.filter((r) => {
        const from = r.fromCurrency.toUpperCase().trim();
        const to = (r.toCurrency || 'BRL').toUpperCase().trim();
        return pairKeys.has(`${from}_${to}`);
      });
    }

    if (targetDate) {
      rates = rates.filter((r) => isSameUtcDate(r.rateDate, targetDate));
    }

    return rates;
  }
}
