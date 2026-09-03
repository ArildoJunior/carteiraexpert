import { describe, it, expect, vi } from 'vitest';
import { executeWithTransientRetry, isTransientError } from '@/lib/utils/transient-retry';

describe('Utilitário de Retries Transitórios (executeWithTransientRetry)', () => {
  describe('Classificação de Erros (isTransientError)', () => {
    it('reconhece erros de rede por código do socket', () => {
      const err = new Error('Connection reset');
      (err as any).code = 'ECONNRESET';
      expect(isTransientError(err)).toBe(true);

      const errTimeout = new Error('Connection timed out');
      (errTimeout as any).code = 'ETIMEDOUT';
      expect(isTransientError(errTimeout)).toBe(true);
    });

    it('reconhece erros de rede por mensagem de timeout ou fetch failed', () => {
      expect(isTransientError(new Error('Request timeout after 5000ms'))).toBe(true);
      expect(isTransientError(new Error('TypeError: fetch failed'))).toBe(true);
      expect(isTransientError(new Error('Network error: connection dropped'))).toBe(true);
    });

    it('reconhece status HTTP 429 (Too Many Requests)', () => {
      const err = new Error('Rate limit exceeded');
      (err as any).status = 429;
      expect(isTransientError(err)).toBe(true);
    });

    it('reconhece status HTTP 5xx (500, 502, 503, 504)', () => {
      const err503 = new Error('Service Unavailable');
      (err503 as any).status = 503;
      expect(isTransientError(err503)).toBe(true);

      const err500 = new Error('Internal Server Error');
      (err500 as any).status = 500;
      expect(isTransientError(err500)).toBe(true);
    });

    it('rejeita erros determinísticos como não-transitórios', () => {
      expect(isTransientError(new Error('Invalid ZIP structure: corrupted header'))).toBe(false);
      expect(isTransientError(new Error('ZodValidationError: invalid schema'))).toBe(false);
      expect(isTransientError(null)).toBe(false);

      const err400 = new Error('Bad Request');
      (err400 as any).status = 400;
      expect(isTransientError(err400)).toBe(false);

      const err401 = new Error('Unauthorized');
      (err401 as any).status = 401;
      expect(isTransientError(err401)).toBe(false);
    });
  });

  describe('Execução com Retries', () => {
    it('retorna o resultado de primeira quando a operação é bem-sucedida', async () => {
      const op = vi.fn().mockResolvedValue('resultado_sucesso');

      const res = await executeWithTransientRetry(op, {
        maxRetries: 3,
        initialDelayMs: 10,
        jitter: false,
      });

      expect(res).toBe('resultado_sucesso');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('executa retry e tem sucesso na segunda tentativa para falha transitória', async () => {
      const transientErr = new Error('network timeout');
      const op = vi
        .fn()
        .mockRejectedValueOnce(transientErr)
        .mockResolvedValueOnce('sucesso_apos_retry');

      const onRetry = vi.fn();

      const res = await executeWithTransientRetry(op, {
        maxRetries: 3,
        initialDelayMs: 10,
        factor: 2,
        jitter: false,
        onRetry,
      });

      expect(res).toBe('sucesso_apos_retry');
      expect(op).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(transientErr, 1, 10);
    });

    it('não repete se o erro for determinístico (não-transitório)', async () => {
      const deterministicErr = new Error('Formato de arquivo inválido');
      const op = vi.fn().mockRejectedValue(deterministicErr);

      await expect(
        executeWithTransientRetry(op, {
          maxRetries: 3,
          initialDelayMs: 10,
          jitter: false,
        })
      ).rejects.toThrow('Formato de arquivo inválido');

      expect(op).toHaveBeenCalledTimes(1);
    });

    it('lança o erro original após esgotar o limite máximo de retries', async () => {
      const transientErr = new Error('ETIMEDOUT');
      (transientErr as any).code = 'ETIMEDOUT';
      const op = vi.fn().mockRejectedValue(transientErr);

      await expect(
        executeWithTransientRetry(op, {
          maxRetries: 3,
          initialDelayMs: 10,
          jitter: false,
        })
      ).rejects.toThrow('ETIMEDOUT');

      expect(op).toHaveBeenCalledTimes(3);
    });
  });
});
