import { Decimal } from '@/lib/decimal';
import type {
  MarketDataProviderAdapter,
  ProviderQuoteItem,
  ProviderExchangeRateItem,
} from '../market-data-provider.types';

export interface BrapiAdapterConfig {
  /**
   * Token de autenticação da BRAPI. Se não informado, busca de process.env.BRAPI_TOKEN.
   */
  apiToken?: string;
  /**
   * URL base da API da BRAPI. Padrão: 'https://brapi.dev/api'
   */
  baseUrl?: string;
  /**
   * Timeout em milissegundos para requisições HTTP. Padrão: 10.000 ms.
   */
  timeoutMs?: number;
  /**
   * Função customizada de fetch (útil para testes unitários isolados sem mutação global).
   */
  customFetch?: typeof fetch;
}

/**
 * Erro específico de configuração da BRAPI (token ausente, vazio ou placeholder).
 */
export class BrapiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrapiConfigurationError';
  }
}

/**
 * Erro de execução, comunicação ou capacidade não suportada na API da BRAPI.
 */
export class BrapiProviderError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'BrapiProviderError';
    this.statusCode = statusCode;
  }
}

/**
 * Regex para validação estrita de strings ISO contendo 'Z' ou offset de fuso horário explícito.
 * Rejeita qualquer string de data sem indicação inequívoca de timezone.
 */
const ISO_WITH_EXPLICIT_TZ_REGEX =
  /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Sanitiza URLs, cabeçalhos e mensagens de erro para garantir que tokens e chaves não sejam expostos em logs.
 */
function sanitizeErrorMessage(message: string, token?: string): string {
  if (!token || token.trim().length === 0) return message;
  return message.split(token).join('***');
}

/**
 * Converte timestamp retornado pela BRAPI em Date UTC válida.
 * Aceita exclusivamente timestamps Unix numéricos (>0) ou strings ISO com timezone explícito (Z ou offset).
 * Rejeita qualquer data sem timezone, nula, vazia ou inválida.
 */
function parseBrapiMarketDate(rawTime: unknown): Date | null {
  if (rawTime === null || rawTime === undefined || rawTime === '') {
    return null;
  }

  if (typeof rawTime === 'string') {
    const trimmed = rawTime.trim();
    if (!trimmed) return null;

    // Rejeita datas sem timezone explícito (evita interpretação ambígua com fuso local)
    if (!ISO_WITH_EXPLICIT_TZ_REGEX.test(trimmed)) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  if (typeof rawTime === 'number') {
    if (!Number.isFinite(rawTime) || isNaN(rawTime) || rawTime <= 0) {
      return null;
    }
    // Se o timestamp estiver em segundos (10 dígitos), converte para milissegundos
    const ms = rawTime < 1e11 ? rawTime * 1000 : rawTime;
    const parsed = new Date(ms);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  return null;
}

/**
 * Valida a moeda retornada. Para cotações brasileiras via BRAPI, aceita estritamente 'BRL'.
 * Rejeita moedas ausentes, incompatíveis ou inválidas.
 */
function validateBrapiCurrency(rawCurrency: unknown): string | null {
  if (typeof rawCurrency !== 'string') {
    return null;
  }
  const normalized = rawCurrency.trim().toUpperCase();
  if (normalized !== 'BRL') {
    return null;
  }
  return normalized;
}

/**
 * Valida e converte preço para Decimal garantindo que seja finito, não nulo, não NaN e não negativo.
 */
function validateBrapiPrice(rawPrice: unknown): Decimal | null {
  if (rawPrice === null || rawPrice === undefined || rawPrice === '' || typeof rawPrice === 'boolean') {
    return null;
  }

  if (typeof rawPrice === 'number') {
    if (!Number.isFinite(rawPrice) || isNaN(rawPrice) || rawPrice < 0) {
      return null;
    }
  }

  const str = String(rawPrice).trim();
  if (!str || str === 'NaN' || str === 'Infinity' || str === '-Infinity' || str === 'null') {
    return null;
  }

  try {
    const dec = new Decimal(str);
    if (dec.isNaN() || !dec.isFinite() || dec.isNegative()) {
      return null;
    }
    return dec;
  } catch {
    return null;
  }
}

/**
 * Adaptador oficial para o provedor externo BRAPI (B3 / Ações, FIIs e BDRs).
 * Atende exclusivamente à consulta e normalização de cotações correntes de ativos (`fetchQuotes`).
 */
export class BrapiMarketDataProviderAdapter implements MarketDataProviderAdapter {
  public readonly name = 'brapi_provider_adapter';

  private readonly token: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: BrapiAdapterConfig = {}) {
    this.token = config.apiToken ?? (typeof process !== 'undefined' ? process.env?.BRAPI_TOKEN : undefined);
    this.baseUrl = (config.baseUrl ?? 'https://brapi.dev/api').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.fetchFn = config.customFetch ?? (typeof fetch !== 'undefined' ? fetch : (globalThis.fetch as typeof fetch));
  }

  /**
   * Valida defensivamente a presença e o formato da credencial de autenticação.
   * Lança BrapiConfigurationError se ausente, vazia ou se contiver o placeholder padrão.
   */
  private validateCredentials(): string {
    const trimmed = (this.token || '').trim();

    if (!trimmed) {
      throw new BrapiConfigurationError(
        'Credencial BRAPI_TOKEN não configurada no ambiente. Defina a variável de ambiente para utilizar o adaptador BRAPI.'
      );
    }

    if (trimmed.startsWith('replace-with-') || trimmed === 'PUBLIC') {
      throw new BrapiConfigurationError(
        'Credencial BRAPI_TOKEN contém um valor placeholder não preenchido. Substitua pela chave real da API.'
      );
    }

    return trimmed;
  }

  /**
   * Consulta cotações correntes para uma lista de tickers na API da BRAPI.
   * Rejeita explicitamente targetDate histórico para evitar persistir cotações correntes como se fossem históricas.
   * Utiliza autenticação por cabeçalho (Authorization: Bearer) para evitar tokens na URL.
   * Normaliza os resultados válidos para o contrato interno ProviderQuoteItem[].
   */
  public async fetchQuotes(
    tickers?: string[],
    targetDate?: Date
  ): Promise<ProviderQuoteItem[]> {
    if (!tickers || tickers.length === 0) {
      return [];
    }

    // Validação estrita de targetDate: o adaptador aceita apenas cotações correntes do dia atual em UTC
    if (targetDate) {
      if (isNaN(targetDate.getTime())) {
        throw new BrapiProviderError(
          'O adaptador BRAPI aceita somente cotações correntes do dia atual em UTC. Para outras datas, utilize a ingestão manual.'
        );
      }

      const now = new Date();
      const isSameUtcDay =
        targetDate.getUTCFullYear() === now.getUTCFullYear() &&
        targetDate.getUTCMonth() === now.getUTCMonth() &&
        targetDate.getUTCDate() === now.getUTCDate();

      if (!isSameUtcDay) {
        throw new BrapiProviderError(
          'O adaptador BRAPI aceita somente cotações correntes do dia atual em UTC. Para outras datas, utilize a ingestão manual.'
        );
      }
    }

    const cleanTickers = tickers
      .map((t) => (t || '').trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (cleanTickers.length === 0) {
      return [];
    }

    const validToken = this.validateCredentials();
    const joinedTickers = cleanTickers.join(',');
    // URL limpa sem token na query string
    const requestUrl = `${this.baseUrl}/quote/${encodeURIComponent(joinedTickers)}`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${validToken}`,
          'User-Agent': 'CarteiraExpert/1.0',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new BrapiProviderError(
          `Timeout de ${this.timeoutMs}ms excedido ao consultar cotações na BRAPI.`
        );
      }
      const safeMsg = sanitizeErrorMessage(err.message || 'Erro de conexão', validToken);
      throw new BrapiProviderError(`Falha de rede ao consultar BRAPI: ${safeMsg}`);
    } finally {
      clearTimeout(timeoutHandle);
    }

    // Tratamento de Códigos de Status HTTP
    if (response.status === 401 || response.status === 403) {
      throw new BrapiProviderError(
        'Falha de autenticação na BRAPI: token inválido, expirado ou não autorizado (HTTP ' +
          response.status +
          ').',
        response.status
      );
    }

    if (response.status === 429) {
      throw new BrapiProviderError(
        'Limite de requisições (rate limit) excedido na BRAPI (HTTP 429). Aguarde antes de realizar nova tentativa.',
        429
      );
    }

    if (!response.ok) {
      throw new BrapiProviderError(
        `A API da BRAPI retornou erro HTTP ${response.status} (${response.statusText}).`,
        response.status
      );
    }

    // Parsing do JSON de Resposta
    let jsonBody: unknown;
    try {
      jsonBody = await response.json();
    } catch {
      throw new BrapiProviderError(
        'Resposta da BRAPI retornou formato inválido: não foi possível interpretar o JSON.'
      );
    }

    if (!jsonBody || typeof jsonBody !== 'object') {
      throw new BrapiProviderError(
        'Payload retornado pela BRAPI é inválido (formato não reconhecido).'
      );
    }

    const bodyObj = jsonBody as Record<string, unknown>;
    const rawResults = Array.isArray(bodyObj.results) ? bodyObj.results : [];

    const normalizedQuotes: ProviderQuoteItem[] = [];

    for (const rawItem of rawResults) {
      if (!rawItem || typeof rawItem !== 'object') continue;

      const item = rawItem as Record<string, unknown>;

      // 1. Ticker / Symbol
      const rawSymbol = item.symbol || item.ticker;
      if (typeof rawSymbol !== 'string' || rawSymbol.trim().length === 0) {
        continue;
      }
      const ticker = rawSymbol.trim().toUpperCase();

      // 2. Preço de Mercado (Validação Estrita de Finitude e Positividade)
      const rawPrice =
        item.regularMarketPrice !== undefined && item.regularMarketPrice !== null
          ? item.regularMarketPrice
          : item.price;

      const priceDecimal = validateBrapiPrice(rawPrice);
      if (!priceDecimal) {
        continue; // Descarte seguro de preços inválidos, NaN, infinitos ou negativos
      }

      // 3. Moeda (Estritamente BRL)
      const currency = validateBrapiCurrency(item.currency);
      if (!currency) {
        continue; // Descarte seguro de moedas ausentes, incompatíveis ou não-BRL
      }

      // 4. Data de Cotação (Exige Z ou Offset Explícito, sem Fallback Silencioso)
      const quoteDate = parseBrapiMarketDate(
        item.regularMarketTime ?? item.quoteDate ?? item.updatedAt
      );
      if (!quoteDate) {
        continue; // Descarte seguro de itens sem data válida ou com data ambígua
      }

      // 5. Delay Status: sempre 'unknown' para a BRAPI (não repassa valores arbitrários do payload)
      const delayStatus = 'unknown' as const;

      // 6. Metadados Opcionais
      const shortName = typeof item.shortName === 'string' ? item.shortName.trim() : null;
      const longName = typeof item.longName === 'string' ? item.longName.trim() : null;
      const notes = shortName || longName ? `Nome: ${shortName || longName}` : null;

      normalizedQuotes.push({
        ticker,
        price: priceDecimal,
        currency,
        quoteDate,
        source: 'brapi',
        delayStatus,
        notes,
      });
    }

    return normalizedQuotes;
  }

  /**
   * Resposta neutra para câmbio.
   * O adaptador BRAPI não atende a operações cambiais.
   */
  public async fetchExchangeRates(
    _pairs?: Array<{ fromCurrency: string; toCurrency?: string }>,
    _targetDate?: Date
  ): Promise<ProviderExchangeRateItem[]> {
    return [];
  }
}
