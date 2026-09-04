import type {
  UserTaxPreferences,
  SerializedUserTaxPreferences,
  TaxAssetMonthlyResult,
  SerializedTaxAssetMonthlyResult,
  TaxMonthlyCalculationResult,
  SerializedTaxMonthlyCalculationResult,
  TaxBensEDireitosItem,
  SerializedTaxBensEDireitosItem,
  TaxRendimentoItem,
  SerializedTaxRendimentoItem,
  TaxLossCredit,
  SerializedTaxLossCredit,
  TaxAnnualReport,
  SerializedTaxAnnualReport,
  TaxMonthlySummary,
  SerializedTaxMonthlySummary,
} from './tax.types';

export function serializeUserTaxPreferences(prefs: UserTaxPreferences): SerializedUserTaxPreferences {
  return {
    defaultCapitalGainsRate: prefs.defaultCapitalGainsRate.toFixed(4),
    exemptThresholdBrl: prefs.exemptThresholdBrl.toFixed(2),
    dayTradeRate: prefs.dayTradeRate.toFixed(4),
    includeDayTrade: prefs.includeDayTrade,
    compensationEnabled: prefs.compensationEnabled,
  };
}

export function serializeTaxAssetMonthlyResult(res: TaxAssetMonthlyResult): SerializedTaxAssetMonthlyResult {
  return {
    assetId: res.assetId,
    assetSymbol: res.assetSymbol,
    assetName: res.assetName,
    assetType: res.assetType,
    salesCount: res.salesCount,
    totalQuantitySold: res.totalQuantitySold.toFixed(4),
    totalSalesProceeds: res.totalSalesProceeds.toFixed(2),
    totalCostOfGoodsSold: res.totalCostOfGoodsSold.toFixed(2),
    averageCostAtSale: res.averageCostAtSale.toFixed(4),
    netGainLoss: res.netGainLoss.toFixed(2),
    isDayTrade: res.isDayTrade,
  };
}

export function serializeTaxMonthlyCalculationResult(
  res: TaxMonthlyCalculationResult
): SerializedTaxMonthlyCalculationResult {
  return {
    year: res.year,
    month: res.month,
    totalSalesOverall: res.totalSalesOverall.toFixed(2),
    totalSalesStock: res.totalSalesStock.toFixed(2),
    totalSalesFii: res.totalSalesFii.toFixed(2),
    totalSalesEtfBdr: res.totalSalesEtfBdr.toFixed(2),
    isStockExempt: res.isStockExempt,
    exemptGainStock: res.exemptGainStock.toFixed(2),
    taxableGainStock: res.taxableGainStock.toFixed(2),
    taxableLossStock: res.taxableLossStock.toFixed(2),
    fiiGain: res.fiiGain.toFixed(2),
    fiiLoss: res.fiiLoss.toFixed(2),
    etfBdrGain: res.etfBdrGain.toFixed(2),
    etfBdrLoss: res.etfBdrLoss.toFixed(2),
    dayTradeGain: res.dayTradeGain.toFixed(2),
    dayTradeLoss: res.dayTradeLoss.toFixed(2),
    grossTaxableSwingBase: res.grossTaxableSwingBase.toFixed(2),
    grossTaxableDayTradeBase: res.grossTaxableDayTradeBase.toFixed(2),
    lossCompensatedSwing: res.lossCompensatedSwing.toFixed(2),
    lossCompensatedDayTrade: res.lossCompensatedDayTrade.toFixed(2),
    netTaxableSwingBase: res.netTaxableSwingBase.toFixed(2),
    netTaxableDayTradeBase: res.netTaxableDayTradeBase.toFixed(2),
    swingTradeTax: res.swingTradeTax.toFixed(2),
    dayTradeTax: res.dayTradeTax.toFixed(2),
    totalEstimatedTax: res.totalEstimatedTax.toFixed(2),
    assetResults: res.assetResults.map(serializeTaxAssetMonthlyResult),
  };
}

export function serializeTaxBensEDireitosItem(item: TaxBensEDireitosItem): SerializedTaxBensEDireitosItem {
  return {
    assetId: item.assetId,
    assetSymbol: item.assetSymbol,
    assetName: item.assetName,
    assetType: item.assetType,
    cnpj: item.cnpj ?? null,
    quantityAtYearEnd: item.quantityAtYearEnd.toFixed(4),
    averageCostAtYearEnd: item.averageCostAtYearEnd.toFixed(4),
    totalCostAtYearEnd: item.totalCostAtYearEnd.toFixed(2),
    discrimination: item.discrimination,
  };
}

export function serializeTaxRendimentoItem(item: TaxRendimentoItem): SerializedTaxRendimentoItem {
  return {
    assetSymbol: item.assetSymbol,
    assetName: item.assetName,
    type: item.type,
    grossAmount: item.grossAmount.toFixed(2),
    irrfAmount: item.irrfAmount.toFixed(2),
    netAmount: item.netAmount.toFixed(2),
    date: item.date,
  };
}

export function serializeTaxLossCredit(credit: TaxLossCredit): SerializedTaxLossCredit {
  return {
    id: credit.id,
    userId: credit.userId,
    year: credit.year,
    monthOrigin: credit.monthOrigin,
    assetSymbol: credit.assetSymbol,
    originalLossAmount: credit.originalLossAmount.toFixed(2),
    remainingAmount: credit.remainingAmount.toFixed(2),
    expiresOn: credit.expiresOn,
  };
}

export function serializeTaxAnnualReport(report: TaxAnnualReport): SerializedTaxAnnualReport {
  return {
    year: report.year,
    months: report.months.map(serializeTaxMonthlyCalculationResult),
    totalAnnualSales: report.totalAnnualSales.toFixed(2),
    totalAnnualNetGainLoss: report.totalAnnualNetGainLoss.toFixed(2),
    totalAnnualEstimatedTax: report.totalAnnualEstimatedTax.toFixed(2),
    totalIrrfRetidoJcp: report.totalIrrfRetidoJcp.toFixed(2),
    totalIrrfRetidoDividendos: report.totalIrrfRetidoDividendos.toFixed(2),
    totalRendimentosIsentosDividendos: report.totalRendimentosIsentosDividendos.toFixed(2),
    totalRendimentosIsentosFii: report.totalRendimentosIsentosFii.toFixed(2),
    remainingLossCredits: report.remainingLossCredits.map(serializeTaxLossCredit),
    bensEDireitosSheet: report.bensEDireitosSheet.map(serializeTaxBensEDireitosItem),
    rendimentosIsentosSheet: report.rendimentosIsentosSheet.map(serializeTaxRendimentoItem),
    rendimentosTributaveisSheet: report.rendimentosTributaveisSheet.map(serializeTaxRendimentoItem),
    tributacaoExclusivaSheet: report.tributacaoExclusivaSheet.map(serializeTaxRendimentoItem),
    disclaimer: report.disclaimer,
  };
}

export function serializeTaxMonthlySummary(summary: TaxMonthlySummary): SerializedTaxMonthlySummary {
  return {
    id: summary.id,
    userId: summary.userId,
    portfolioId: summary.portfolioId,
    year: summary.year,
    month: summary.month,
    totalSales: summary.totalSales.toFixed(2),
    totalProceeds: summary.totalProceeds.toFixed(2),
    totalCost: summary.totalCost.toFixed(2),
    netGainLoss: summary.netGainLoss.toFixed(2),
    exemptThresholdStatus: summary.exemptThresholdStatus,
    applicableRate: summary.applicableRate.toFixed(4),
    estimatedTax: summary.estimatedTax.toFixed(2),
    accumulatedLossCompensated: summary.accumulatedLossCompensated.toFixed(2),
    generatedAt: summary.generatedAt,
  };
}
