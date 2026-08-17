import Decimal from 'decimal.js';
import type {
  SplitTransitionResult,
  GroupingTransitionResult,
  BonusShareTransitionResult,
  DividendCalculationResult,
  JcpCalculationResult,
} from './corporate-action.types';
import { InvalidCorporateActionError } from './errors';

/**
 * Aplica a regra matemática de Desdobramento (SPLIT).
 * Multiplica a quantidade pelo fator e preserva o custo total estritamente invariante.
 */
export function applySplit(
  runningQuantity: Decimal,
  factor: Decimal,
  runningCost: Decimal
): SplitTransitionResult {
  if (factor.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Fator de desdobramento (SPLIT) deve ser maior que zero.');
  }

  const newQuantity = runningQuantity.times(factor);
  return {
    quantity: newQuantity,
    totalCost: runningCost,
  };
}

/**
 * Aplica a regra matemática de Grupamento (GROUPING).
 * Divide a quantidade pelo fator e preserva o custo total estritamente invariante.
 */
export function applyGrouping(
  runningQuantity: Decimal,
  factor: Decimal,
  runningCost: Decimal
): GroupingTransitionResult {
  if (factor.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Fator de grupamento (GROUPING) deve ser maior que zero.');
  }

  const newQuantity = runningQuantity.dividedBy(factor);
  return {
    quantity: newQuantity,
    totalCost: runningCost,
  };
}

/**
 * Aplica a regra matemática de Bonificação de Ações (BONUS_SHARE).
 * Incrementa a quantidade e incorpora o custo atribuído ao custo total da posição.
 */
export function applyBonusShare(
  runningQuantity: Decimal,
  runningCost: Decimal,
  bonusQuantity: Decimal,
  attributedUnitPrice: Decimal = new Decimal(0)
): BonusShareTransitionResult {
  if (bonusQuantity.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Quantidade bonificada (BONUS_SHARE) deve ser maior que zero.');
  }
  if (attributedUnitPrice.lessThan(0)) {
    throw new InvalidCorporateActionError('Custo unitário atribuído da bonificação não pode ser negativo.');
  }

  const bonusCostDelta = bonusQuantity.times(attributedUnitPrice);
  const newQuantity = runningQuantity.plus(bonusQuantity);
  const newCost = runningCost.plus(bonusCostDelta);

  return {
    quantity: newQuantity,
    totalCost: newCost,
  };
}

/**
 * Calcula o provento monetário isento de Dividendo (DIVIDEND).
 * Provento = Quantidade Elegível * Valor por Ação.
 */
export function calculateDividend(
  eligibleQuantity: Decimal,
  unitPrice: Decimal
): DividendCalculationResult {
  if (unitPrice.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Valor por ação do dividendo deve ser maior que zero.');
  }

  const incomeAmount = eligibleQuantity.times(unitPrice);
  return { incomeAmount };
}

/**
 * Calcula o provento monetário tributado de Juros sobre Capital Próprio (JCP).
 * Gross = Quantidade Elegível * Valor Bruto por Ação.
 * Net = Gross - IRRF.
 */
export function calculateJcp(
  eligibleQuantity: Decimal,
  unitPrice: Decimal,
  irrfFees: Decimal = new Decimal(0)
): JcpCalculationResult {
  if (unitPrice.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Valor bruto por ação do JCP deve ser maior que zero.');
  }

  const grossAmount = eligibleQuantity.times(unitPrice);
  if (irrfFees.greaterThanOrEqualTo(grossAmount)) {
    throw new InvalidCorporateActionError(
      'O valor do IRRF retido no JCP não pode ser igual ou superior ao valor bruto total.'
    );
  }

  const netIncomeAmount = grossAmount.minus(irrfFees);
  return {
    grossAmount,
    irrfFees,
    netIncomeAmount,
  };
}
