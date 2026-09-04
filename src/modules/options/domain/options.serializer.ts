import { toDecimal } from '@/lib/decimal';
import type {
  OptionContract,
  SerializedOptionContract,
  GreeksResult,
  SerializedGreeksResult,
  PayoffAnalysis,
  SerializedPayoffAnalysis,
  OptionProximityAlert,
  SerializedOptionProximityAlert,
} from './options.types';

export function serializeOptionContract(c: OptionContract): SerializedOptionContract {
  return {
    id: c.id,
    userId: c.userId,
    portfolioId: c.portfolioId,
    underlyingAssetId: c.underlyingAssetId,
    custodyAccountId: c.custodyAccountId,
    ticker: c.ticker,
    optionType: c.optionType,
    optionStyle: c.optionStyle,
    direction: c.direction,
    strikePrice: toDecimal(c.strikePrice).toFixed(2),
    premiumPaidReceived: toDecimal(c.premiumPaidReceived).toFixed(2),
    quantity: toDecimal(c.quantity).toFixed(0),
    expirationDate: c.expirationDate,
    status: c.status,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    underlyingAssetTicker: c.underlyingAssetTicker,
    underlyingAssetName: c.underlyingAssetName,
    custodyAccountName: c.custodyAccountName,
  };
}

export function serializeGreeksResult(g: GreeksResult): SerializedGreeksResult {
  return {
    theoreticalPrice: g.theoreticalPrice.toFixed(2),
    delta: g.delta.toFixed(4),
    gamma: g.gamma.toFixed(4),
    theta: g.theta.toFixed(4),
    vega: g.vega.toFixed(4),
    rho: g.rho.toFixed(4),
    moneyness: g.moneyness,
    intrinsicValue: g.intrinsicValue.toFixed(2),
    extrinsicValue: g.extrinsicValue.toFixed(2),
    breakevenPrice: g.breakevenPrice.toFixed(2),
  };
}

export function serializePayoffAnalysis(p: PayoffAnalysis): SerializedPayoffAnalysis {
  return {
    strikePrice: p.strikePrice.toFixed(2),
    breakevenPrice: p.breakevenPrice.toFixed(2),
    maximumProfit: p.maximumProfit === 'UNLIMITED' ? 'ILIMITADO' : p.maximumProfit.toFixed(2),
    maximumLoss: p.maximumLoss === 'UNLIMITED' ? 'ILIMITADO' : p.maximumLoss.toFixed(2),
    points: p.points.map((pt) => ({
      spotPrice: pt.spotPrice.toFixed(2),
      spotPriceFormatted: pt.spotPriceFormatted,
      grossPayoff: pt.grossPayoff.toFixed(2),
      netProfitLoss: pt.netProfitLoss.toFixed(2),
      netProfitLossUnitary: pt.netProfitLossUnitary.toFixed(2),
    })),
  };
}

export function serializeOptionProximityAlert(a: OptionProximityAlert): SerializedOptionProximityAlert {
  return {
    contractId: a.contractId,
    ticker: a.ticker,
    optionType: a.optionType,
    direction: a.direction,
    strikePrice: a.strikePrice.toFixed(2),
    expirationDate: a.expirationDate,
    calendarDaysRemaining: a.calendarDaysRemaining,
    businessDaysRemaining: a.businessDaysRemaining,
    status: a.status,
    alertLevel: a.alertLevel,
    title: a.title,
    message: a.message,
  };
}
