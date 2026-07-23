// test-keys.mjs
// Validação rápida de todas as chaves do .env do CarteiraExpert
// Uso: node test-keys.mjs

import "dotenv/config";

const TIMEOUT_MS = 8000;

function hasToken(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") return false;
  if (v === "PUBLIC" || v === "public") return "PUBLIC";
  if (/^X+$/.test(v)) return "PLACEHOLDER";
  return v;
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(id);
  }
}

async function check(label, name, run) {
  const status = hasToken(name);
  if (status === false) {
    return { label, status: "SKIP", detail: "variável vazia" };
  }
  if (status === "PUBLIC") {
    try {
      const r = await run(undefined);
      return { label, status: r.ok ? "OK" : "FAIL", detail: r.detail };
    } catch (e) {
      return { label, status: "ERRO", detail: e.message };
    }
  }
  if (status === "PLACEHOLDER") {
    return { label, status: "SKIP", detail: "placeholder XXXXXX" };
  }
  try {
    const r = await run(status);
    return { label, status: r.ok ? "OK" : "FAIL", detail: r.detail };
  } catch (e) {
    return { label, status: "ERRO", detail: e.message };
  }
}

const tests = [
  // ─── Cap 9 (LLMs + Storage) ───
  check("OpenAI (gpt-4o-mini)", "OPENAI_API_KEY", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (r.status === 401) return { ok: false, detail: "chave inválida (401)" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "chave válida" };
  }),

  check("Anthropic (claude-haiku-4-5)", "ANTHROPIC_API_KEY", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": t,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (r.status === 401) return { ok: false, detail: "chave inválida (401)" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "chave válida" };
  }),

  check("Vercel Blob", "BLOB_READ_WRITE_TOKEN", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout("https://blob.vercel-storage.com/?limit=1", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, detail: `token inválido (${r.status})` };
    }
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "token válido" };
  }),

  // ─── Cap 6 (Provedores de Dados) ───
  check("Brapi (PETR4)", "BRAPI_TOKEN", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout(`https://brapi.dev/api/quote/PETR4?token=${t}`);
    if (r.status === 401 || r.status === 403) {
      return { ok: false, detail: `token inválido (${r.status})` };
    }
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `c=${j?.results?.[0]?.regularMarketPrice ?? "?"}` };
  }),

  check("HG Brasil (USD→BRL)", "HG_BRASIL_TOKEN", async (t) => {
    if (!t || t === "PUBLIC") return { ok: false, detail: "precisa de chave" };
    const r = await fetchWithTimeout(`https://api.hgbrasil.com/finance?key=${t}`);
    if (r.status === 401) return { ok: false, detail: "chave inválida (401)" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "chave válida" };
  }),

  check("CoinGecko (BTC)", "COINGECKO_DEMO_API_KEY", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&x_cg_demo_api_key=${t}`
    );
    if (r.status === 401) return { ok: false, detail: "chave inválida (401)" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `$${j?.bitcoin?.usd}` };
  }),

  check("Finnhub (AAPL)", "FINNHUB_TOKEN", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${t}`);
    if (r.status === 401 || r.status === 403) {
      return { ok: false, detail: "chave inválida" };
    }
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `c=${j?.c}` };
  }),

  check("Twelve Data (AAPL)", "TWELVE_DATA_TOKEN", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout(`https://api.twelvedata.com/price?symbol=AAPL&apikey=${t}`);
    if (r.status === 401) return { ok: false, detail: "chave inválida (401)" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `price=${j?.price}` };
  }),

  check("Alpha Vantage (AAPL)", "ALPHA_VANTAGE_TOKEN", async (t) => {
    if (!t) return { ok: false, detail: "chave vazia" };
    const r = await fetchWithTimeout(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${t}`
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const txt = await r.text();
    if (txt.includes("Invalid API call") || txt.includes("Note")) {
      return { ok: false, detail: "chave inválida ou rate limit" };
    }
    return { ok: true, detail: "chave válida" };
  }),

  check(
    "Financial Modeling Prep (income-stmt bulk AAPL)",
    "FINANCIAL_MODELING_PREP_TOKEN",
    async (t) => {
      if (!t) return { ok: false, detail: "chave vazia" };
      const url = `https://financialmodelingprep.com/api/v3/income-statement-bulk/AAPL?apikey=${t}`;
      const r = await fetchWithTimeout(url);
      if (r.status === 401 || r.status === 403) {
        let body = "";
        try {
          body = (await r.text()).slice(0, 150);
        } catch {}
        return { ok: false, detail: `HTTP ${r.status} — ${body || "chave inválida"}` };
      }
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const j = await r.json();
      if (j?.["Error Message"]) return { ok: false, detail: j["Error Message"] };
      return {
        ok: true,
        detail: `revenue=$${(j?.[0]?.revenue / 1e9).toFixed(1)}B, ${j?.length} periods`,
      };
    }
  ),

  // ─── APIs públicas (sem token) ───
  check("CoinCap (BTC)", "COINCAP_TOKEN", async () => {
    const r = await fetchWithTimeout("https://api.coincap.io/v2/assets/bitcoin");
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `$${Number.parseFloat(j?.data?.priceUsd).toFixed(0)}` };
  }),

  check("CryptoCompare (BTC)", "CRIPTOCOMPARE_TOKEN", async () => {
    const r = await fetchWithTimeout(
      "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD"
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `$${j?.USD}` };
  }),

  check("Binance (BTCUSDT)", "BINANCE_TOKEN", async () => {
    const r = await fetchWithTimeout("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `$${j?.price}` };
  }),

  check("Kraken (XBTUSD)", "KRAKEN_TOKEN", async () => {
    const r = await fetchWithTimeout("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    const pair = Object.keys(j?.result ?? {})[0];
    return { ok: true, detail: `$${j?.result?.[pair]?.c?.[0]}` };
  }),

  check("Stooq (AAPL.US)", "STOOQ_TOKEN", async () => {
    const r = await fetchWithTimeout("https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv");
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const txt = await r.text();
    if (txt.includes("No data")) return { ok: false, detail: "sem dados" };
    return { ok: true, detail: "CSV OK" };
  }),

  check("Banco Central PTAX (USD)", "BC_PTAX_TOKEN", async () => {
    const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const r = await fetchWithTimeout(
      `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${hoje}'&$format=json`
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `R$${j?.value?.[0]?.cotacaoVenda ?? "?"}` };
  }),

  check("Banco Central SGS (IPCA)", "BC_SGS_TOKEN", async () => {
    const r = await fetchWithTimeout(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json"
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `IPCA ${j?.[0]?.valor}%` };
  }),

  check("IBGE (IPCA)", "IBGE_TOKEN", async () => {
    const r = await fetchWithTimeout(
      "https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/-1/variaveis/2266?localidades=BR"
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "API OK" };
  }),

  check("IpeaData (Selic)", "IPEADATA_TOKEN", async () => {
    const r = await fetchWithTimeout(
      "http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='BM12_TJOVER12')?$top=1&$orderby=VALDATA%20desc&$format=json"
    );
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "API OK" };
  }),

  check("Frankfurter (USD→BRL)", "FRANKFURTER_TOKEN", async () => {
    const r = await fetchWithTimeout("https://api.frankfurter.app/latest?from=USD&to=BRL");
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, detail: `R$${j?.rates?.BRL}` };
  }),

  check("SEC EDGAR (precisa User-Agent)", "SEC_EDGAR_TOKEN", async (t) => {
    if (!t || t === "PUBLIC") return { ok: false, detail: "precisa de e-mail real" };
    const r = await fetchWithTimeout("https://data.sec.gov/submissions/CIK0000320193.json", {
      headers: { "User-Agent": `${t} CarteiraExpert` },
    });
    if (r.status === 403) return { ok: false, detail: "falta User-Agent válido" };
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    return { ok: true, detail: "OK" };
  }),
];

console.log("\n════════════════════════════════════════════════════════════════");
console.log("  CarteiraExpert — Validação de chaves do .env");
console.log("════════════════════════════════════════════════════════════════\n");

// CORREÇÃO PRINCIPAL: await Promise.all para resolver as promises
const results = await Promise.all(tests);

let ok = 0;
let fail = 0;
let skip = 0;
let erro = 0;
for (const t of results) {
  const icon =
    t.status === "OK"
      ? "✅  "
      : t.status === "FAIL"
        ? "❌  "
        : t.status === "SKIP"
          ? "⏭   "
          : "💥  ";
  console.log(`  ${icon} ${t.label.padEnd(40)} ${t.status.padEnd(5)} ${t.detail}`);
  if (t.status === "OK") ok++;
  else if (t.status === "FAIL") fail++;
  else if (t.status === "SKIP") skip++;
  else erro++;
}

console.log("\n────────────────────────────────────────────────────────────────");
console.log(`  Total: ${ok} OK · ${fail} falhas · ${skip} ignorados · ${erro} erros`);
console.log("────────────────────────────────────────────────────────────────\n");
