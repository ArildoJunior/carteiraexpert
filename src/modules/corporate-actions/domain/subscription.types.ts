import type { Decimal } from '@/lib/decimal';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PARTIALLY_EXERCISED'
  | 'FULLY_EXERCISED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface SubscriptionOffer {
  id: string;
  originAssetId: string;
  rightAssetId: string;
  targetAssetId: string;
  cutOffDate: Date;
  exerciseStartDate: Date;
  exerciseEndDate: Date;
  exercisePrice: string;
  currency: string;
  notes?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRight {
  id: string;
  portfolioId: string;
  offerId: string;
  status: SubscriptionStatus;
  allocatedQuantity: string;
  exercisedQuantity: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  cancellationReason?: string | null;
}

export interface SubscriptionExercise {
  id: string;
  subscriptionRightId: string;
  portfolioEventId: string;
  idempotencyKey: string;
  exercisedQuantity: string;
  exercisePrice: string;
  fees: string;
  totalCost: string;
  exerciseDate: Date;
  createdBy: string;
  createdAt: Date;
}

export interface EvaluateSubscriptionStatusParams {
  persistedStatus: SubscriptionStatus;
  allocatedQuantity: string | Decimal;
  exercisedQuantity: string | Decimal;
  exerciseStartDate: Date;
  exerciseEndDate: Date;
  serverNowUtc: Date;
}

export interface QuantizeTotalCostParams {
  quantity: string | Decimal;
  exercisePrice: string | Decimal;
  fees?: string | Decimal;
}
