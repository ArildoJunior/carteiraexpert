import { describe, it, expect, vi } from 'vitest';
import { ChartPreferenceSyncQueue } from '../../../src/modules/portfolio/ui/useChartPreferenceSync';
import type { SaveChartPreferenceInput } from '../../../src/modules/portfolio/domain/chart-preferences.schema';

describe('Unit: ChartPreferenceSyncQueue (Sincronização e Coalescência de Preferências)', () => {
  it('1. deve executar persistência única e transitar o status de saving para idle', async () => {
    const saveCalls: SaveChartPreferenceInput[] = [];
    const statusChanges: string[] = [];

    const mockSave = vi.fn(async (input: SaveChartPreferenceInput) => {
      saveCalls.push(input);
      return { success: true };
    });

    const queue = new ChartPreferenceSyncQueue(mockSave, (status) => {
      statusChanges.push(status);
    });

    expect(queue.getStatus()).toBe('idle');

    await queue.sync({
      chartArea: 'portfolio_evolution',
      period: '1M',
      viewMode: 'comparison',
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(saveCalls[0]).toEqual({
      chartArea: 'portfolio_evolution',
      period: '1M',
      viewMode: 'comparison',
    });
    expect(queue.getStatus()).toBe('idle');
    expect(statusChanges).toEqual(['saving', 'idle']);
  });

  it('2. deve coalescer alterações rápidas e garantir que a última intenção do usuário seja a última persistida', async () => {
    const saveCalls: SaveChartPreferenceInput[] = [];
    let concurrentExecutionCount = 0;
    let maxConcurrent = 0;

    const mockSave = vi.fn(
      (input: SaveChartPreferenceInput) =>
        new Promise<{ success: boolean }>((resolve) => {
          concurrentExecutionCount++;
          if (concurrentExecutionCount > maxConcurrent) {
            maxConcurrent = concurrentExecutionCount;
          }
          setTimeout(() => {
            saveCalls.push(input);
            concurrentExecutionCount--;
            resolve({ success: true });
          }, 30);
        })
    );

    const queue = new ChartPreferenceSyncQueue(mockSave);

    // Simula 3 cliques ultra-rápidos do usuário: 1M -> 3M -> YTD
    const p1 = queue.sync({
      chartArea: 'portfolio_evolution',
      period: '1M',
      viewMode: 'comparison',
    });

    const p2 = queue.sync({
      chartArea: 'portfolio_evolution',
      period: '3M',
      viewMode: 'comparison',
    });

    const p3 = queue.sync({
      chartArea: 'portfolio_evolution',
      period: 'YTD',
      viewMode: 'comparison',
    });

    await Promise.all([p1, p2, p3]);

    // Garantia 1: Nunca houve requisições concorrentes simultâneas (máximo 1 in-flight)
    expect(maxConcurrent).toBe(1);

    // Garantia 2: O intermediário '3M' foi coalescido e a chamada final foi 'YTD'
    expect(saveCalls).toHaveLength(2);
    expect(saveCalls[0].period).toBe('1M');
    expect(saveCalls[1].period).toBe('YTD');

    // Garantia 3: O último registro efetivamente salvo é a última escolha do usuário
    expect(saveCalls[saveCalls.length - 1].period).toBe('YTD');
    expect(queue.getStatus()).toBe('idle');
  });

  it('3. deve persistir snapshot completo em alterações rápidas na área de evolução (período e modo)', async () => {
    const saveCalls: SaveChartPreferenceInput[] = [];

    const mockSave = vi.fn(
      (input: SaveChartPreferenceInput) =>
        new Promise<{ success: boolean }>((resolve) => {
          setTimeout(() => {
            saveCalls.push(input);
            resolve({ success: true });
          }, 20);
        })
    );

    const queue = new ChartPreferenceSyncQueue(mockSave);

    // Clique 1: altera período para 6M
    const p1 = queue.sync({
      chartArea: 'portfolio_evolution',
      period: '6M',
      viewMode: 'comparison',
    });

    // Clique 2: logo em seguida altera modo para pnl
    const p2 = queue.sync({
      chartArea: 'portfolio_evolution',
      period: '6M',
      viewMode: 'pnl',
    });

    await Promise.all([p1, p2]);

    expect(saveCalls[saveCalls.length - 1]).toEqual({
      chartArea: 'portfolio_evolution',
      period: '6M',
      viewMode: 'pnl',
    });
  });

  it('4. deve persistir snapshot completo em alterações rápidas na área de alocação (agrupamento e base)', async () => {
    const saveCalls: SaveChartPreferenceInput[] = [];

    const mockSave = vi.fn(
      (input: SaveChartPreferenceInput) =>
        new Promise<{ success: boolean }>((resolve) => {
          setTimeout(() => {
            saveCalls.push(input);
            resolve({ success: true });
          }, 20);
        })
    );

    const queue = new ChartPreferenceSyncQueue(mockSave);

    // Clique 1: agrupa por moeda
    const p1 = queue.sync({
      chartArea: 'dashboard_allocation',
      groupingType: 'currency',
      basis: 'market_value',
    });

    // Clique 2: altera base para custo de aquisição
    const p2 = queue.sync({
      chartArea: 'dashboard_allocation',
      groupingType: 'currency',
      basis: 'cost_basis',
    });

    await Promise.all([p1, p2]);

    expect(saveCalls[saveCalls.length - 1]).toEqual({
      chartArea: 'dashboard_allocation',
      groupingType: 'currency',
      basis: 'cost_basis',
    });
  });

  it('5. deve ser resiliente a falhas transitórias de rede sem travar requisições subsequentes', async () => {
    let callCount = 0;
    const saveCalls: SaveChartPreferenceInput[] = [];

    const mockSave = vi.fn(async (input: SaveChartPreferenceInput) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Falha transitória de rede');
      }
      saveCalls.push(input);
      return { success: true };
    });

    const queue = new ChartPreferenceSyncQueue(mockSave);

    // Primeira chamada falha
    await queue.sync({
      chartArea: 'portfolio_allocation',
      groupingType: 'asset_type',
      basis: 'market_value',
    });

    // Segunda chamada deve ser processada normalmente
    await queue.sync({
      chartArea: 'portfolio_allocation',
      groupingType: 'currency',
      basis: 'cost_basis',
    });

    expect(queue.getStatus()).toBe('idle');
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]).toEqual({
      chartArea: 'portfolio_allocation',
      groupingType: 'currency',
      basis: 'cost_basis',
    });
  });
});
