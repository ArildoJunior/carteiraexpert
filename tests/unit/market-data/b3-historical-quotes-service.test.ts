import { describe, it, expect, vi } from 'vitest';
import { getB3HistoricalQuotes } from '@/modules/market-data/server/b3-historical-quotes.service';

function createMockDb(totalCount = 0, rows: any[] = []) {
  const queryBuilder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnValue({
      tradeDate: 'trade_date',
      marketType: 'market_type',
      id: 'id',
      rowNumber: 'row_number',
    }),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
    then: (resolve: any) => resolve([{ count: totalCount }]),
  };

  return {
    select: vi.fn().mockReturnValue(queryBuilder),
  };
}

describe('b3-historical-quotes.service (Unit)', () => {
  it('deve formatar parâmetros padrão e retornar estrutura vazia caso não haja registros', async () => {
    const mockDb = createMockDb(0, []);

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
    const mockDb = createMockDb(0, []);

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
    const mockDb = createMockDb(250, []);

    const result = await getB3HistoricalQuotes(
      { ticker: 'ITUB4', limit: 500 },
      mockDb as any
    );

    expect(result.limit).toBe(100);
    expect(result.totalCount).toBe(250);
    expect(result.totalPages).toBe(3);
  });
});
