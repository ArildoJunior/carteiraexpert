import { describe, it, expect } from 'vitest';
import {
  createPortfolioEventSchema,
  quantitySchema,
  unitPriceSchema,
  feesSchema,
  tradeDateSchema,
  eventDateSchema,
} from '../../../src/modules/portfolio/domain/portfolio-event.schema';
import { Decimal } from '../../../src/lib/decimal';
import crypto from 'node:crypto';

describe('Portfolio Event Domain Schemas (Unit Tests)', () => {
  const validPortfolioId = crypto.randomUUID();
  const validAssetId = crypto.randomUUID();
  const validTradeDate = new Date('2025-08-14T10:00:00Z');

  // ─── 1. Rejeição do Tipo Number do JS ─────────────────────────────────────
  describe('Rejeição Estrita do tipo "number" do JavaScript', () => {
    it('deve rejeitar quantity como number do JS', () => {
      const result = quantitySchema.safeParse(100);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar unitPrice como number do JS', () => {
      const result = unitPriceSchema.safeParse(35.5);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar fees como number do JS', () => {
      const result = feesSchema.safeParse(4.5);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar evento completo quando campos numéricos forem number do JS', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: validTradeDate,
        quantity: 100,
        unitPrice: 35.5,
        fees: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── 2. Rejeição de Notação Científica ────────────────────────────────────
  describe('Rejeição de Notação Científica', () => {
    it('deve rejeitar quantity com notação científica (1e5 / 1e-5)', () => {
      expect(quantitySchema.safeParse('1e5').success).toBe(false);
      expect(quantitySchema.safeParse('1E-5').success).toBe(false);
      expect(quantitySchema.safeParse('2.5e3').success).toBe(false);
    });

    it('deve rejeitar unitPrice com notação científica', () => {
      expect(unitPriceSchema.safeParse('1e2').success).toBe(false);
      expect(unitPriceSchema.safeParse('3.5e-1').success).toBe(false);
    });

    it('deve rejeitar fees com notação científica', () => {
      expect(feesSchema.safeParse('1e1').success).toBe(false);
    });
  });

  // ─── 3. Rejeição de Formatos Inválidos (NaN, Infinity, Strings vazias) ───
  describe('Rejeição de Formatos Inválidos e Caracteres Não Numéricos', () => {
    it('deve rejeitar string vazia ou apenas espaços', () => {
      expect(quantitySchema.safeParse('').success).toBe(false);
      expect(quantitySchema.safeParse('   ').success).toBe(false);
      expect(unitPriceSchema.safeParse('').success).toBe(false);
      expect(feesSchema.safeParse('').success).toBe(false);
    });

    it('deve rejeitar NaN e Infinity', () => {
      expect(quantitySchema.safeParse('NaN').success).toBe(false);
      expect(unitPriceSchema.safeParse('Infinity').success).toBe(false);
      expect(feesSchema.safeParse('-Infinity').success).toBe(false);
    });

    it('deve rejeitar caracteres alfanuméricos ou formatações incorretas com vírgula', () => {
      expect(quantitySchema.safeParse('10,50').success).toBe(false);
      expect(quantitySchema.safeParse('dez').success).toBe(false);
      expect(unitPriceSchema.safeParse('R$ 35.00').success).toBe(false);
    });
  });

  // ─── 4. Rejeição de Valores Negativos e Zero ──────────────────────────────
  describe('Validação de Sinais e Limites Mínimos', () => {
    it('deve rejeitar quantity igual a zero', () => {
      expect(quantitySchema.safeParse('0').success).toBe(false);
      expect(quantitySchema.safeParse('0.0000000000').success).toBe(false);
    });

    it('deve rejeitar quantity negativa', () => {
      expect(quantitySchema.safeParse('-10').success).toBe(false);
      expect(quantitySchema.safeParse('-0.0000000001').success).toBe(false);
    });

    it('deve rejeitar unitPrice negativo', () => {
      expect(unitPriceSchema.safeParse('-1').success).toBe(false);
      expect(unitPriceSchema.safeParse('-0.00000001').success).toBe(false);
    });

    it('deve aceitar unitPrice igual a zero (ex: bonificação / incorporação)', () => {
      const result = unitPriceSchema.safeParse('0');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe('0');
    });

    it('deve rejeitar fees negativo', () => {
      expect(feesSchema.safeParse('-1').success).toBe(false);
      expect(feesSchema.safeParse('-0.01').success).toBe(false);
    });

    it('deve aceitar fees igual a zero', () => {
      const result = feesSchema.safeParse('0');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe('0');
    });
  });

  // ─── 5. Limites de Precisão e Escala ──────────────────────────────────────
  describe('Limites Estritos de Escala e Precisão', () => {
    it('quantity: deve aceitar até 10 casas decimais e rejeitar 11', () => {
      expect(quantitySchema.safeParse('100.1234567890').success).toBe(true);
      expect(quantitySchema.safeParse('0.0000000001').success).toBe(true);

      // 11 casas decimais -> deve falhar
      expect(quantitySchema.safeParse('100.12345678901').success).toBe(false);
    });

    it('quantity: deve rejeitar mais de 28 dígitos significativos', () => {
      const maxDigits = '9'.repeat(18) + '.' + '9'.repeat(10); // 28 dígitos
      expect(quantitySchema.safeParse(maxDigits).success).toBe(true);

      const exceededDigits = '9'.repeat(19) + '.' + '9'.repeat(10); // 29 dígitos
      expect(quantitySchema.safeParse(exceededDigits).success).toBe(false);
    });

    it('unitPrice: deve aceitar até 8 casas decimais e rejeitar 9', () => {
      expect(unitPriceSchema.safeParse('35.12345678').success).toBe(true);

      // 9 casas decimais -> deve falhar
      expect(unitPriceSchema.safeParse('35.123456789').success).toBe(false);
    });

    it('unitPrice: deve rejeitar mais de 20 dígitos significativos', () => {
      const maxDigits = '9'.repeat(12) + '.' + '9'.repeat(8); // 20 dígitos
      expect(unitPriceSchema.safeParse(maxDigits).success).toBe(true);

      const exceededDigits = '9'.repeat(13) + '.' + '9'.repeat(8); // 21 dígitos
      expect(unitPriceSchema.safeParse(exceededDigits).success).toBe(false);
    });

    it('fees: deve aceitar até 8 casas decimais e rejeitar 9', () => {
      expect(feesSchema.safeParse('4.50000000').success).toBe(true);

      // 9 casas decimais -> deve falhar
      expect(feesSchema.safeParse('4.500000001').success).toBe(false);
    });
  });

  // ─── 6. Suporte à Instância de Decimal e Normalização de Fees ─────────────
  describe('Suporte Direto a Instâncias de Decimal e Normalização de Defaults', () => {
    it('deve aceitar instâncias de Decimal e normalizar para string convencional', () => {
      const decQuantity = new Decimal('250.75');
      const decPrice = new Decimal('38.90');
      const decFees = new Decimal('2.50');

      const qResult = quantitySchema.safeParse(decQuantity);
      expect(qResult.success).toBe(true);
      if (qResult.success) expect(qResult.data).toBe('250.75');

      const pResult = unitPriceSchema.safeParse(decPrice);
      expect(pResult.success).toBe(true);
      if (pResult.success) expect(pResult.data).toBe('38.9');

      const fResult = feesSchema.safeParse(decFees);
      expect(fResult.success).toBe(true);
      if (fResult.success) expect(fResult.data).toBe('2.5');
    });

    it('deve normalizar consistentemente fees omitido, "0", "0.00000000" e Decimal(0)', () => {
      // Fees omitido em createPortfolioEventSchema
      const eventOmittedFees = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
      });
      expect(eventOmittedFees.success).toBe(true);
      if (eventOmittedFees.success) {
        expect(eventOmittedFees.data.fees).toBe('0');
      }

      // Fees informado como "0"
      const eventZeroString = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
        fees: '0',
      });
      expect(eventZeroString.success).toBe(true);
      if (eventZeroString.success) {
        expect(eventZeroString.data.fees).toBe('0');
      }

      // Fees informado como "0.00000000"
      const eventZeroDecimalString = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
        fees: '0.00000000',
      });
      expect(eventZeroDecimalString.success).toBe(true);
      if (eventZeroDecimalString.success) {
        expect(eventZeroDecimalString.data.fees).toBe('0');
      }

      // Fees informado como new Decimal('0')
      const eventZeroDecimalInstance = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
        fees: new Decimal('0'),
      });
      expect(eventZeroDecimalInstance.success).toBe(true);
      if (eventZeroDecimalInstance.success) {
        expect(eventZeroDecimalInstance.data.fees).toBe('0');
      }
    });
  });

  // ─── 7. Validação Estrita de Datas, Calendário e Timezones ────────────────
  describe('eventDateSchema / tradeDateSchema - Validação Estrita de Calendário e Timezone', () => {
    it('deve aceitar string ISO com timezone "Z"', () => {
      const isoZ = '2025-08-14T10:00:00Z';
      const result = eventDateSchema.safeParse(isoZ);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeInstanceOf(Date);
        expect(result.data.toISOString()).toBe('2025-08-14T10:00:00.000Z');
      }
    });

    it('deve aceitar string ISO com offset explícito válido (ex: -03:00 e +02:00)', () => {
      const isoOffsetMinus = '2025-08-14T10:00:00-03:00';
      const resultMinus = eventDateSchema.safeParse(isoOffsetMinus);
      expect(resultMinus.success).toBe(true);
      if (resultMinus.success) {
        expect(resultMinus.data).toBeInstanceOf(Date);
        expect(resultMinus.data.toISOString()).toBe('2025-08-14T13:00:00.000Z');
      }

      const isoOffsetPlus = '2025-08-14T10:00:00+02:00';
      const resultPlus = eventDateSchema.safeParse(isoOffsetPlus);
      expect(resultPlus.success).toBe(true);
      if (resultPlus.success) {
        expect(resultPlus.data.toISOString()).toBe('2025-08-14T08:00:00.000Z');
      }
    });

    it('deve aceitar instâncias válidas de Date', () => {
      const dateObj = new Date('2025-08-10T12:00:00Z');
      const result = eventDateSchema.safeParse(dateObj);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.getTime()).toBe(dateObj.getTime());
      }
    });

    it('deve rejeitar datas de calendário inválidas que o JS normaliza silenciosamente (ex: 31 de fevereiro e 31 de abril)', () => {
      expect(eventDateSchema.safeParse('2026-02-31T10:00:00Z').success).toBe(false);
      expect(eventDateSchema.safeParse('2026-04-31T10:00:00Z').success).toBe(false);
      expect(eventDateSchema.safeParse('2025-02-29T10:00:00Z').success).toBe(false); // 2025 não é bissexto
      expect(eventDateSchema.safeParse('2024-02-29T10:00:00Z').success).toBe(true); // 2024 é bissexto
    });

    it('deve rejeitar offsets de timezone impossíveis ou fora do padrão (ex: +25:00 e -99:00)', () => {
      expect(eventDateSchema.safeParse('2025-08-14T10:00:00+25:00').success).toBe(false);
      expect(eventDateSchema.safeParse('2025-08-14T10:00:00-99:00').success).toBe(false);
      expect(eventDateSchema.safeParse('2025-08-14T10:00:00+14:30').success).toBe(false);
    });

    it('deve rejeitar string ISO sem timezone explícito', () => {
      const noTz = '2025-08-14T10:00:00';
      expect(eventDateSchema.safeParse(noTz).success).toBe(false);
    });

    it('deve rejeitar string apenas com data (sem hora/timezone)', () => {
      const dateOnly = '2025-08-14';
      expect(eventDateSchema.safeParse(dateOnly).success).toBe(false);
    });

    it('deve rejeitar datas em formatos locais ou ambíguos', () => {
      expect(eventDateSchema.safeParse('08/14/2025').success).toBe(false);
      expect(eventDateSchema.safeParse('14/08/2025').success).toBe(false);
      expect(eventDateSchema.safeParse('2025-08-14 10:00:00').success).toBe(false);
      expect(eventDateSchema.safeParse('invalid-date').success).toBe(false);
    });

    it('deve rejeitar tradeDate no futuro (ex: 2099-01-01T00:00:00Z)', () => {
      const futureIsoZ = '2099-01-01T10:00:00Z';
      expect(tradeDateSchema.safeParse(futureIsoZ).success).toBe(false);

      const futureDateObj = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
      expect(tradeDateSchema.safeParse(futureDateObj).success).toBe(false);
    });

    it('deve aceitar tradeDate determinística no passado de forma confiável e sem race condition', () => {
      const pastIso = '2024-01-01T10:00:00Z';
      expect(tradeDateSchema.safeParse(pastIso).success).toBe(true);

      const pastDateObj = new Date('2024-06-15T12:00:00Z');
      expect(tradeDateSchema.safeParse(pastDateObj).success).toBe(true);
    });
  });

  // ─── 8. Validação Completa de Evento e Cronologia de Datas ────────────────
  describe('createPortfolioEventSchema - Validação Integrada', () => {
    it('deve aceitar evento de compra (BUY) válido com liquidação posterior à negociação', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: '2025-08-10T10:00:00Z',
        settlementDate: '2025-08-12T10:00:00Z', // D+2
        quantity: '100.0000000000',
        unitPrice: '38.45000000',
        fees: '4.50000000',
        currency: 'BRL',
        notes: 'Compra via Home Broker',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.type).toBe('BUY');
      expect(result.data.quantity).toBe('100');
      expect(result.data.unitPrice).toBe('38.45');
      expect(result.data.fees).toBe('4.5');
      expect(result.data.source).toBe('manual');
    });

    it('deve aceitar liquidação na mesma data da negociação (D+0)', () => {
      const sameDate = '2025-08-14T08:00:00.000Z';
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: sameDate,
        settlementDate: sameDate,
        quantity: '50',
        unitPrice: '20.00',
      });

      expect(result.success).toBe(true);
    });

    it('deve rejeitar settlementDate anterior à tradeDate', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: '2025-08-14T08:00:00Z',
        settlementDate: '2025-08-10T08:00:00Z', // Data anterior
        quantity: '100',
        unitPrice: '38.45',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues[0].message).toContain('liquidação');
    });

    it('deve rejeitar evento com tradeDate no futuro', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: '2099-01-01T10:00:00Z',
        quantity: '100',
        unitPrice: '38.45',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues[0].message).toContain('futura');
    });

    it('deve rejeitar evento com tradeDate sem timezone explícito', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: '2025-08-14T10:00:00', // sem timezone
        quantity: '100',
        unitPrice: '38.45',
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar evento com tradeDate de calendário impossível', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: '2025-02-31T10:00:00Z', // data inexistente
        quantity: '100',
        unitPrice: '38.45',
      });

      expect(result.success).toBe(false);
    });

    it('deve aceitar evento sem settlementDate (opcional)', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'TRANSFER_IN',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '0',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.settlementDate).toBeUndefined();
      expect(result.data.fees).toBe('0');
    });

    it('deve rejeitar tipo de evento desconhecido', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'TIPO_INVALIDO',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar IDs de portfolio ou asset que não sejam UUIDs válidos', () => {
      const result = createPortfolioEventSchema.safeParse({
        portfolioId: 'id-invalido',
        assetId: validAssetId,
        type: 'SELL',
        tradeDate: validTradeDate,
        quantity: '10',
        unitPrice: '10',
      });

      expect(result.success).toBe(false);
    });
  });
});
