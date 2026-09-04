import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateAnnualTax,
  validateTimelineEvents,
  identifyDayTradeEvents,
  DEFAULT_TAX_PREFERENCES,
} from '@/modules/tax/domain/tax-engine';
import type {
  TaxTimelineEvent,
  UserTaxPreferences,
} from '@/modules/tax/domain/tax.types';
import {
  TaxYearInFutureError,
  CurrencyMismatchError,
  InvalidAverageCostError,
  InvalidTaxQuantityError,
} from '@/modules/tax/domain/errors';

describe('Tax Engine — Motor Determinístico de Apuração Fiscal (Etapa 9)', () => {
  const targetYear = 2024;

  describe('Validações e Integridade Matemática', () => {
    it('deve bloquear apuração para ano no futuro', () => {
      const futureYear = new Date().getFullYear() + 1;
      expect(() => {
        validateTimelineEvents([], futureYear);
      }).toThrow(TaxYearInFutureError);
    });

    it('deve bloquear moeda estrangeira sem conversão explícita', () => {
      const foreignEvent: TaxTimelineEvent = {
        id: 'ev-1',
        portfolioId: 'p-1',
        assetId: 'a-1',
        assetSymbol: 'AAPL',
        assetName: 'Apple Inc.',
        assetType: 'stock',
        type: 'BUY',
        tradeDate: new Date('2024-03-10'),
        quantity: new Decimal('10'),
        unitPrice: new Decimal('150.00'),
        fees: new Decimal('0'),
        currency: 'USD',
      };

      expect(() => {
        validateTimelineEvents([foreignEvent], targetYear);
      }).toThrow(CurrencyMismatchError);
    });

    it('deve bloquear quantidade negativa', () => {
      const invalidEvent: TaxTimelineEvent = {
        id: 'ev-2',
        portfolioId: 'p-1',
        assetId: 'a-1',
        assetSymbol: 'PETR4',
        assetName: 'Petrobras',
        assetType: 'stock',
        type: 'BUY',
        tradeDate: new Date('2024-03-10'),
        quantity: new Decimal('-10'),
        unitPrice: new Decimal('30.00'),
        fees: new Decimal('0'),
        currency: 'BRL',
      };

      expect(() => {
        validateTimelineEvents([invalidEvent], targetYear);
      }).toThrow(InvalidTaxQuantityError);
    });

    it('deve bloquear preço negativo', () => {
      const invalidEvent: TaxTimelineEvent = {
        id: 'ev-3',
        portfolioId: 'p-1',
        assetId: 'a-1',
        assetSymbol: 'VALE3',
        assetName: 'Vale',
        assetType: 'stock',
        type: 'BUY',
        tradeDate: new Date('2024-03-10'),
        quantity: new Decimal('10'),
        unitPrice: new Decimal('-30.00'),
        fees: new Decimal('0'),
        currency: 'BRL',
      };

      expect(() => {
        validateTimelineEvents([invalidEvent], targetYear);
      }).toThrow(InvalidAverageCostError);
    });
  });

  describe('Cálculo de Preço Médio Ponderado e Vendas', () => {
    it('deve calcular corretamente preço médio ponderado após compras sucessivas com taxas', () => {
      // Compra 1: 100 ações a R$ 20,00 + R$ 5,00 taxas = Custo R$ 2.005,00 (médio = 20,05)
      // Compra 2: 100 ações a R$ 30,00 + R$ 5,00 taxas = Custo R$ 3.005,00 (total R$ 5.010,00 / 200 = 25,05)
      // Venda: 100 ações a R$ 35,00 (R$ 3.500,00) em Jan/2024 (vendas < 20k -> isento)
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras PN',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-01-05T10:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('20.00'),
          fees: new Decimal('5.00'),
          currency: 'BRL',
        },
        {
          id: 'ev-2',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras PN',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-01-10T10:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('30.00'),
          fees: new Decimal('5.00'),
          currency: 'BRL',
        },
        {
          id: 'ev-3',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras PN',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-01-20T10:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('35.00'),
          fees: new Decimal('0.00'),
          currency: 'BRL',
        },
      ];

      const report = calculateAnnualTax(events, targetYear);
      const jan = report.months[0];

      expect(jan.totalSalesStock.toFixed(2)).toBe('3500.00');
      expect(jan.isStockExempt).toBe(true);
      // Ganho líquido = 3500 - (100 * 25.05) = 3500 - 2505 = 995.00
      expect(jan.exemptGainStock.toFixed(2)).toBe('995.00');
      expect(jan.totalEstimatedTax.toFixed(2)).toBe('0.00');

      // Bens e direitos ao final do ano (sobram 100 ações ao custo médio de 25.05)
      expect(report.bensEDireitosSheet.length).toBe(1);
      const petr = report.bensEDireitosSheet[0];
      expect(petr.quantityAtYearEnd.toFixed(0)).toBe('100');
      expect(petr.averageCostAtYearEnd.toFixed(2)).toBe('25.05');
      expect(petr.totalCostAtYearEnd.toFixed(2)).toBe('2505.00');
    });
  });

  describe('Regra de Isenção de R$ 20.000,00 em Ações (IN RFB 2054/2024)', () => {
    it('quando vendas no mês <= 20k: ganho é isento e prejuízo NÃO compensa meses futuros', () => {
      // Jan: Venda de R$ 15.000 com prejuízo de R$ 2.000 (Isento, prejuízo descartado)
      // Fev: Venda de R$ 25.000 com lucro de R$ 5.000 (Tributável > 20k, sem compensar prejuízo de Jan)
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'MGLU3',
          assetName: 'Magazine Luiza',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-01-02T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('17.00'),
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-sell-jan',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'MGLU3',
          assetName: 'Magazine Luiza',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-01-15T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('15.00'), // Venda R$ 15.000, custo R$ 17.000 -> prejuízo R$ 2.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-buy-2',
          portfolioId: 'p-1',
          assetId: 'ast-2',
          assetSymbol: 'VALE3',
          assetName: 'Vale',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-02-01T10:00:00Z'),
          quantity: new Decimal('500'),
          unitPrice: new Decimal('40.00'), // Custo R$ 20.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-sell-fev',
          portfolioId: 'p-1',
          assetId: 'ast-2',
          assetSymbol: 'VALE3',
          assetName: 'Vale',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-02-20T10:00:00Z'),
          quantity: new Decimal('500'),
          unitPrice: new Decimal('50.00'), // Venda R$ 25.000 (> 20k) -> lucro R$ 5.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
      ];

      const report = calculateAnnualTax(events, targetYear);
      const jan = report.months[0];
      const fev = report.months[1];

      // Janeiro: Isento (15k <= 20k), prejuízo não entra em taxableLossStock
      expect(jan.totalSalesStock.toFixed(2)).toBe('15000.00');
      expect(jan.isStockExempt).toBe(true);
      expect(jan.taxableLossStock.toFixed(2)).toBe('0.00');
      expect(jan.newLossCreditsGenerated.length).toBe(0);

      // Fevereiro: Tributável (25k > 20k), alíquota 15% sobre R$ 5.000 = R$ 750,00
      expect(fev.totalSalesStock.toFixed(2)).toBe('25000.00');
      expect(fev.isStockExempt).toBe(false);
      expect(fev.taxableGainStock.toFixed(2)).toBe('5000.00');
      expect(fev.lossCompensatedSwing.toFixed(2)).toBe('0.00'); // Prejuízo de mês isento não compensa
      expect(fev.totalEstimatedTax.toFixed(2)).toBe('750.00');
    });

    it('quando vendas no mês > 20k: gera crédito de prejuízo que compensa meses posteriores', () => {
      // Março: Venda de R$ 30.000 (> 20k) com prejuízo de R$ 4.000 -> Gera crédito compensável
      // Abril: Venda de R$ 40.000 (> 20k) com lucro de R$ 10.000 -> Compensa R$ 4.000, tributa R$ 6.000
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-buy-mar',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'BBAS3',
          assetName: 'Banco do Brasil',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-03-01T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('34.00'), // Custo R$ 34.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-sell-mar',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'BBAS3',
          assetName: 'Banco do Brasil',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-03-15T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('30.00'), // Venda R$ 30.000 (> 20k) -> prejuízo R$ 4.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-buy-abr',
          portfolioId: 'p-1',
          assetId: 'ast-2',
          assetSymbol: 'ITUB4',
          assetName: 'Itaú Unibanco',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-04-01T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('30.00'), // Custo R$ 30.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-sell-abr',
          portfolioId: 'p-1',
          assetId: 'ast-2',
          assetSymbol: 'ITUB4',
          assetName: 'Itaú Unibanco',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-04-20T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('40.00'), // Venda R$ 40.000 (> 20k) -> lucro R$ 10.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
      ];

      const report = calculateAnnualTax(events, targetYear);
      const mar = report.months[2];
      const abr = report.months[3];

      // Março: Tributável com prejuízo -> gera crédito de R$ 4.000
      expect(mar.totalSalesStock.toFixed(2)).toBe('30000.00');
      expect(mar.isStockExempt).toBe(false);
      expect(mar.taxableLossStock.toFixed(2)).toBe('4000.00');
      expect(mar.newLossCreditsGenerated.length).toBe(1);
      expect(mar.newLossCreditsGenerated[0].amount.toFixed(2)).toBe('4000.00');

      // Abril: Lucro R$ 10.000 - Compensação R$ 4.000 = Base R$ 6.000 * 15% = R$ 900,00
      expect(abr.lossCompensatedSwing.toFixed(2)).toBe('4000.00');
      expect(abr.netTaxableSwingBase.toFixed(2)).toBe('6000.00');
      expect(abr.totalEstimatedTax.toFixed(2)).toBe('900.00');
    });
  });

  describe('Eventos Corporativos (Split, Grouping, Bonificação)', () => {
    it('desdobramento (Split) deve dobrar a quantidade e reduzir preço médio pela metade sem alterar custo total', () => {
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-buy',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'WEGE3',
          assetName: 'WEG',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-01-05T10:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('40.00'), // Custo total R$ 4.000,00
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-split',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'WEGE3',
          assetName: 'WEG',
          assetType: 'stock',
          type: 'SPLIT',
          tradeDate: new Date('2024-02-10T10:00:00Z'),
          quantity: new Decimal('0'),
          unitPrice: new Decimal('2.00'), // Desdobramento 1:2
          fees: new Decimal('0'),
          currency: 'BRL',
        },
      ];

      const report = calculateAnnualTax(events, targetYear);
      const item = report.bensEDireitosSheet[0];

      expect(item.quantityAtYearEnd.toFixed(0)).toBe('200');
      expect(item.averageCostAtYearEnd.toFixed(2)).toBe('20.00');
      expect(item.totalCostAtYearEnd.toFixed(2)).toBe('4000.00');
    });
  });

  describe('Proventos: Dividendos e JCP', () => {
    it('deve registrar dividendos como isentos e JCP com 15% de IRRF retido na fonte', () => {
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-div',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'ITUB4',
          assetName: 'Itaú',
          assetType: 'stock',
          type: 'DIVIDEND',
          tradeDate: new Date('2024-05-10T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('0.50'), // Total R$ 500,00
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-jcp',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'ITUB4',
          assetName: 'Itaú',
          assetType: 'stock',
          type: 'JCP',
          tradeDate: new Date('2024-06-15T10:00:00Z'),
          quantity: new Decimal('1000'),
          unitPrice: new Decimal('1.00'), // Bruto R$ 1.000,00
          fees: new Decimal('150.00'),     // IRRF 15% = R$ 150,00
          currency: 'BRL',
        },
      ];

      const report = calculateAnnualTax(events, targetYear);

      expect(report.totalRendimentosIsentosDividendos.toFixed(2)).toBe('500.00');
      expect(report.totalIrrfRetidoJcp.toFixed(2)).toBe('150.00');

      expect(report.rendimentosIsentosSheet.length).toBe(1);
      expect(report.tributacaoExclusivaSheet.length).toBe(1);

      const jcp = report.tributacaoExclusivaSheet[0];
      expect(jcp.grossAmount.toFixed(2)).toBe('1000.00');
      expect(jcp.irrfAmount.toFixed(2)).toBe('150.00');
      expect(jcp.netAmount.toFixed(2)).toBe('850.00');
    });
  });

  describe('Day-Trade', () => {
    it('deve identificar operações no mesmo dia e aplicar alíquota de 20% sem isenção de 20k', () => {
      const events: TaxTimelineEvent[] = [
        {
          id: 'ev-dt-buy',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras',
          assetType: 'stock',
          type: 'BUY',
          tradeDate: new Date('2024-07-10T11:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('30.00'), // R$ 3.000
          fees: new Decimal('0'),
          currency: 'BRL',
        },
        {
          id: 'ev-dt-sell',
          portfolioId: 'p-1',
          assetId: 'ast-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras',
          assetType: 'stock',
          type: 'SELL',
          tradeDate: new Date('2024-07-10T15:00:00Z'),
          quantity: new Decimal('100'),
          unitPrice: new Decimal('35.00'), // R$ 3.500 (lucro R$ 500 em vendas de R$ 3.500)
          fees: new Decimal('0'),
          currency: 'BRL',
        },
      ];

      const dayTradeIds = identifyDayTradeEvents(events);
      expect(dayTradeIds.has('ev-dt-buy')).toBe(true);
      expect(dayTradeIds.has('ev-dt-sell')).toBe(true);

      const report = calculateAnnualTax(events, targetYear);
      const jul = report.months[6];

      // Mesmo com vendas de R$ 3.500 (< 20k), Day-Trade é tributado a 20%
      expect(jul.dayTradeGain.toFixed(2)).toBe('500.00');
      expect(jul.dayTradeTax.toFixed(2)).toBe('100.00'); // 20% de 500 = 100
      expect(jul.totalEstimatedTax.toFixed(2)).toBe('100.00');
    });
  });
});
