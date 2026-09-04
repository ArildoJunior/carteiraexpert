import type { Decimal } from '@/lib/decimal';

export type OptionType = 'CALL' | 'PUT';
export type OptionStyle = 'AMERICAN' | 'EUROPEAN';
export type OptionDirection = 'BUY' | 'SELL';
export type OptionStatus = 'OPEN' | 'CLOSED' | 'EXPIRED';

export type ExpirationProximityStatus =
  | 'DISTANT'
  | 'NEAR_EXPIRATION' // D-5 a D-1 (1 a 5 dias úteis)
  | 'EXPIRING_TODAY'  // D-0 (vence hoje)
  | 'EXPIRED';         // Já vencida

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface OptionContract {
  id: string;
  userId: string;
  portfolioId: string;
  underlyingAssetId: string;
  custodyAccountId?: string | null;
  ticker: string;
  optionType: OptionType;
  optionStyle: OptionStyle;
  direction: OptionDirection;
  strikePrice: Decimal;
  premiumPaidReceived: Decimal;
  quantity: Decimal;
  expirationDate: string; // YYYY-MM-DD
  status: OptionStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;

  // Relações enriquecidas em consultas descritivas
  underlyingAssetTicker?: string;
  underlyingAssetName?: string;
  custodyAccountName?: string | null;
}

export interface BlackScholesInput {
  spotPrice: Decimal;         // S: Preço atual do ativo-objeto
  strikePrice: Decimal;       // K: Preço de exercício da opção
  timeToExpirationYears: Decimal; // T: Tempo até o vencimento em anos (ex: dias úteis / 252)
  riskFreeRate: Decimal;      // r: Taxa livre de risco anualizada (ex: 0.105 para 10.5% a.a.)
  volatility: Decimal;        // sigma: Volatilidade implícita anualizada (ex: 0.35 para 35% a.a.)
  optionType: OptionType;     // CALL ou PUT
  direction?: OptionDirection;// BUY ou SELL (default BUY)
  premium?: Decimal;          // Prêmio unitário negociado (opcional para cálculo de gregas, usado para valor extrínseco e payoff)
}

export interface GreeksResult {
  theoreticalPrice: Decimal;   // Preço teórico pelo modelo de Black-Scholes
  delta: Decimal;              // Variação do preço da opção para cada R$ 1,00 no ativo-objeto
  gamma: Decimal;              // Variação do Delta para cada R$ 1,00 no ativo-objeto
  theta: Decimal;              // Decaimento temporal por dia útil (-dC/dt / 252)
  vega: Decimal;               // Sensibilidade a 1 ponto percentual (1%) de volatilidade
  rho: Decimal;                // Sensibilidade a 1 ponto percentual (1%) de taxa de juros
  moneyness: Moneyness;        // ITM, ATM, OTM
  intrinsicValue: Decimal;     // Valor intrínseco teórico
  extrinsicValue: Decimal;     // Valor extrínseco (valor tempo)
  breakevenPrice: Decimal;     // Ponto de equilíbrio financeiro no vencimento
}

export interface PayoffPoint {
  spotPrice: Decimal;          // Preço do ativo-objeto no vencimento
  spotPriceFormatted: string;
  grossPayoff: Decimal;        // Resultado bruto no vencimento por contrato
  netProfitLoss: Decimal;      // Lucro/prejuízo líquido total considerando quantidade e prêmio
  netProfitLossUnitary: Decimal; // Lucro/prejuízo líquido por ação
}

export interface PayoffAnalysis {
  strikePrice: Decimal;
  breakevenPrice: Decimal;
  maximumProfit: Decimal | 'UNLIMITED'; // Lucro máximo possível (ex: ilimitado para CALL comprada)
  maximumLoss: Decimal | 'UNLIMITED';   // Prejuízo máximo possível (ex: ilimitado para CALL vendida a descoberto)
  points: PayoffPoint[];
}

export interface ExpirationCalculation {
  referenceDate: string;       // Data base de referência (YYYY-MM-DD)
  expirationDate: string;      // Data de vencimento (YYYY-MM-DD)
  calendarDays: number;        // Dias corridos
  businessDays: number;        // Dias úteis (calendário de mercado B3)
  status: ExpirationProximityStatus;
  isDMinus5OrLess: boolean;    // D-5 a D-0
  isD0: boolean;               // D-0
  isExpired: boolean;
}

export interface OptionProximityAlert {
  contractId: string;
  ticker: string;
  optionType: OptionType;
  direction: OptionDirection;
  strikePrice: Decimal;
  expirationDate: string;
  calendarDaysRemaining: number;
  businessDaysRemaining: number;
  status: ExpirationProximityStatus;
  alertLevel: 'INFO' | 'WARNING' | 'CRITICAL' | 'EXPIRED';
  title: string;
  message: string;
}

// ─── Tipos Serializados para Fronteira Cliente/Servidor (RSC / Server Actions) ──

export interface SerializedOptionContract {
  id: string;
  userId: string;
  portfolioId: string;
  underlyingAssetId: string;
  custodyAccountId?: string | null;
  ticker: string;
  optionType: OptionType;
  optionStyle: OptionStyle;
  direction: OptionDirection;
  strikePrice: string;
  premiumPaidReceived: string;
  quantity: string;
  expirationDate: string;
  status: OptionStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  underlyingAssetTicker?: string;
  underlyingAssetName?: string;
  custodyAccountName?: string | null;
}

export interface SerializedGreeksResult {
  theoreticalPrice: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  rho: string;
  moneyness: Moneyness;
  intrinsicValue: string;
  extrinsicValue: string;
  breakevenPrice: string;
}

export interface SerializedPayoffPoint {
  spotPrice: string;
  spotPriceFormatted: string;
  grossPayoff: string;
  netProfitLoss: string;
  netProfitLossUnitary: string;
}

export interface SerializedPayoffAnalysis {
  strikePrice: string;
  breakevenPrice: string;
  maximumProfit: string;
  maximumLoss: string;
  points: SerializedPayoffPoint[];
}

export interface SerializedOptionProximityAlert {
  contractId: string;
  ticker: string;
  optionType: OptionType;
  direction: OptionDirection;
  strikePrice: string;
  expirationDate: string;
  calendarDaysRemaining: number;
  businessDaysRemaining: number;
  status: ExpirationProximityStatus;
  alertLevel: 'INFO' | 'WARNING' | 'CRITICAL' | 'EXPIRED';
  title: string;
  message: string;
}

export interface SerializedOptionAnalytics {
  contract: SerializedOptionContract;
  expirationStatus: ExpirationCalculation;
  greeks: SerializedGreeksResult;
  payoff: SerializedPayoffAnalysis;
}
