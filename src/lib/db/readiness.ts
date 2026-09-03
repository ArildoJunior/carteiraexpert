import { sql } from 'drizzle-orm';
import { db } from './client';

/**
 * Executa uma verificação de prontidão (readiness) no PostgreSQL.
 * Executa 'SELECT 1' com timeout rigoroso de até 3000ms.
 * Não vaza detalhes de conexão ou stack trace em caso de falha.
 */
export async function checkDatabaseReadiness(timeoutMs = 3000): Promise<{ connected: boolean; error?: string }> {
  try {
    const checkPromise = (async () => {
      // Executa query simples SELECT 1
      await db.execute(sql`SELECT 1`);
      return true;
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
      // Desassocia o timer do event loop para não travar o processo
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    await Promise.race([checkPromise, timeoutPromise]);
    return { connected: true };
  } catch {
    return { connected: false, error: 'Database unreachable' };
  }
}
