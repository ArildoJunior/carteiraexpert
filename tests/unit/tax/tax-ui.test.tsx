import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TaxDisclaimerBanner } from '@/modules/tax/ui/TaxDisclaimerBanner';
import { TaxMonthlyReportCard } from '@/modules/tax/ui/TaxMonthlyReportCard';
import { TaxAnnualReportView } from '@/modules/tax/ui/TaxAnnualReportView';
import type {
  SerializedTaxMonthlyCalculationResult,
  SerializedTaxAnnualReport,
  SerializedUserTaxPreferences,
} from '@/modules/tax/domain/tax.types';

describe('Tax UI Components Unit Tests (SSR Render)', () => {
  describe('TaxDisclaimerBanner', () => {
    it('deve renderizar com id tax-regulatory-disclaimer e conter os 4 avisos obrigatórios', () => {
      const html = renderToString(<TaxDisclaimerBanner />);
      expect(html).toContain('id="tax-regulatory-disclaimer"');
      expect(html).toContain('não substitui o cálculo oficial');
      expect(html).toContain('NÃO emite DARF');
      expect(html).toContain('NÃO integra com o e-CAC/Receita Federal');
      expect(html).toContain('O usuário é o único responsável');
      expect(html).toContain('Regras tributárias podem mudar');
    });

    it('deve renderizar versão compacta corretamente', () => {
      const html = renderToString(<TaxDisclaimerBanner compact />);
      expect(html).toContain('Módulo Auxiliar de IRPF:');
      expect(html).toContain('não emite DARF');
    });
  });

  describe('TaxMonthlyReportCard', () => {
    const mockMonth: SerializedTaxMonthlyCalculationResult = {
      year: 2024,
      month: 1,
      totalSalesOverall: '15000.00',
      totalSalesStock: '15000.00',
      totalSalesFii: '0.00',
      totalSalesEtfBdr: '0.00',
      isStockExempt: true,
      exemptGainStock: '2500.00',
      taxableGainStock: '0.00',
      taxableLossStock: '0.00',
      fiiGain: '0.00',
      fiiLoss: '0.00',
      etfBdrGain: '0.00',
      etfBdrLoss: '0.00',
      dayTradeGain: '0.00',
      dayTradeLoss: '0.00',
      grossTaxableSwingBase: '0.00',
      grossTaxableDayTradeBase: '0.00',
      lossCompensatedSwing: '0.00',
      lossCompensatedDayTrade: '0.00',
      netTaxableSwingBase: '0.00',
      netTaxableDayTradeBase: '0.00',
      swingTradeTax: '0.00',
      dayTradeTax: '0.00',
      totalEstimatedTax: '0.00',
      assetResults: [
        {
          assetId: 'a-1',
          assetSymbol: 'PETR4',
          assetName: 'Petrobras PN',
          assetType: 'stock',
          salesCount: 1,
          totalQuantitySold: '500.0000',
          totalSalesProceeds: '15000.00',
          totalCostOfGoodsSold: '12500.00',
          averageCostAtSale: '25.0000',
          netGainLoss: '2500.00',
          isDayTrade: false,
        },
      ],
    };

    it('deve renderizar badge de isenção quando isStockExempt for true', () => {
      const html = renderToString(<TaxMonthlyReportCard monthResult={mockMonth} />);
      expect(html).toContain('Janeiro');
      expect(html).toContain('2024');
      expect(html).toContain('Isenção Aplicada');
      expect(html).toContain('15.000,00');
    });
  });

  describe('TaxAnnualReportView', () => {
    const mockPreferences: SerializedUserTaxPreferences = {
      defaultCapitalGainsRate: '0.1500',
      exemptThresholdBrl: '20000.00',
      dayTradeRate: '0.2000',
      includeDayTrade: true,
      compensationEnabled: true,
    };

    const mockReport: SerializedTaxAnnualReport = {
      year: 2024,
      months: [],
      totalAnnualSales: '150000.00',
      totalAnnualNetGainLoss: '35000.00',
      totalAnnualEstimatedTax: '5250.00',
      totalIrrfRetidoJcp: '150.00',
      totalIrrfRetidoDividendos: '0.00',
      totalRendimentosIsentosDividendos: '2400.00',
      totalRendimentosIsentosFii: '1200.00',
      remainingLossCredits: [],
      bensEDireitosSheet: [
        {
          assetId: 'ast-1',
          assetSymbol: 'VALE3',
          assetName: 'Vale S.A.',
          assetType: 'stock',
          cnpj: '33.592.510/0001-54',
          quantityAtYearEnd: '100.0000',
          averageCostAtYearEnd: '65.0000',
          totalCostAtYearEnd: '6500.00',
          discrimination: '100 unidades de VALE3 ao custo médio de R$ 65,00.',
        },
      ],
      rendimentosIsentosSheet: [],
      rendimentosTributaveisSheet: [],
      tributacaoExclusivaSheet: [],
      disclaimer: 'Aviso regulatório.',
    };

    it('deve renderizar cards de métricas anuais e abas de fichas IRPF', () => {
      const html = renderToString(
        <TaxAnnualReportView report={mockReport} preferences={mockPreferences} />
      );
      expect(html).toContain('Total Vendas (Ano)');
      expect(html).toContain('IR Estimado Total');
      expect(html).toContain('IRRF Retido (JCP)');
      expect(html).toContain('Bens e Direitos');
      expect(html).toContain('Rendimentos Isentos');
      expect(html).toContain('Tributação Exclusiva (JCP)');
      expect(html).toContain('Prejuízos Acumulados');
    });
  });
});
