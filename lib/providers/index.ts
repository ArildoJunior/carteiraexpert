// lib/providers/index.ts
// Registro central de todos os adapters do Cap 6

import { getProviderRegistry } from './registry';
import { BrapiAdapter } from './adapters/brapi';
import { FinnhubAdapter } from './adapters/finnhub';
import { TwelveDataAdapter } from './adapters/twelve-data';
import { AlphaVantageAdapter } from './adapters/alpha-vantage';
import { CoinGeckoAdapter } from './adapters/coingecko';
import { BinanceAdapter } from './adapters/binance';
import { KrakenAdapter } from './adapters/kraken';
import { YahooFinanceAdapter } from './adapters/yahoo-finance';
import { BCPtaxAdapter } from './adapters/bc-ptax';
import { FrankfurterAdapter } from './adapters/frankfurter';
import { BCSgsAdapter } from './adapters/bc-sgs';
import { IBGEAdapter } from './adapters/ibge';
import { IpeaDataAdapter } from './adapters/ipeadata';
import { SecEdgarAdapter } from './adapters/sec-edgar';
import { FMPFundamentalAdapter } from './adapters/fmp-fundamental';
import { DividendBRAdapter } from './adapters/dividend-br';
import { DividendUSAdapter } from './adapters/dividend-us';

let registered = false;

export function registerProviders(): void {
  if (registered) return;
  const registry = getProviderRegistry();

  // 6H — Ações BR
  registry.register(new BrapiAdapter('quote_br', 1));

  // 6I — Ações EUA
  registry.register(new FinnhubAdapter('quote_us', 1));
  registry.register(new TwelveDataAdapter('quote_us', 2));
  registry.register(new AlphaVantageAdapter());

  // 6J — Cripto
  registry.register(new CoinGeckoAdapter());
  registry.register(new BinanceAdapter());
  registry.register(new KrakenAdapter());

  // 6K — Ações globais
  registry.register(new YahooFinanceAdapter());

  // 6L-1 — Câmbio
  registry.register(new BCPtaxAdapter());
  registry.register(new FrankfurterAdapter());

  // 6L-1 — Indicadores BR
  registry.register(new BCSgsAdapter());
  registry.register(new IBGEAdapter());
  registry.register(new IpeaDataAdapter());

  // 6L-2 — Fundamentos US
  registry.register(new SecEdgarAdapter('fundamental_us', 1));
  registry.register(new FinnhubAdapter('fundamental_us', 2));
  registry.register(new FMPFundamentalAdapter());

  // 6M — Dividendos
  registry.register(new DividendBRAdapter());
  registry.register(new DividendUSAdapter());

  registered = true;
}

export { getProviderRegistry } from './registry';
export * from './types';