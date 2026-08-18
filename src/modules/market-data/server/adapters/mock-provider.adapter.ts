import { Decimal } from '@/lib/decimal';
import type {
  MarketDataProviderAdapter,
  ProviderQuoteItem,
  ProviderExchangeRateItem,
} from '../market-data-provider.types';

/**
 * Adaptador de Mock determinístico para testes unitários e de integração.
 * Fornece cotações e taxas simuladas sem nenhuma dependência de rede externa.
 */
export class MockMarketDataProviderAdapter implements MarketDataProviderAdapter {
  public readonly name = 'mock_provider_adapter';

  private mockQuotes: Map<string, Decimal> = new Map([
    ['PETR4', new Decimal('38.50')],
    ['VALE3', new Decimal('62.10')],
    ['ITUB4', new Decimal('34.20')],
    ['IVVB11', new Decimal('310.00')],
    ['KNIP11', new Decimal('95.40')],
    ['BTC', new Decimal('350000.00')],
    ['AAPL', new Decimal('220.00')],
  ]);

  private mockExchangeRates: Map<string, Decimal> = new Map([
    ['USD_BRL', new Decimal('5.42000000')],
    ['EUR_BRL', new Decimal('5.95000000')],
  ]);

  constructor(
    customQuotes?: Record<string, Decimal | string>,
    customFx?: Record<string, Decimal | string>
  ) {
    if (customQuotes) {
      for (const [ticker, price] of Object.entries(customQuotes)) {
        this.mockQuotes.set(ticker.toUpperCase().trim(), new Decimal(price));
      }
    }
    if (customFx) {
      for (const [pair, rate] of Object.entries(customFx)) {
        this.mockExchangeRates.set(pair.toUpperCase().trim(), new Decimal(rate));
      }
    }
  }

  public async fetchQuotes(
    tickers?: string[],
    targetDate: Date = new Date()
  ): Promise<ProviderQuoteItem[]> {
    const list = tickers && tickers.length > 0
      ? tickers.map((t) => t.toUpperCase().trim())
      : Array.from(this.mockQuotes.keys());

    const result: ProviderQuoteItem[] = [];

    for (const ticker of list) {
      const price = this.mockQuotes.get(ticker);
      if (price) {
        result.push({
          ticker,
          price,
          currency: ticker === 'AAPL' ? 'USD' : 'BRL',
          quoteDate: targetDate,
          source: 'mock_provider',
          delayStatus: 'eod',
        });
      }
    }

    return result;
  }

  public async fetchExchangeRates(
    pairs?: Array<{ fromCurrency: string; toCurrency?: string }>,
    targetDate: Date = new Date()
  ): Promise<ProviderExchangeRateItem[]> {
    const list = pairs && pairs.length > 0
      ? pairs.map((p) => `${p.fromCurrency.toUpperCase().trim()}_${(p.toCurrency || 'BRL').toUpperCase().trim()}`)
      : Array.from(this.mockExchangeRates.keys());

    const result: ProviderExchangeRateItem[] = [];

    for (const pairKey of list) {
      const [fromCurrency, toCurrency] = pairKey.split('_');
      const rate = this.mockExchangeRates.get(pairKey);
      if (rate && fromCurrency && toCurrency) {
        result.push({
          fromCurrency,
          toCurrency,
          rate,
          rateDate: targetDate,
          source: 'mock_provider',
          delayStatus: 'eod',
        });
      }
    }

    return result;
  }
}
