export type CommercialPlanId = 'free' | 'pro';

export interface CommercialPlan {
  id: CommercialPlanId;
  name: string;
  description: string | null;
  maxActivePortfolios: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserPlanStatus = 'active' | 'cancelled' | 'past_due';

export interface UserPlan {
  id: string;
  userId: string;
  planId: CommercialPlanId;
  status: UserPlanStatus;
  startsAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserEffectivePlan {
  planId: CommercialPlanId;
  name: string;
  maxActivePortfolios: number;
  status: UserPlanStatus;
  isFallback: boolean;
  expiresAt: Date | null;
}

export interface PlanQuotaSummary {
  planId: CommercialPlanId;
  planName: string;
  maxActivePortfolios: number;
  activePortfoliosCount: number;
  frozenPortfoliosCount: number;
  archivedPortfoliosCount: number;
  availableSlots: number;
  canCreateMore: boolean;
}
