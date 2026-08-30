import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  countBusinessDays,
  getB3TradingDay,
  getB3CivilDate,
  getB3DayOfWeek,
  isB3TradingDay,
} from '@/modules/market-data/server/unified-quote.service';

describe('Unified Quote Layer — Funções Puras e Regras de Negócio', () => {
  it('deve formatar data de pregão B3 no fuso America/Sao_Paulo corretamente', () => {
    const d1 = new Date('2026-08-26T18:00:00Z');
    expect(getB3TradingDay(d1)).toBe('2026-08-26');
  });

  it('deve recuar deterministicamente para a última sexta-feira durante o fim de semana', () => {
    // Sábado 2026-08-29 -> último pregão útil é Sexta-feira 2026-08-28
    const saturday = new Date('2026-08-29T15:00:00Z'); // 12:00 em SP
    expect(getB3TradingDay(saturday)).toBe('2026-08-28');
    expect(getB3TradingDay('2026-08-29')).toBe('2026-08-28');

    // Domingo 2026-08-30 -> último pregão útil é Sexta-feira 2026-08-28
    const sunday = new Date('2026-08-30T15:00:00Z'); // 12:00 em SP
    expect(getB3TradingDay(sunday)).toBe('2026-08-28');
    expect(getB3TradingDay('2026-08-30')).toBe('2026-08-28');

    // Sexta-feira 2026-08-28 -> permanece 2026-08-28
    expect(getB3TradingDay('2026-08-28')).toBe('2026-08-28');
  });

  it('deve identificar corretamente dias de pregão e fins de semana via isB3TradingDay', () => {
    expect(isB3TradingDay('2026-08-24')).toBe(true);  // Segunda
    expect(isB3TradingDay('2026-08-28')).toBe(true);  // Sexta
    expect(isB3TradingDay('2026-08-29')).toBe(false); // Sábado
    expect(isB3TradingDay('2026-08-30')).toBe(false); // Domingo
  });

  it('deve contar dias úteis decorridos e identificar cotação desatualizada', () => {
    const monday = new Date('2026-08-24T12:00:00Z');
    const wednesday = new Date('2026-08-26T12:00:00Z');
    const days = countBusinessDays(monday, wednesday);
    expect(days).toBe(2);

    // Sexta para Sábado -> 0 dias úteis
    expect(countBusinessDays('2026-08-28', '2026-08-29')).toBe(0);
    // Sexta para Domingo -> 0 dias úteis
    expect(countBusinessDays('2026-08-28', '2026-08-30')).toBe(0);
    // Sexta para Segunda -> 1 dia útil
    expect(countBusinessDays('2026-08-28', '2026-08-31')).toBe(1);
  });

  it('deve calcular variação diária percentual determinística usando Decimal', () => {
    const prevClose = new Decimal('40.00');
    const currentClose = new Decimal('42.00');
    const diff = currentClose.minus(prevClose);
    const variationPercent = diff.dividedBy(prevClose).times(100);

    expect(variationPercent.toFixed(2)).toBe('5.00');
  });

  it('deve calcular variação negativa percentual determinística usando Decimal', () => {
    const prevClose = new Decimal('20.00');
    const currentClose = new Decimal('18.00');
    const diff = currentClose.minus(prevClose);
    const variationPercent = diff.dividedBy(prevClose).times(100);

    expect(variationPercent.toFixed(2)).toBe('-10.00');
  });

  it('deve formatar datas civis em diferentes horários para o mesmo dia de pregão B3', () => {
    const morning = new Date('2026-08-26T03:00:00Z'); // 00:00 em SP
    const evening = new Date('2026-08-26T21:00:00Z'); // 18:00 em SP
    expect(getB3TradingDay(morning)).toBe('2026-08-26');
    expect(getB3TradingDay(evening)).toBe('2026-08-26');
  });
});
