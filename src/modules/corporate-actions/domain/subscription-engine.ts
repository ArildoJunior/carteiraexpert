import { Decimal } from '@/lib/decimal';
import {
  InvalidCorporateActionError,
  InvalidCostInvariantError,
  InvalidSubscriptionDateError,
  InvalidSubscriptionPeriodError,
  SubscriptionExpiredError,
  InsufficientSubscriptionRightsError,
} from './errors';
import type {
  EvaluateSubscriptionStatusParams,
  QuantizeTotalCostParams,
  SubscriptionStatus,
} from './subscription.types';

/**
 * Escala monetária canônica para liquidação e custos no PostgreSQL (NUMERIC 20, 8).
 */
export const MONETARY_DECIMAL_PLACES = 8;

/**
 * Escala máxima para quantidades de ativos e direitos (NUMERIC 28, 10).
 */
export const QUANTITY_DECIMAL_PLACES = 10;

/**
 * Valida se o instante atual do servidor UTC está dentro do período de vigência da oferta.
 * Lança exceções especializadas se o período for inválido.
 */
export function assertExercisePeriod(
  serverNowUtc: Date,
  exerciseStartDate: Date,
  exerciseEndDate: Date
): void {
  const nowMs = serverNowUtc.getTime();
  const startMs = exerciseStartDate.getTime();
  const endMs = exerciseEndDate.getTime();

  if (startMs > endMs) {
    throw new InvalidSubscriptionPeriodError(
      'Data de início da vigência de exercício não pode ser posterior à data final.'
    );
  }

  if (nowMs < startMs) {
    throw new InvalidSubscriptionPeriodError(
      'O período de exercício deste direito de subscrição ainda não foi iniciado.'
    );
  }

  if (nowMs > endMs) {
    throw new SubscriptionExpiredError(
      'O período de exercício deste direito de subscrição expirou.'
    );
  }
}

/**
 * Predicado puro para checagem da janela de vigência sem lançar erro.
 */
export function isWithinExercisePeriod(
  serverNowUtc: Date,
  exerciseStartDate: Date,
  exerciseEndDate: Date
): boolean {
  const nowMs = serverNowUtc.getTime();
  return (
    nowMs >= exerciseStartDate.getTime() && nowMs <= exerciseEndDate.getTime()
  );
}

/**
 * Valida a data operacional informada para o exercício garantindo que não seja futura
 * e respeite a Data-Com (data de corte) da oferta.
 */
export function assertExerciseDate(
  exerciseDate: Date,
  cutOffDate: Date,
  serverNowUtc: Date
): void {
  const exerciseMs = exerciseDate.getTime();
  const cutOffMs = cutOffDate.getTime();
  const nowMs = serverNowUtc.getTime();

  if (exerciseMs > nowMs) {
    throw new InvalidSubscriptionDateError(
      'Data de exercício não pode ser futura em relação ao instante atual do servidor.'
    );
  }

  if (exerciseMs < cutOffMs) {
    throw new InvalidSubscriptionDateError(
      'Data de exercício não pode ser anterior à data de corte (Data-Com) da oferta.'
    );
  }
}

/**
 * Calcula o saldo remanescente de direitos de subscrição disponíveis para exercício.
 */
export function calculateRemainingQuantity(
  allocatedQuantity: string | Decimal,
  exercisedQuantity: string | Decimal
): Decimal {
  const allocated =
    allocatedQuantity instanceof Decimal
      ? allocatedQuantity
      : new Decimal(allocatedQuantity);
  const exercised =
    exercisedQuantity instanceof Decimal
      ? exercisedQuantity
      : new Decimal(exercisedQuantity);

  if (allocated.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError(
      'Quantidade atribuída de direitos deve ser estritamente maior que zero.'
    );
  }

  if (exercised.lessThan(0)) {
    throw new InvalidCorporateActionError(
      'Quantidade exercida de direitos não pode ser negativa.'
    );
  }

  if (exercised.greaterThan(allocated)) {
    throw new InsufficientSubscriptionRightsError(
      'Quantidade exercida excede a quantidade atribuída de direitos.'
    );
  }

  return allocated.minus(exercised);
}

/**
 * Calcula e quantiza o custo total de exercício no padrão contábil e financeiro estrito.
 *
 * Regra:
 * totalCost = quantize( quantity * exercisePrice + fees, 8, ROUND_HALF_EVEN )
 *
 * - quantity: Decimal > 0 (escala máxima 10)
 * - exercisePrice: Decimal >= 0 (escala máxima 8, permite preço zero para bonificações/emissões gratuitas)
 * - fees: Decimal >= 0 (escala máxima 8)
 */
export function quantizeTotalCost(params: QuantizeTotalCostParams): Decimal {
  const q =
    params.quantity instanceof Decimal
      ? params.quantity
      : new Decimal(params.quantity);
  const p =
    params.exercisePrice instanceof Decimal
      ? params.exercisePrice
      : new Decimal(params.exercisePrice);
  const f = params.fees
    ? params.fees instanceof Decimal
      ? params.fees
      : new Decimal(params.fees)
    : new Decimal('0.00000000');

  if (q.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError(
      'Quantidade a exercer deve ser estritamente maior que zero.'
    );
  }

  if (p.lessThan(0)) {
    throw new InvalidCorporateActionError(
      'Preço de exercício não pode ser negativo.'
    );
  }

  if (f.lessThan(0)) {
    throw new InvalidCorporateActionError(
      'Taxas de exercício não podem ser negativas.'
    );
  }

  const rawCost = q.times(p).plus(f);
  return rawCost.toDecimalPlaces(
    MONETARY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_EVEN
  );
}

/**
 * Valida a invariante contábil de custo total de exercício.
 */
export function assertCostInvariant(
  quantity: string | Decimal,
  exercisePrice: string | Decimal,
  fees: string | Decimal,
  totalCost: string | Decimal
): void {
  const expected = quantizeTotalCost({ quantity, exercisePrice, fees });
  const actual = totalCost instanceof Decimal ? totalCost : new Decimal(totalCost);

  if (!expected.equals(actual)) {
    throw new InvalidCostInvariantError(
      `Custo total calculado (${actual.toFixed(MONETARY_DECIMAL_PLACES)}) diverge da invariante de exercício (${expected.toFixed(MONETARY_DECIMAL_PLACES)}).`
    );
  }
}

/**
 * Avalia o status do direito de subscrição de forma determinística e respeitando estados terminais.
 *
 * Invariantes da Máquina de Estados:
 * 1. FULLY_EXERCISED: Estado terminal. Não transiciona para EXPIRED mesmo após exerciseEndDate.
 * 2. CANCELLED: Estado terminal. Não retorna para ACTIVE, PARTIALLY_EXERCISED ou EXPIRED.
 * 3. EXPIRED: Saldo remanescente não exercido após o fim do período de vigência (serverNowUtc > exerciseEndDate).
 * 4. PARTIALLY_EXERCISED: Exercício parcial (> 0) com saldo remanescente dentro da vigência.
 * 5. ACTIVE: Saldo 100% exercível dentro da vigência.
 */
export function evaluateSubscriptionStatus(
  params: EvaluateSubscriptionStatusParams
): SubscriptionStatus {
  // 1. Respeito estrito aos estados terminais persistidos
  if (params.persistedStatus === 'FULLY_EXERCISED') {
    return 'FULLY_EXERCISED';
  }

  if (params.persistedStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  const allocated =
    params.allocatedQuantity instanceof Decimal
      ? params.allocatedQuantity
      : new Decimal(params.allocatedQuantity);
  const exercised =
    params.exercisedQuantity instanceof Decimal
      ? params.exercisedQuantity
      : new Decimal(params.exercisedQuantity);

  // 2. Se a quantidade exercida atingiu ou ultrapassou a alocada -> FULLY_EXERCISED
  if (exercised.greaterThanOrEqualTo(allocated)) {
    return 'FULLY_EXERCISED';
  }

  // 3. Se a janela de vigência encerrou e ainda há saldo não exercido -> EXPIRED
  if (params.serverNowUtc.getTime() > params.exerciseEndDate.getTime()) {
    return 'EXPIRED';
  }

  // 4. Se houve exercício parcial dentro da vigência -> PARTIALLY_EXERCISED
  if (exercised.greaterThan(0)) {
    return 'PARTIALLY_EXERCISED';
  }

  // 5. Saldo 100% disponível dentro da vigência -> ACTIVE
  return 'ACTIVE';
}
