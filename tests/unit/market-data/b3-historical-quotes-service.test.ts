import { describe, it, expect, vi } from 'vitest';
import { getB3HistoricalQuotes } from '@/modules/market-data/server/b3-historical-quotes.service';

describe('b3-historical-quotes.service (Unit)', () => {
  it('deve formatar parâmetros padrão e retornar estrutura vazia caso não haja registros', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
            // Para a query de contagem
            then: (resolve: any) => resolve([{ count: 0 }]),
          }),
        }),
      }),
    };

    const result = await getB3HistoricalQuotes(
      { ticker: 'PETR4' },
      mockDb as any
    );

    expect(result.ticker).toBe('PETR4');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.order).toBe('desc');
    expect(result.quotes).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  it('deve normalizar ticker em maiúsculas e remover espaços', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
            then: (resolve: any) => resolve([{ count: 0 }]),
          }),
        }),
      }),
    };

    const result = await getB3HistoricalQuotes(
      { ticker: '  vale3  ', page: 2, limit: 10, order: 'asc' },
      mockDb as any
    );

    expect(result.ticker).toBe('VALE3');
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.order).toBe('asc');
  });

  it('deve limitar a paginação máxima em 100 registros por página', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
            then: (resolve: any) => resolve([{ count: 250 }]),
          }),
        }),
      }),
    };

    const result = await getB3HistoricalQuotes(
      { ticker: 'ITUB4', limit: 500 },
      mockDb as any
    );

    expect(result.limit).toBe(100);
    expect(result.totalCount).toBe(250);
    expect(result.totalPages).toBe(3);
  });
});
