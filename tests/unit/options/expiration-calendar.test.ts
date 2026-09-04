import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateEasterSunday,
  getB3HolidaysForYear,
  isB3TradingDay,
  calculateB3BusinessDays,
  calculateCalendarDays,
  calculateExpirationStatus,
  generateProximityAlert,
} from '@/modules/options/domain/expiration-calendar';

describe('B3 Expiration Calendar and Trading Days', () => {
  describe('Cálculo Canônico da Páscoa e Feriados Móveis', () => {
    it('deve calcular a data correta da Páscoa para anos conhecidos', () => {
      // 2024: 31 de Março
      const easter2024 = calculateEasterSunday(2024);
      expect(easter2024).toEqual({ month: 3, day: 31 });

      // 2025: 20 de Abril
      const easter2025 = calculateEasterSunday(2025);
      expect(easter2025).toEqual({ month: 4, day: 20 });

      // 2026: 05 de Abril
      const easter2026 = calculateEasterSunday(2026);
      expect(easter2026).toEqual({ month: 4, day: 5 });
    });

    it('deve incluir feriados fixos e móveis no conjunto da B3', () => {
      const holidays2026 = getB3HolidaysForYear(2026);

      // Feriados fixos
      expect(holidays2026.has('2026-01-01')).toBe(true); // Ano Novo
      expect(holidays2026.has('2026-04-21')).toBe(true); // Tiradentes
      expect(holidays2026.has('2026-05-01')).toBe(true); // Dia do Trabalho
      expect(holidays2026.has('2026-09-07')).toBe(true); // Independência
      expect(holidays2026.has('2026-10-12')).toBe(true); // N. Sra. Aparecida
      expect(holidays2026.has('2026-11-02')).toBe(true); // Finados
      expect(holidays2026.has('2026-11-15')).toBe(true); // Proclamação da República
      expect(holidays2026.has('2026-11-20')).toBe(true); // Consciência Negra
      expect(holidays2026.has('2026-12-25')).toBe(true); // Natal

      // Feriados móveis 2026 (Páscoa em 05/04/2026)
      // Carnaval: 16/02 e 17/02
      expect(holidays2026.has('2026-02-16')).toBe(true);
      expect(holidays2026.has('2026-02-17')).toBe(true);
      // Sexta Santa: 03/04
      expect(holidays2026.has('2026-04-03')).toBe(true);
      // Corpus Christi: 04/06
      expect(holidays2026.has('2026-06-04')).toBe(true);
    });
  });

  describe('Identificação de Dias Úteis B3 (Trading Days)', () => {
    it('deve identificar fins de semana como dias não úteis', () => {
      expect(isB3TradingDay('2026-09-05')).toBe(false); // Sábado
      expect(isB3TradingDay('2026-09-06')).toBe(false); // Domingo
    });

    it('deve identificar feriados B3 como dias não úteis', () => {
      expect(isB3TradingDay('2026-09-07')).toBe(false); // Independência (Segunda-feira)
    });

    it('deve identificar terças a sextas normais como dias de negociação', () => {
      expect(isB3TradingDay('2026-09-08')).toBe(true); // Terça-feira útil
      expect(isB3TradingDay('2026-09-09')).toBe(true); // Quarta-feira útil
    });
  });

  describe('Contagem de Dias Úteis e Corridos', () => {
    it('deve contar zero dias quando as datas são iguais', () => {
      expect(calculateCalendarDays('2026-09-08', '2026-09-08')).toBe(0);
      expect(calculateB3BusinessDays('2026-09-08', '2026-09-08')).toBe(0);
    });

    it('deve desconsiderar fim de semana e feriado na contagem de dias úteis', () => {
      // De sexta 2026-09-04 até terça 2026-09-08:
      // Sábado 05/09 (não útil)
      // Domingo 06/09 (não útil)
      // Segunda 07/09 (feriado nacional Independência)
      // Terça 08/09 (útil -> 1 dia útil)
      expect(calculateB3BusinessDays('2026-09-04', '2026-09-08')).toBe(1);
      expect(calculateCalendarDays('2026-09-04', '2026-09-08')).toBe(4);
    });

    it('deve retornar número negativo se data final for anterior à inicial', () => {
      expect(calculateB3BusinessDays('2026-09-08', '2026-09-04')).toBe(-1);
      expect(calculateCalendarDays('2026-09-08', '2026-09-04')).toBe(-4);
    });
  });

  describe('Cálculo de Status de Proximidade e Alertas D-5 e D-0', () => {
    const mockContract = {
      id: '11111111-1111-1111-1111-111111111111',
      ticker: 'PETRH380',
      optionType: 'CALL' as const,
      direction: 'BUY' as const,
      strikePrice: new Decimal('38.00'),
    };

    it('deve classificar como DISTANT quando faltam mais de 5 dias úteis', () => {
      const status = calculateExpirationStatus('2026-09-01', '2026-09-30');
      expect(status.status).toBe('DISTANT');
      expect(status.isDMinus5OrLess).toBe(false);
      expect(status.isD0).toBe(false);
      expect(status.isExpired).toBe(false);

      const alert = generateProximityAlert({ ...mockContract, expirationDate: '2026-09-30' }, '2026-09-01');
      expect(alert).toBeNull(); // Não gera alerta antecipado para > 5 DU
    });

    it('deve classificar como NEAR_EXPIRATION e gerar alerta WARNING para D-5 a D-1', () => {
      // De terça 2026-09-08 até sexta 2026-09-11 (3 dias úteis)
      const status = calculateExpirationStatus('2026-09-08', '2026-09-11');
      expect(status.status).toBe('NEAR_EXPIRATION');
      expect(status.businessDays).toBe(3);
      expect(status.isDMinus5OrLess).toBe(true);

      const alert = generateProximityAlert({ ...mockContract, expirationDate: '2026-09-11' }, '2026-09-08');
      expect(alert).not.toBeNull();
      expect(alert?.alertLevel).toBe('WARNING');
      expect(alert?.title).toContain('3 DU');
      expect(alert?.message).toContain('3 dias úteis');
    });

    it('deve classificar como EXPIRING_TODAY e gerar alerta CRITICAL para D-0', () => {
      const status = calculateExpirationStatus('2026-09-18', '2026-09-18');
      expect(status.status).toBe('EXPIRING_TODAY');
      expect(status.isD0).toBe(true);
      expect(status.isDMinus5OrLess).toBe(true);

      const alert = generateProximityAlert({ ...mockContract, expirationDate: '2026-09-18' }, '2026-09-18');
      expect(alert).not.toBeNull();
      expect(alert?.alertLevel).toBe('CRITICAL');
      expect(alert?.title).toContain('VENCENDO HOJE');
    });

    it('deve classificar como EXPIRED e gerar alerta EXPIRED quando a data já passou', () => {
      const status = calculateExpirationStatus('2026-09-20', '2026-09-18');
      expect(status.status).toBe('EXPIRED');
      expect(status.isExpired).toBe(true);

      const alert = generateProximityAlert({ ...mockContract, expirationDate: '2026-09-18' }, '2026-09-20');
      expect(alert).not.toBeNull();
      expect(alert?.alertLevel).toBe('EXPIRED');
      expect(alert?.title).toContain('Contrato Vencido');
    });
  });
});
