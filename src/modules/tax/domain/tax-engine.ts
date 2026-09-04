import { Decimal } from '@/lib/decimal';
import type {
  UserTaxPreferences,
  TaxTimelineEvent,
  TaxAssetMonthlyResult,
  TaxMonthlyCalculationResult,
  TaxLossCredit,
  TaxBensEDireitosItem,
  TaxRendimentoItem,
  TaxAnnualReport,
} from './tax.types';
import {
  CurrencyMismatchError,
  TaxYearInFutureError,
  InvalidAverageCostError,
  InvalidTaxQuantityError,
} from './errors';

export const DEFAULT_TAX_PREFERENCES: UserTaxPreferences = {
  defaultCapitalGainsRate: new Decimal('0.15'), // 15%
  exemptThresholdBrl: new Decimal('20000.00'),  // R$ 20.000,00
  dayTradeRate: new Decimal('0.20'),            // 20%
  includeDayTrade: true,
  compensationEnabled: true,
};

export const TAX_REGULATORY_DISCLAIMER =
  'Este módulo é exclusivamente auxiliar e informativo. Não substitui o cálculo oficial de um(a) contador(a) ou da Receita Federal. ' +
  'O CarteiraExpert NÃO emite DARF, NÃO integra com a Receita Federal e NÃO gera declaração oficial. ' +
  'O usuário é o único responsável pela veracidade das informações declaradas ao fisco. ' +
  'Regras tributárias podem mudar; o motor reflete a regulamentação vigente na data da apuração, mas o usuário deve confirmar com a fonte oficial (Receita Federal e INs aplicáveis).';

interface InternalAssetPosition {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  quantity: Decimal;
  totalCost: Decimal;
}

/**
 * Valida consistência inicial dos eventos da timeline cronológica
 */
export function validateTimelineEvents(events: TaxTimelineEvent[], targetYear: number): void {
  const currentYear = new Date().getFullYear();
  if (targetYear > currentYear) {
    throw new TaxYearInFutureError(
      `Ano de apuração (${targetYear}) não pode ser superior ao ano corrente (${currentYear}).`
    );
  }

  for (const event of events) {
    if (event.currency && event.currency.toUpperCase() !== 'BRL') {
      throw new CurrencyMismatchError(
        `Evento ${event.id} (${event.assetSymbol}) possui moeda '${event.currency}'. Apenas BRL é suportado na apuração fiscal sem conversão explícita.`
      );
    }

    if (event.quantity.lessThan(0)) {
      throw new InvalidTaxQuantityError(
        `Quantidade no evento ${event.id} não pode ser negativa (${event.quantity.toString()}).`
      );
    }

    if (event.unitPrice.lessThan(0)) {
      throw new InvalidAverageCostError(
        `Preço unitário no evento ${event.id} não pode ser negativo (${event.unitPrice.toString()}).`
      );
    }
  }
}

/**
 * Detecta se duas operações no mesmo dia configuram Day-Trade
 */
export function identifyDayTradeEvents(events: TaxTimelineEvent[]): Set<string> {
  const dayTradeEventIds = new Set<string>();

  // Agrupa por assetId + data (YYYY-MM-DD)
  const byAssetAndDate = new Map<string, TaxTimelineEvent[]>();

  for (const event of events) {
    if (event.type !== 'BUY' && event.type !== 'SELL') continue;
    const dateStr = event.tradeDate.toISOString().slice(0, 10);
    const key = `${event.portfolioId}_${event.assetId}_${dateStr}`;
    const list = byAssetAndDate.get(key) || [];
    list.push(event);
    byAssetAndDate.set(key, list);
  }

  for (const [, dayEvents] of byAssetAndDate) {
    const hasBuy = dayEvents.some((e) => e.type === 'BUY');
    const hasSell = dayEvents.some((e) => e.type === 'SELL');

    if (hasBuy && hasSell) {
      for (const e of dayEvents) {
        dayTradeEventIds.add(e.id);
      }
    }
  }

  return dayTradeEventIds;
}

/**
 * Executa a apuração fiscal anual mês a mês com cálculo determinístico em Decimal
 */
export function calculateAnnualTax(
  events: TaxTimelineEvent[],
  targetYear: number,
  initialLossCredits: TaxLossCredit[] = [],
  userPreferences: UserTaxPreferences = DEFAULT_TAX_PREFERENCES
): TaxAnnualReport {
  validateTimelineEvents(events, targetYear);

  // Ordena cronologicamente todos os eventos
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = a.settlementDate ? a.settlementDate.getTime() : a.tradeDate.getTime();
    const dateB = b.settlementDate ? b.settlementDate.getTime() : b.tradeDate.getTime();
    if (dateA !== dateB) return dateA - dateB;

    // Se mesma data: BUY antes de SELL, eventos corporativos antes de negociações
    const priority = (type: string) => {
      if (type === 'SPLIT' || type === 'GROUPING' || type === 'BONUS_SHARE') return 1;
      if (type === 'BUY') return 2;
      if (type === 'SELL') return 3;
      return 4;
    };
    return priority(a.type) - priority(b.type);
  });

  const dayTradeIds = identifyDayTradeEvents(sortedEvents);

  // Posição contínua acumulada de custo médio ponderado por ativo
  const assetPositions = new Map<string, InternalAssetPosition>();

  // Créditos de prejuízo ativos (FIFO)
  // Filtra apenas créditos que não expiraram no ano de apuração (máximo 5 anos)
  let activeLossCredits: TaxLossCredit[] = initialLossCredits
    .filter((c) => {
      const creditYear = c.year;
      return targetYear >= creditYear && targetYear <= creditYear + 5 && c.remainingAmount.greaterThan(0);
    })
    .map((c) => ({
      ...c,
      remainingAmount: new Decimal(c.remainingAmount),
      originalLossAmount: new Decimal(c.originalLossAmount),
    }));

  const monthlyResults: TaxMonthlyCalculationResult[] = [];
  const rendimentosIsentos: TaxRendimentoItem[] = [];
  const rendimentosTributaveis: TaxRendimentoItem[] = [];
  const tributacaoExclusiva: TaxRendimentoItem[] = [];

  // Variáveis para totais anuais
  let totalAnnualSales = new Decimal(0);
  let totalAnnualNetGainLoss = new Decimal(0);
  let totalAnnualEstimatedTax = new Decimal(0);
  let totalIrrfRetidoJcp = new Decimal(0);
  let totalIrrfRetidoDividendos = new Decimal(0);
  let totalRendimentosIsentosDividendos = new Decimal(0);
  let totalRendimentosIsentosFii = new Decimal(0);

  // Índice para iterar os eventos ao longo do tempo
  let eventIdx = 0;

  // Processa todos os eventos anteriores ao ano alvo para estabelecer o custo médio em 01/01
  while (eventIdx < sortedEvents.length) {
    const ev = sortedEvents[eventIdx];
    const evYear = ev.tradeDate.getUTCFullYear();
    if (evYear >= targetYear) break;

    processEventPosition(ev, assetPositions);
    eventIdx++;
  }

  // Itera os 12 meses do ano alvo
  for (let month = 1; month <= 12; month++) {
    const monthAssetResults = new Map<string, TaxAssetMonthlyResult>();

    let totalSalesOverall = new Decimal(0);
    let totalSalesStock = new Decimal(0);
    let totalSalesFii = new Decimal(0);
    let totalSalesEtfBdr = new Decimal(0);

    let swingStockGain = new Decimal(0);
    let swingStockLoss = new Decimal(0);

    let fiiGain = new Decimal(0);
    let fiiLoss = new Decimal(0);

    let etfBdrGain = new Decimal(0);
    let etfBdrLoss = new Decimal(0);

    let dayTradeGain = new Decimal(0);
    let dayTradeLoss = new Decimal(0);

    // Consome eventos deste mês
    while (eventIdx < sortedEvents.length) {
      const ev = sortedEvents[eventIdx];
      const evYear = ev.tradeDate.getUTCFullYear();
      const evMonth = ev.tradeDate.getUTCMonth() + 1;

      if (evYear > targetYear || (evYear === targetYear && evMonth > month)) {
        break; // Evento do próximo mês ou ano
      }

      const isDayTrade = userPreferences.includeDayTrade && (dayTradeIds.has(ev.id) || !!ev.isDayTrade);

      if (ev.type === 'BUY') {
        processEventPosition(ev, assetPositions);
      } else if (ev.type === 'SPLIT' || ev.type === 'GROUPING' || ev.type === 'BONUS_SHARE') {
        processEventPosition(ev, assetPositions);
      } else if (ev.type === 'DIVIDEND') {
        const grossAmount = ev.quantity.times(ev.unitPrice);
        const irrfAmount = ev.fees || new Decimal(0);
        const netAmount = grossAmount.minus(irrfAmount);

        if (ev.assetType === 'fii') {
          totalRendimentosIsentosFii = totalRendimentosIsentosFii.plus(netAmount);
          rendimentosIsentos.push({
            assetSymbol: ev.assetSymbol,
            assetName: ev.assetName,
            type: 'FII_INCOME',
            grossAmount,
            irrfAmount,
            netAmount,
            date: ev.tradeDate.toISOString().slice(0, 10),
          });
        } else {
          totalRendimentosIsentosDividendos = totalRendimentosIsentosDividendos.plus(netAmount);
          rendimentosIsentos.push({
            assetSymbol: ev.assetSymbol,
            assetName: ev.assetName,
            type: 'DIVIDEND',
            grossAmount,
            irrfAmount,
            netAmount,
            date: ev.tradeDate.toISOString().slice(0, 10),
          });
        }
      } else if (ev.type === 'JCP') {
        const grossAmount = ev.quantity.times(ev.unitPrice);
        const irrfAmount = ev.fees.greaterThan(0)
          ? ev.fees
          : grossAmount.times(new Decimal('0.15')).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
        const netAmount = grossAmount.minus(irrfAmount);

        totalIrrfRetidoJcp = totalIrrfRetidoJcp.plus(irrfAmount);
        tributacaoExclusiva.push({
          assetSymbol: ev.assetSymbol,
          assetName: ev.assetName,
          type: 'JCP',
          grossAmount,
          irrfAmount,
          netAmount,
          date: ev.tradeDate.toISOString().slice(0, 10),
        });
      } else if (ev.type === 'SELL') {
        const pos = assetPositions.get(ev.assetId);
        const avgCost = pos && pos.quantity.greaterThan(0)
          ? pos.totalCost.dividedBy(pos.quantity)
          : new Decimal(0);

        const salesProceeds = ev.quantity.times(ev.unitPrice).minus(ev.fees);
        const costOfSoldGoods = ev.quantity.times(avgCost);
        const netGainLoss = salesProceeds.minus(costOfSoldGoods);

        // Atualiza posição do ativo
        processEventPosition(ev, assetPositions);

        // Agregação de vendas do mês
        totalSalesOverall = totalSalesOverall.plus(salesProceeds);

        const lowerType = ev.assetType.toLowerCase();
        if (lowerType === 'stock') {
          totalSalesStock = totalSalesStock.plus(salesProceeds);
          if (isDayTrade) {
            if (netGainLoss.greaterThan(0)) {
              dayTradeGain = dayTradeGain.plus(netGainLoss);
            } else {
              dayTradeLoss = dayTradeLoss.plus(netGainLoss.abs());
            }
          } else {
            if (netGainLoss.greaterThan(0)) {
              swingStockGain = swingStockGain.plus(netGainLoss);
            } else {
              swingStockLoss = swingStockLoss.plus(netGainLoss.abs());
            }
          }
        } else if (lowerType === 'fii') {
          totalSalesFii = totalSalesFii.plus(salesProceeds);
          if (netGainLoss.greaterThan(0)) {
            fiiGain = fiiGain.plus(netGainLoss);
          } else {
            fiiLoss = fiiLoss.plus(netGainLoss.abs());
          }
        } else {
          // ETF, BDR, etc.
          totalSalesEtfBdr = totalSalesEtfBdr.plus(salesProceeds);
          if (netGainLoss.greaterThan(0)) {
            etfBdrGain = etfBdrGain.plus(netGainLoss);
          } else {
            etfBdrLoss = etfBdrLoss.plus(netGainLoss.abs());
          }
        }

        // Agregação do resultado por ativo no mês
        const existingAssetRes = monthAssetResults.get(ev.assetId);
        if (existingAssetRes) {
          existingAssetRes.salesCount += 1;
          existingAssetRes.totalQuantitySold = existingAssetRes.totalQuantitySold.plus(ev.quantity);
          existingAssetRes.totalSalesProceeds = existingAssetRes.totalSalesProceeds.plus(salesProceeds);
          existingAssetRes.totalCostOfGoodsSold = existingAssetRes.totalCostOfGoodsSold.plus(costOfSoldGoods);
          existingAssetRes.netGainLoss = existingAssetRes.netGainLoss.plus(netGainLoss);
        } else {
          monthAssetResults.set(ev.assetId, {
            assetId: ev.assetId,
            assetSymbol: ev.assetSymbol,
            assetName: ev.assetName,
            assetType: ev.assetType,
            salesCount: 1,
            totalQuantitySold: ev.quantity,
            totalSalesProceeds: salesProceeds,
            totalCostOfGoodsSold: costOfSoldGoods,
            averageCostAtSale: avgCost,
            netGainLoss,
            isDayTrade,
          });
        }
      }

      eventIdx++;
    }

    // Regra de Isenção de R$ 20.000,00 para Ações (IN RFB 2054/2024)
    // Se total de vendas de ações <= exemptThresholdBrl:
    //   - Ganhos líquidos são ISENTOS
    //   - Prejuízos apurados NÃO podem ser compensados em meses futuros
    const isStockExempt = totalSalesStock.lessThanOrEqualTo(userPreferences.exemptThresholdBrl);

    let exemptGainStock = new Decimal(0);
    let taxableGainStock = new Decimal(0);
    let taxableLossStock = new Decimal(0);

    if (isStockExempt) {
      exemptGainStock = swingStockGain;
      // Prejuízo em mês isento não compensa (taxableLossStock = 0)
      taxableLossStock = new Decimal(0);
    } else {
      taxableGainStock = swingStockGain;
      taxableLossStock = swingStockLoss;
    }

    // Base bruta de ganho tributável em Swing Trade
    // Combina ações tributáveis, FIIs e ETFs/BDRs
    let grossTaxableSwingBase = taxableGainStock
      .plus(fiiGain)
      .plus(etfBdrGain)
      .minus(taxableLossStock)
      .minus(fiiLoss)
      .minus(etfBdrLoss);

    // Day Trade é apurado separadamente
    let grossTaxableDayTradeBase = dayTradeGain.minus(dayTradeLoss);

    // Compensação de prejuízos acumulados (se habilitado)
    let lossCompensatedSwing = new Decimal(0);
    let lossCompensatedDayTrade = new Decimal(0);

    const newLossCreditsGenerated: { assetSymbol: string; amount: Decimal; originMonth: number }[] = [];

    if (userPreferences.compensationEnabled) {
      // Se prejuízo líquido neste mês em swing trade (e mês tributável), gera novo crédito
      if (grossTaxableSwingBase.lessThan(0)) {
        const lossAmount = grossTaxableSwingBase.abs();
        const originAsset = monthAssetResults.size > 0
          ? Array.from(monthAssetResults.values())[0].assetSymbol
          : 'GERAL';

        newLossCreditsGenerated.push({
          assetSymbol: originAsset,
          amount: lossAmount,
          originMonth: month,
        });

        activeLossCredits.push({
          id: `cred-${targetYear}-${month}`,
          userId: '',
          year: targetYear,
          monthOrigin: month,
          assetSymbol: originAsset,
          originalLossAmount: lossAmount,
          remainingAmount: lossAmount,
          expiresOn: new Date(Date.UTC(targetYear + 5, 11, 31, 23, 59, 59)).toISOString(),
        });

        grossTaxableSwingBase = new Decimal(0);
      } else if (grossTaxableSwingBase.greaterThan(0)) {
        // Compensação FIFO de prejuízos acumulados
        let gainRemaining = grossTaxableSwingBase;

        for (const credit of activeLossCredits) {
          if (gainRemaining.lessThanOrEqualTo(0)) break;
          if (credit.remainingAmount.lessThanOrEqualTo(0)) continue;

          if (credit.remainingAmount.greaterThanOrEqualTo(gainRemaining)) {
            credit.remainingAmount = credit.remainingAmount.minus(gainRemaining);
            lossCompensatedSwing = lossCompensatedSwing.plus(gainRemaining);
            gainRemaining = new Decimal(0);
          } else {
            lossCompensatedSwing = lossCompensatedSwing.plus(credit.remainingAmount);
            gainRemaining = gainRemaining.minus(credit.remainingAmount);
            credit.remainingAmount = new Decimal(0);
          }
        }
      }
    }

    const netTaxableSwingBase = Decimal.max(0, grossTaxableSwingBase.minus(lossCompensatedSwing));
    const netTaxableDayTradeBase = Decimal.max(0, grossTaxableDayTradeBase.minus(lossCompensatedDayTrade));

    const swingTradeTax = netTaxableSwingBase.times(userPreferences.defaultCapitalGainsRate);
    const dayTradeTax = netTaxableDayTradeBase.times(userPreferences.dayTradeRate);
    const totalEstimatedTax = swingTradeTax.plus(dayTradeTax);

    const monthResult: TaxMonthlyCalculationResult = {
      year: targetYear,
      month,
      totalSalesOverall,
      totalSalesStock,
      totalSalesFii,
      totalSalesEtfBdr,
      isStockExempt,
      exemptGainStock,
      taxableGainStock,
      taxableLossStock,
      fiiGain,
      fiiLoss,
      etfBdrGain,
      etfBdrLoss,
      dayTradeGain,
      dayTradeLoss,
      grossTaxableSwingBase,
      grossTaxableDayTradeBase,
      lossCompensatedSwing,
      lossCompensatedDayTrade,
      netTaxableSwingBase,
      netTaxableDayTradeBase,
      swingTradeTax,
      dayTradeTax,
      totalEstimatedTax,
      assetResults: Array.from(monthAssetResults.values()),
      newLossCreditsGenerated,
    };

    monthlyResults.push(monthResult);

    totalAnnualSales = totalAnnualSales.plus(totalSalesOverall);
    totalAnnualNetGainLoss = totalAnnualNetGainLoss.plus(
      exemptGainStock
        .plus(taxableGainStock)
        .minus(taxableLossStock)
        .plus(fiiGain)
        .minus(fiiLoss)
        .plus(etfBdrGain)
        .minus(etfBdrLoss)
        .plus(dayTradeGain)
        .minus(dayTradeLoss)
    );
    totalAnnualEstimatedTax = totalAnnualEstimatedTax.plus(totalEstimatedTax);
  }

  // Gera Ficha "Bens e Direitos" com base na custódia final em 31/12
  const bensEDireitosSheet: TaxBensEDireitosItem[] = [];

  for (const pos of assetPositions.values()) {
    if (pos.quantity.greaterThan(0)) {
      const avgCost = pos.totalCost.dividedBy(pos.quantity);
      const totalCost = pos.totalCost;

      const unitFormatted = `R$ ${avgCost.toFixed(2)}`;
      const totalFormatted = `R$ ${totalCost.toFixed(2)}`;
      const qtyFormatted = pos.quantity.toFixed(pos.quantity.decimalPlaces() > 0 ? 4 : 0);

      const discrimination = `${qtyFormatted} unidades de ${pos.assetSymbol} (${pos.assetName}), ` +
        `custo médio de aquisição ${unitFormatted}, totalizando ${totalFormatted}. ` +
        `Custódia apurada em 31/12/${targetYear}.`;

      bensEDireitosSheet.push({
        assetId: pos.assetId,
        assetSymbol: pos.assetSymbol,
        assetName: pos.assetName,
        assetType: pos.assetType,
        quantityAtYearEnd: pos.quantity,
        averageCostAtYearEnd: avgCost,
        totalCostAtYearEnd: totalCost,
        discrimination,
      });
    }
  }

  // Ordena bens e direitos alfabeticamente por símbolo
  bensEDireitosSheet.sort((a, b) => a.assetSymbol.localeCompare(b.assetSymbol));

  return {
    year: targetYear,
    months: monthlyResults,
    totalAnnualSales,
    totalAnnualNetGainLoss,
    totalAnnualEstimatedTax,
    totalIrrfRetidoJcp,
    totalIrrfRetidoDividendos,
    totalRendimentosIsentosDividendos,
    totalRendimentosIsentosFii,
    remainingLossCredits: activeLossCredits.filter((c) => c.remainingAmount.greaterThan(0)),
    bensEDireitosSheet,
    rendimentosIsentosSheet: rendimentosIsentos,
    rendimentosTributaveisSheet: rendimentosTributaveis,
    tributacaoExclusivaSheet: tributacaoExclusiva,
    disclaimer: TAX_REGULATORY_DISCLAIMER,
  };
}

/**
 * Atualiza o estado da posição contínua de um ativo após um evento patrimonial
 */
function processEventPosition(
  event: TaxTimelineEvent,
  positions: Map<string, InternalAssetPosition>
): void {
  let pos = positions.get(event.assetId);

  if (!pos) {
    pos = {
      assetId: event.assetId,
      assetSymbol: event.assetSymbol,
      assetName: event.assetName,
      assetType: event.assetType,
      quantity: new Decimal(0),
      totalCost: new Decimal(0),
    };
    positions.set(event.assetId, pos);
  }

  if (event.type === 'BUY') {
    const costAddition = event.quantity.times(event.unitPrice).plus(event.fees);
    pos.quantity = pos.quantity.plus(event.quantity);
    pos.totalCost = pos.totalCost.plus(costAddition);
  } else if (event.type === 'SELL') {
    if (pos.quantity.greaterThan(0)) {
      const avgCost = pos.totalCost.dividedBy(pos.quantity);
      const costReduction = Decimal.min(pos.totalCost, event.quantity.times(avgCost));
      pos.quantity = Decimal.max(0, pos.quantity.minus(event.quantity));
      pos.totalCost = Decimal.max(0, pos.totalCost.minus(costReduction));

      if (pos.quantity.isZero()) {
        pos.totalCost = new Decimal(0);
      }
    }
  } else if (event.type === 'SPLIT') {
    // Ex: SPLIT com unitPrice = 2 (desdobramento 1:2)
    const factor = event.unitPrice.greaterThan(0) ? event.unitPrice : new Decimal(1);
    pos.quantity = pos.quantity.times(factor);
    // Custo total permanece inalterado
  } else if (event.type === 'GROUPING') {
    // Ex: GROUPING com unitPrice = 10 (grupamento 10:1)
    const factor = event.unitPrice.greaterThan(0) ? event.unitPrice : new Decimal(1);
    pos.quantity = pos.quantity.dividedBy(factor);
    // Custo total permanece inalterado
  } else if (event.type === 'BONUS_SHARE') {
    // Bonificação em ações: adiciona quantidade e eventual custo econômico atribuído
    pos.quantity = pos.quantity.plus(event.quantity);
    if (event.unitPrice.greaterThan(0)) {
      pos.totalCost = pos.totalCost.plus(event.quantity.times(event.unitPrice));
    }
  }
}
