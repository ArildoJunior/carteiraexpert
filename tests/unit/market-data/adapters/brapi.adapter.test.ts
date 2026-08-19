import { describe, it, expect, vi } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  BrapiMarketDataProviderAdapter,
  BrapiConfigurationError,
  BrapiProviderError,
} from '../../../../src/modules/market-data/server/adapters/brapi.adapter';

describe('Unitário: BrapiMarketDataProviderAdapter (Correções Finais)', () => {
  const dummyToken = 'valid_test_token_12345';

  describe('1. Validação e Segurança de Credenciais', () => {
    it('deve lançar BrapiConfigurationError se o token estiver ausente ou vazio', async () => {
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: '',
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiConfigurationError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/BRAPI_TOKEN não configurada/);
    });

    it('deve lançar BrapiConfigurationError se o token for um placeholder', async () => {
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: 'replace-with-brapi-token',
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiConfigurationError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/placeholder não preenchido/);
    });

    it('deve lançar BrapiConfigurationError se o token for PUBLIC', async () => {
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: 'PUBLIC',
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiConfigurationError);
    });

    it('deve utilizar cabeçalho Authorization: Bearer e NÃO incluir token na query string da URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              currency: 'BRL',
              regularMarketTime: '2026-08-18T19:00:00.000Z',
            },
          ],
        }),
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await adapter.fetchQuotes(['PETR4']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];

      // Garante que a URL não contém o token
      expect(calledUrl).toBe('https://brapi.dev/api/quote/PETR4');
      expect(calledUrl).not.toContain(dummyToken);
      expect(calledUrl).not.toContain('token=');

      // Garante que o cabeçalho Authorization contém o Bearer token
      expect(calledInit.headers['Authorization']).toBe(`Bearer ${dummyToken}`);
    });

    it('deve sanitizar o token em caso de erro de rede ou exceção', async () => {
      const secretToken = 'super_secret_raw_token_xyz987';
      const mockFetch = vi.fn().mockRejectedValue(
        new Error(`Falha de conexão com Authorization: Bearer ${secretToken}`)
      );

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: secretToken,
        customFetch: mockFetch as any,
      });

      try {
        await adapter.fetchQuotes(['PETR4']);
        expect.unreachable('Deveria ter lançado erro');
      } catch (err: any) {
        expect(err.message).not.toContain(secretToken);
        expect(err.message).toContain('***');
      }
    });
  });

  describe('2. Validação Estrita de Timezone e Datas', () => {
    it('deve aceitar strings ISO com Z explícito', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'PETR4',
            regularMarketPrice: 38.5,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['PETR4']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('PETR4');
      expect(new Date(quotes[0].quoteDate).toISOString()).toBe('2026-08-18T19:00:00.000Z');
    });

    it('deve aceitar strings ISO com offset explícito (-03:00, +00:00)', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'VALE3',
            regularMarketPrice: 62.1,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T16:00:00-03:00', // 16:00 em -03:00 = 19:00 UTC
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['VALE3']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALE3');
      expect(new Date(quotes[0].quoteDate).toISOString()).toBe('2026-08-18T19:00:00.000Z');
    });

    it('deve aceitar timestamps numéricos Unix válidos', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'ITUB4',
            regularMarketPrice: 34.2,
            currency: 'BRL',
            regularMarketTime: 1787079600, // 2026-08-18T19:00:00.000Z em segundos
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['ITUB4']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('ITUB4');
      expect(new Date(quotes[0].quoteDate).toISOString()).toBe('2026-08-18T19:00:00.000Z');
    });

    it('deve descartar itens com data sem timezone explícito (rejeição de ambiguidade)', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'SEM_TZ_1',
            regularMarketPrice: 10.0,
            currency: 'BRL',
            regularMarketTime: '2026-08-18 19:00:00', // Sem Z nem offset
          },
          {
            symbol: 'SEM_TZ_2',
            regularMarketPrice: 20.0,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00', // Sem Z nem offset
          },
          {
            symbol: 'SEM_TZ_3',
            regularMarketPrice: 30.0,
            currency: 'BRL',
            regularMarketTime: '2026-08-18', // Apenas data sem timezone
          },
          {
            symbol: 'VALIDO_COM_Z',
            regularMarketPrice: 40.0,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['SEM_TZ_1', 'SEM_TZ_2', 'SEM_TZ_3', 'VALIDO_COM_Z']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALIDO_COM_Z');
    });

    it('deve descartar itens com data ausente, nula ou inválida', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'P1',
            regularMarketPrice: 38.5,
            currency: 'BRL',
            regularMarketTime: null,
          },
          {
            symbol: 'P2',
            regularMarketPrice: 62.1,
            currency: 'BRL',
            // regularMarketTime ausente
          },
          {
            symbol: 'P3',
            regularMarketPrice: 34.2,
            currency: 'BRL',
            regularMarketTime: 'texto_invalido_de_data',
          },
          {
            symbol: 'P4',
            regularMarketPrice: 15.0,
            currency: 'BRL',
            regularMarketTime: -500, // Timestamp negativo inválido
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['P1', 'P2', 'P3', 'P4']);
      expect(quotes).toHaveLength(0);
    });
  });

  describe('3. Validação Estrita de Moeda (Escopo BRL)', () => {
    it('deve aceitar BRL (maiúsculo ou minúsculo) e normalizar para BRL', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'PETR4',
            regularMarketPrice: 38.5,
            currency: 'brl',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
          },
          {
            symbol: 'VALE3',
            regularMarketPrice: 62.1,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['PETR4', 'VALE3']);
      expect(quotes).toHaveLength(2);
      expect(quotes[0].currency).toBe('BRL');
      expect(quotes[1].currency).toBe('BRL');
    });

    it('deve descartar itens com moeda ausente, inválida ou incompatível (ex: USD, EUR, XYZ)', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'SEMMOEDA',
            regularMarketPrice: 10.0,
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            currency: null,
          },
          {
            symbol: 'MOEDA_INVALIDA',
            regularMarketPrice: 20.0,
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            currency: 'XYZ',
          },
          {
            symbol: 'MOEDA_USD',
            regularMarketPrice: 30.0,
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            currency: 'USD',
          },
          {
            symbol: 'VALIDO_BRL',
            regularMarketPrice: 40.0,
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            currency: 'BRL',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['SEMMOEDA', 'MOEDA_INVALIDA', 'MOEDA_USD', 'VALIDO_BRL']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALIDO_BRL');
    });
  });

  describe('4. Validação Estrita de Preço (Finitude, Positividade e Decimal)', () => {
    it('deve rejeitar valores não finitos, NaN, negativos, nulos e strings equivalentes', async () => {
      const mockPayload = {
        results: [
          { symbol: 'A1', regularMarketPrice: Infinity, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A2', regularMarketPrice: -Infinity, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A3', regularMarketPrice: NaN, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A4', regularMarketPrice: 'Infinity', currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A5', regularMarketPrice: '-Infinity', currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A6', regularMarketPrice: 'NaN', currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A7', regularMarketPrice: -38.5, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A8', regularMarketPrice: '-10.0', currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A9', regularMarketPrice: '', currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A10', regularMarketPrice: null, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'A11', regularMarketPrice: true, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
          { symbol: 'VALIDO', regularMarketPrice: 55.4, currency: 'BRL', regularMarketTime: '2026-08-18T19:00:00.000Z' },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['ALL_TESTS']);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALIDO');
      expect(quotes[0].price).toBeInstanceOf(Decimal);
      expect(quotes[0].price.toString()).toBe('55.4');
    });
  });

  describe('5. Defasagem Temporal (DelayStatus sempre unknown)', () => {
    it('deve sempre atribuir delayStatus unknown, ignorando qualquer status arbitrário no payload', async () => {
      const mockPayload = {
        results: [
          {
            symbol: 'PETR4',
            regularMarketPrice: 38.5,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            delayStatus: 'realtime', // Tentativa de simular tempo real
          },
          {
            symbol: 'VALE3',
            regularMarketPrice: 62.1,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            delayStatus: 'delayed_15m', // Tentativa de fixar 15m
          },
          {
            symbol: 'ITUB4',
            regularMarketPrice: 34.2,
            currency: 'BRL',
            regularMarketTime: '2026-08-18T19:00:00.000Z',
            delayStatus: 'eod', // Tentativa de fixar eod
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['PETR4', 'VALE3', 'ITUB4']);
      expect(quotes).toHaveLength(3);
      expect(quotes[0].delayStatus).toBe('unknown');
      expect(quotes[1].delayStatus).toBe('unknown');
      expect(quotes[2].delayStatus).toBe('unknown');
    });
  });

  describe('6. Tratamento de targetDate e Rejeição de Datas Não Suportadas', () => {
    it('deve executar com sucesso quando targetDate não for informado (cotação corrente)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              currency: 'BRL',
              regularMarketTime: '2026-08-18T19:00:00.000Z',
            },
          ],
        }),
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['PETR4']);
      expect(quotes).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deve executar com sucesso quando targetDate for a data corrente (hoje em UTC)', async () => {
      const todayUtc = new Date();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              currency: 'BRL',
              regularMarketTime: '2026-08-18T19:00:00.000Z',
            },
          ],
        }),
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const quotes = await adapter.fetchQuotes(['PETR4'], todayUtc);
      expect(quotes).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deve rejeitar explicitamente targetDate do dia anterior (data histórica) sem fazer chamada de rede', async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      const mockFetch = vi.fn();
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'], yesterday)).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'], yesterday)).rejects.toThrow(
        /aceita somente cotações correntes do dia atual em UTC/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve rejeitar explicitamente targetDate de uma data futura sem fazer chamada de rede', async () => {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

      const mockFetch = vi.fn();
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'], tomorrow)).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'], tomorrow)).rejects.toThrow(
        /aceita somente cotações correntes do dia atual em UTC/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve rejeitar explicitamente Invalid Date sem lançar exceção não capturada e sem fazer chamada de rede', async () => {
      const invalidDate = new Date('data_invalida_invalida');
      const mockFetch = vi.fn();

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'], invalidDate)).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'], invalidDate)).rejects.toThrow(
        /aceita somente cotações correntes do dia atual em UTC/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('7. Tratamento de Erros HTTP e Respostas Inválidas', () => {
    it('deve tratar erro 401/403 com mensagem de autenticação', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/Falha de autenticação na BRAPI/);
    });

    it('deve tratar erro 429 com mensagem de rate limit', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/rate limit/);
    });

    it('deve tratar erro 500 com mensagem de erro do servidor', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/HTTP 500/);
    });

    it('deve tratar timeout da requisição via AbortController', async () => {
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        timeoutMs: 30,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(BrapiProviderError);
      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/Timeout de 30ms excedido/);
    });

    it('deve tratar resposta com JSON malformado', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });

      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      await expect(adapter.fetchQuotes(['PETR4'])).rejects.toThrow(/não foi possível interpretar o JSON/);
    });
  });

  describe('8. Comportamento Cambial (fetchExchangeRates)', () => {
    it('deve retornar array vazio sem fazer chamadas de rede', async () => {
      const mockFetch = vi.fn();
      const adapter = new BrapiMarketDataProviderAdapter({
        apiToken: dummyToken,
        customFetch: mockFetch as any,
      });

      const fxRates = await adapter.fetchExchangeRates([{ fromCurrency: 'USD', toCurrency: 'BRL' }]);
      expect(fxRates).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
