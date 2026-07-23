// lib/providers/registry.ts
// ProviderRegistry ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â cascata de provedores com fallback automÃƒÆ’Ã‚Â¡tico
// + log de cada chamada na tabela provider_breakdown (Drizzle)
// CarteiraExpert ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Cap 6 fundaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o

import { db } from '@/lib/db';
import { providerBreakdown } from '@/db/schema';
import type {
  ProviderAdapter,
  ProviderCategory,
  ProviderSuccess,
  ProviderFailure,
} from './types';
import { ProviderDataError, ProviderNotConfigured } from './types';

export class ProviderRegistry {
  private adapters = new Map<ProviderCategory, ProviderAdapter<any, any>[]>();

  register<TInput, TOutput>(adapter: ProviderAdapter<TInput, TOutput>): void {
    const list = this.adapters.get(adapter.category) ?? [];
    list.push(adapter as ProviderAdapter<any, any>);
    list.sort((a, b) => a.priority - b.priority);
    this.adapters.set(adapter.category, list);
    console.log(
      `[ProviderRegistry] Registrado: ${adapter.name} (${adapter.category}, priority=${adapter.priority})`,
    );
  }

  getAdapters(category: ProviderCategory): ProviderAdapter<any, any>[] {
    return this.adapters.get(category) ?? [];
  }

  /**
   * Tenta buscar nos provedores da categoria em ordem de prioridade.
   * Retorna o primeiro sucesso ou lanÃƒÆ’Ã‚Â§a ProviderDataError quando todos falham.
   */
  async fetch<TInput, TOutput>(
    category: ProviderCategory,
    input: TInput,
  ): Promise<ProviderSuccess<TOutput>> {
    const adapters = this.getAdapters(category);
    if (adapters.length === 0) {
      throw new Error(`Nenhum adapter registrado para categoria "${category}"`);
    }

    const failures: ProviderFailure[] = [];

    for (let i = 0; i < adapters.length; i++) {
      const adapter = adapters[i];
      if (!adapter) continue;
      const attempt = i + 1;
      const start = Date.now();

      if (!adapter.isConfigured()) {
        const failure: ProviderFailure = {
          ok: false,
          provider: adapter.name,
          category,
          status: 'skipped',
          error: 'nÃƒÆ’Ã‚Â£o configurado',
          latencyMs: 0,
          attempt,
          fetchedAt: new Date(),
        };
        failures.push(failure);
        await this.logFailure(failure);
        continue;
      }

      try {
        const data = await adapter.fetch(input);
        const latencyMs = Date.now() - start;

        const success: ProviderSuccess<TOutput> = {
          ok: true,
          data,
          provider: adapter.name,
          category,
          latencyMs,
          attempt,
          fetchedAt: new Date(),
        };

        await this.logSuccess(success);
        return success;
      } catch (err) {
        const latencyMs = Date.now() - start;
        const error = err as Error;
        const status: 'failed' | 'timeout' =
          error.name === 'ProviderTimeout' ? 'timeout' : 'failed';

        const failure: ProviderFailure = {
          ok: false,
          provider: adapter.name,
          category,
          status,
          error: error.message,
          latencyMs,
          attempt,
          fetchedAt: new Date(),
        };

        failures.push(failure);
        await this.logFailure(failure);
      }
    }

    const allSkipped = failures.every((f) => f.status === 'skipped');
    if (allSkipped) {
      throw new ProviderNotConfigured(failures[0]?.provider ?? 'unknown', category);
    }

    const lastFailure = failures[failures.length - 1] ?? { provider: 'unknown' };
    throw new ProviderDataError(
      lastFailure.provider,
      category,
      `Todos os provedores falharam (${failures.length}): ${failures
        .map((f) => `${f.provider}=${f.status} (${f.error})`)
        .join(' | ')}`,
    );
  }

  private async logSuccess(success: ProviderSuccess<any>): Promise<void> {
    try {
      await db.insert(providerBreakdown).values({
        provider: success.provider,
        category: success.category,
        status: 'success',
        attempt: success.attempt,
        latencyMs: success.latencyMs,
        fetchedAt: success.fetchedAt,
      });
    } catch (err) {
      console.error('[ProviderRegistry] Falha ao logar sucesso:', err);
    }
  }

  private async logFailure(failure: ProviderFailure): Promise<void> {
    try {
      await db.insert(providerBreakdown).values({
        provider: failure.provider,
        category: failure.category,
        status: failure.status,
        attempt: failure.attempt,
        latencyMs: failure.latencyMs,
        errorMessage: failure.error,
        fetchedAt: failure.fetchedAt,
      });
    } catch (err) {
      console.error('[ProviderRegistry] Falha ao logar falha:', err);
    }
  }
}

const globalForRegistry = globalThis as unknown as {
  providerRegistry: ProviderRegistry | undefined;
};

export function getProviderRegistry(): ProviderRegistry {
  if (!globalForRegistry.providerRegistry) {
    globalForRegistry.providerRegistry = new ProviderRegistry();
  }
  return globalForRegistry.providerRegistry;
}