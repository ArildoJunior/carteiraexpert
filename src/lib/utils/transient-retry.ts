/**
 * CarteiraExpert — Retries com Backoff Exponencial para Falhas Transitórias
 *
 * Provê resiliência e tolerância a falhas para chamadas de rede externas e downloads,
 * repetindo EXCLUSIVAMENTE erros de natureza transitória (como timeouts e instabilidade temporária)
 * e rejeitando sumariamente erros determinísticos (como falhas de parsing ou validação).
 */

export interface RetryOptions {
  /** Número máximo de tentativas (padrão: 3) */
  maxRetries?: number;
  /** Atraso inicial em milissegundos (padrão: 500ms) */
  initialDelayMs?: number;
  /** Atraso máximo teto em milissegundos (padrão: 5000ms) */
  maxDelayMs?: number;
  /** Fator multiplicador do backoff (padrão: 2) */
  factor?: number;
  /** Função customizada de classificação de erro */
  isTransient?: (error: unknown) => boolean;
  /** Callback executado antes de cada retry */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Se deve aplicar jitter aleatório de até 20% (padrão: true) */
  jitter?: boolean;
}

/**
 * Classifica se um erro é puramente transitório (passível de resolução com retry).
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const code = (error as { code?: string }).code?.toString().toLowerCase();

    // Erros conhecidos de rede e sockets no Node.js
    if (
      code === 'econnreset' ||
      code === 'econnrefused' ||
      code === 'etimedout' ||
      code === 'eai_again' ||
      code === 'enotfound' ||
      code === 'und_err_connect_timeout' ||
      code === 'und_err_socket'
    ) {
      return true;
    }

    // Padrões textuais de timeout e falha de rede
    if (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('network error') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset')
    ) {
      return true;
    }

    // Códigos de status HTTP (429 Rate Limit ou 5xx Server Error)
    const status =
      (error as { status?: number }).status ??
      (error as { statusCode?: number }).statusCode;

    if (typeof status === 'number') {
      if (status === 429 || (status >= 500 && status <= 599)) {
        return true;
      }
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma operação assíncrona aplicando retries automáticos com backoff exponencial
 * para falhas transitórias.
 */
export async function executeWithTransientRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = Math.max(options.maxRetries ?? 3, 1);
  const initialDelayMs = Math.max(options.initialDelayMs ?? 500, 1);
  const maxDelayMs = Math.max(options.maxDelayMs ?? 5000, initialDelayMs);
  const factor = Math.max(options.factor ?? 2, 1.1);
  const checkTransient = options.isTransient ?? isTransientError;
  const useJitter = options.jitter ?? true;

  let attempt = 1;

  while (true) {
    try {
      return await operation(attempt);
    } catch (err: unknown) {
      const isTransient = checkTransient(err);

      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }

      // Cálculo do backoff exponencial: initialDelay * factor^(attempt - 1)
      let delayMs = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);

      if (useJitter) {
        // Jitter entre 0.8x e 1.2x do delay calculado
        const jitterMultiplier = 0.8 + Math.random() * 0.4;
        delayMs = Math.min(Math.round(delayMs * jitterMultiplier), maxDelayMs);
      }

      if (options.onRetry) {
        options.onRetry(err, attempt, delayMs);
      }

      await sleep(delayMs);
      attempt++;
    }
  }
}
