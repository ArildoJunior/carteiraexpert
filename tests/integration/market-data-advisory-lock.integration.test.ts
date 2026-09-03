import { describe, it, expect } from 'vitest';
import { withAdvisoryLock, ADVISORY_LOCK_KEYS } from '@/lib/db/advisory-lock';

describe('PostgreSQL Advisory Lock (Integração)', () => {
  it('adquire o lock com sucesso e executa a operação exclusiva', async () => {
    const res = await withAdvisoryLock(ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER, async (client) => {
      const rows = await client`SELECT 1 as val`;
      return rows[0].val;
    });

    expect(res.acquired).toBe(true);
    expect(res.result).toBe(1);
    expect(res.lockedReason).toBeUndefined();
  });

  it('impede rigorosamente que uma segunda execução concorrente processe sob a mesma chave', async () => {
    let releaseHold: () => void;
    const holdPromise = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });

    // Inicia a primeira execução que detém o lock
    const firstLockPromise = withAdvisoryLock(ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER, async () => {
      await holdPromise;
      return 'primeira_concluida';
    });

    // Aguarda um pequeno intervalo para garantir que o primeiro lock foi efetivado no PostgreSQL
    await new Promise((r) => setTimeout(r, 50));

    // Segunda tentativa simultânea sobre a mesma chave
    const secondLockResult = await withAdvisoryLock(ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER, async () => {
      return 'segunda_concluida';
    });

    // A segunda tentativa DEVE ser sumariamente rejeitada
    expect(secondLockResult.acquired).toBe(false);
    expect(secondLockResult.lockedReason).toContain('já detido por outro processo ativo');
    expect(secondLockResult.result).toBeUndefined();

    // Libera a primeira execução
    releaseHold!();
    const firstResult = await firstLockPromise;
    expect(firstResult.acquired).toBe(true);
    expect(firstResult.result).toBe('primeira_concluida');
  });

  it('libera o lock no bloco finally após conclusão com sucesso, permitindo nova execução posterior', async () => {
    const res1 = await withAdvisoryLock(ADVISORY_LOCK_KEYS.B3_COTAHIST_INGESTION, async () => {
      return 'lote_1';
    });
    expect(res1.acquired).toBe(true);

    // Imediatamente após, uma nova execução deve adquirir o lock sem impedimentos
    const res2 = await withAdvisoryLock(ADVISORY_LOCK_KEYS.B3_COTAHIST_INGESTION, async () => {
      return 'lote_2';
    });
    expect(res2.acquired).toBe(true);
    expect(res2.result).toBe('lote_2');
  });

  it('libera o lock no bloco finally mesmo quando a operação lança um erro, evitando deadlocks', async () => {
    await expect(
      withAdvisoryLock(ADVISORY_LOCK_KEYS.CVM_DFP_INGESTION, async () => {
        throw new Error('Falha simulada durante parsing do lote CVM');
      })
    ).rejects.toThrow('Falha simulada durante parsing do lote CVM');

    // A execução subsequente deve conseguir adquirir o lock perfeitamente
    const resAposErro = await withAdvisoryLock(ADVISORY_LOCK_KEYS.CVM_DFP_INGESTION, async () => {
      return 'recuperado_com_sucesso';
    });

    expect(resAposErro.acquired).toBe(true);
    expect(resAposErro.result).toBe('recuperado_com_sucesso');
  });

  it('permite que processos com chaves de lock distintas executem em paralelo sem contenção', async () => {
    const [resB3, resCvm] = await Promise.all([
      withAdvisoryLock(ADVISORY_LOCK_KEYS.B3_COTAHIST_INGESTION, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'b3_ok';
      }),
      withAdvisoryLock(ADVISORY_LOCK_KEYS.CVM_DFP_INGESTION, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return 'cvm_ok';
      }),
    ]);

    expect(resB3.acquired).toBe(true);
    expect(resB3.result).toBe('b3_ok');
    expect(resCvm.acquired).toBe(true);
    expect(resCvm.result).toBe('cvm_ok');
  });
});
