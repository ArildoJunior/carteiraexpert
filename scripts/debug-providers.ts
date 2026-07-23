// scripts/debug-providers.ts
// Diagnóstico bruto: testa cada provedor isolado, mostra URL, status, body
// Roda com: npx tsx scripts/debug-providers.ts VOD.L

import 'dotenv/config';

const TICKER = (process.argv[2] ?? 'VOD.L').toUpperCase();
const TIMEOUT = 10000;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/csv,text/plain,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface DebugResult {
  provider: string;
  url: string;
  status?: number;
  ok?: boolean;
  latencyMs: number;
  bodyPreview: string;
  error?: string;
}

async function probe(
  provider: string,
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<DebugResult> {
  const start = Date.now();
  const headers = { ...BROWSER_HEADERS, ...extraHeaders };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers });
    const text = await r.text();
    const latency = Date.now() - start;
    return {
      provider,
      url,
      status: r.status,
      ok: r.ok,
      latencyMs: latency,
      bodyPreview: text.slice(0, 300).replace(/\n/g, ' '),
    };
  } catch (err) {
    const latency = Date.now() - start;
    const e = err as Error;
    return {
      provider,
      url,
      latencyMs: latency,
      bodyPreview: '',
      error: e.name === 'AbortError' ? 'TIMEOUT (10s)' : e.message,
    };
  }
}

async function main() {
  console.log(`\n🔬 Diagnóstico bruto para: ${TICKER}\n`);

  // ─── TwelveData: testa múltiplos formatos ───
  console.log('━━━ TWELVE DATA ━━━');

  // Formato 1: símbolo + exchange (atual)
  const symbol1 = TICKER.split('.')[0];
  const exchangeMap: Record<string, string> = {
    '.L': 'LSE', '.DE': 'XETR', '.PA': 'EURONEXT', '.F': 'FWB',
    '.MI': 'MIL', '.MC': 'MCE', '.JP': 'TSE', '.HK': 'HKEX',
    '.AU': 'ASX', '.CA': 'TSX', '.CH': 'SIX', '.SG': 'SGX',
    '.IN': 'NSE', '.KR': 'KRX', '.TW': 'TWSE', '.NZ': 'NZX',
    '.IL': 'TASE', '.SA': 'BVMF', '.UK': 'LSE',
  };
  let exchange1: string | undefined;
  for (const [suffix, ex] of Object.entries(exchangeMap)) {
    if (TICKER.endsWith(suffix)) { exchange1 = ex; break; }
  }
  const td1Url = `https://api.twelvedata.com/time_series?symbol=${symbol1}&interval=1day&outputsize=1&apikey=${process.env.TWELVE_DATA_TOKEN}${exchange1 ? `&exchange=${exchange1}` : ''}`;
  console.log(await probe('TD-1:symbol+exchange', td1Url));

  // Formato 2: ticker completo direto (sem extrair exchange)
  const td2Url = `https://api.twelvedata.com/time_series?symbol=${TICKER}&interval=1day&outputsize=1&apikey=${process.env.TWELVE_DATA_TOKEN}`;
  console.log(await probe('TD-2:ticker-completo', td2Url));

  // Formato 3: /price (endpoint mais simples)
  const td3Url = `https://api.twelvedata.com/price?symbol=${symbol1}${exchange1 ? `&exchange=${exchange1}` : ''}&apikey=${process.env.TWELVE_DATA_TOKEN}`;
  console.log(await probe('TD-3:/price', td3Url));

  // Formato 4: /symbol_search para descobrir o símbolo correto
  const td4Url = `https://api.twelvedata.com/symbol_search?symbol=${symbol1}&apikey=${process.env.TWELVE_DATA_TOKEN}`;
  console.log(await probe('TD-4:symbol_search', td4Url));

  // ─── Stooq: testa múltiplos formatos ───
  console.log('\n━━━ STOOQ ━━━');

  // Formato 1: ticker minúsculo (atual)
  const stooq1 = `https://stooq.com/q/l/?s=${TICKER.toLowerCase()}&i=d`;
  console.log(await probe('STOOQ-1:minusculo', stooq1));

  // Formato 2: ticker original em maiúsculo
  const stooq2 = `https://stooq.com/q/l/?s=${TICKER.toLowerCase()}.${TICKER.split('.').pop()?.toLowerCase()}&i=d`;
  console.log(await probe('STOOQ-2:sufixo-minusculo', stooq2));

  // Formato 3: sem User-Agent
  try {
    const r = await fetch(stooq1, { signal: AbortSignal.timeout(TIMEOUT) });
    const text = await r.text();
    console.log({
      provider: 'STOOQ-3:sem-headers',
      url: stooq1,
      status: r.status,
      ok: r.ok,
      latencyMs: 0,
      bodyPreview: text.slice(0, 300).replace(/\n/g, ' '),
    } as DebugResult);
  } catch (err) {
    console.log({ provider: 'STOOQ-3:sem-headers', url: stooq1, error: (err as Error).message, latencyMs: 0, bodyPreview: '' } as DebugResult);
  }

  // Formato 4: endpoint /d/ (formato antigo que apareceu no teste original)
  const stooq4 = `https://stooq.com/q/d/l/?s=${TICKER.toLowerCase()}&i=d`;
  console.log(await probe('STOOQ-4:/q/d/l/', stooq4));

  // Formato 5: sem path /q/l/ — tentar /q/?s=
  const stooq5 = `https://stooq.com/q/?s=${TICKER.toLowerCase()}`;
  console.log(await probe('STOOQ-5:/q/?s=', stooq5));

  // ─── Frankfurter (fallback alternativo que já temos no plano) ───
  console.log('\n━━━ FRANKFURTER (teste) ━━━');
  const frankfurter = `https://api.frankfurter.app/latest?from=GBP&to=USD`;
  console.log(await probe('FRANKFURTER-1', frankfurter));

  // ─── Yahoo Finance público (não temos adapter, mas útil pra ver se ticker existe) ───
  console.log('\n━━━ YAHOO FINANCE (referência) ━━━');
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${TICKER}?interval=1d&range=5d`;
  console.log(await probe('YAHOO-1', yahooUrl));

  console.log('\n✅ Diagnóstico completo\n');
}

main().catch((err) => {
  console.error('❌ Erro no script:', err);
  process.exit(1);
});