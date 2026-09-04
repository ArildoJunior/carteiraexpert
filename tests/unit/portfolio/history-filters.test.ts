import { describe, it, expect } from 'vitest';
import { listUserHistorySchema } from '@/modules/portfolio/domain/dashboard.schema';
import { serializeUserHistoryPaginatedResult } from '@/modules/portfolio/domain/position-engine';
import type { UserHistoryPaginatedResult } from '@/modules/portfolio/domain/dashboard.types';
import Decimal from 'decimal.js';

describe('listUserHistorySchema (Unit)', () => {
  it('aplica valores padrão para paginação quando nenhum parâmetro é informado', () => {
    const parsed = listUserHistorySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.portfolioId).toBeUndefined();
    expect(parsed.type).toBeUndefined();
    expect(parsed.ticker).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
  });

  it('transforma ticker para maiúsculo e remove espaços em branco', () => {
    const parsed = listUserHistorySchema.parse({
      ticker: '  petr4  ',
    });
    expect(parsed.ticker).toBe('PETR4');
  });

  it('aceita e converte números em strings para paginação', () => {
    const parsed = listUserHistorySchema.parse({
      page: '3',
      limit: '15',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(15);
  });

  it('rejeita página menor que 1', () => {
    expect(() =>
      listUserHistorySchema.parse({
        page: 0,
      })
    ).toThrow();
  });

  it('rejeita limit superior a 50', () => {
    expect(() =>
      listUserHistorySchema.parse({
        limit: 51,
      })
    ).toThrow();
  });

  it('valida tipo de operação permitido', () => {
    const parsedBuy = listUserHistorySchema.parse({ type: 'BUY' });
    expect(parsedBuy.type).toBe('BUY');

    const parsedSell = listUserHistorySchema.parse({ type: 'SELL' });
    expect(parsedSell.type).toBe('SELL');

    expect(() =>
      listUserHistorySchema.parse({ type: 'INVALID_TYPE' })
    ).toThrow();
  });

  it('converte datas válidas em objetos Date', () => {
    const parsed = listUserHistorySchema.parse({
      startDate: '2026-01-15',
      endDate: '2026-02-28',
    });
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.endDate).toBeInstanceOf(Date);
  });

  it('valida custodyAccountId quando fornecido como UUID válido e rejeita UUID inválido', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const parsed = listUserHistorySchema.parse({
      custodyAccountId: validUuid,
    });
    expect(parsed.custodyAccountId).toBe(validUuid);

    expect(() =>
      listUserHistorySchema.parse({
        custodyAccountId: 'invalid-custody-uuid',
      })
    ).toThrow();
  });
});

describe('serializeUserHistoryPaginatedResult (Unit)', () => {
  it('serializa corretamente os dados paginados e converte Decimals em strings formatadas', () => {
    const mockData: UserHistoryPaginatedResult = {
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          portfolioId: '123e4567-e89b-12d3-a456-426614174001',
          portfolioName: 'Carteira Principal',
          assetId: '123e4567-e89b-12d3-a456-426614174002',
          assetTicker: 'PETR4',
          assetName: 'Petrobras PN',
          assetMarket: 'B3',
          type: 'BUY',
          direction: null,
          tradeDate: new Date('2026-01-10T10:00:00.000Z'),
          settlementDate: new Date('2026-01-12T10:00:00.000Z'),
          quantity: '100.00000000',
          unitPrice: '35.50000000',
          fees: '5.25000000',
          currency: 'BRL',
          source: 'manual',
          custodyAccountId: '123e4567-e89b-12d3-a456-426614174099',
          notes: 'Compra inicial',
          createdBy: '123e4567-e89b-12d3-a456-426614174003',
          createdAt: new Date('2026-01-10T10:05:00.000Z'),
          deletedAt: null,
          cancellationReason: null,
        },
      ],
      totalCount: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    const serialized = serializeUserHistoryPaginatedResult(mockData);

    expect(serialized.totalCount).toBe(1);
    expect(serialized.page).toBe(1);
    expect(serialized.limit).toBe(20);
    expect(serialized.totalPages).toBe(1);
    expect(serialized.items).toHaveLength(1);

    const item = serialized.items[0];
    expect(item.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(item.portfolioName).toBe('Carteira Principal');
    expect(item.assetTicker).toBe('PETR4');
    expect(item.quantity).toBe('100.00000000');
    expect(item.unitPrice).toBe('35.50000000');
    expect(item.fees).toBe('5.25000000');
    expect(item.custodyAccountId).toBe('123e4567-e89b-12d3-a456-426614174099');
    expect(item.notes).toBe('Compra inicial');
    expect(item.tradeDate).toBe('2026-01-10T10:00:00.000Z');
  });
});
