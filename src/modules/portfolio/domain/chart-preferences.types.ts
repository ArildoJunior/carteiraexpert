import type { EvolutionPeriod, EvolutionViewMode } from './portfolio-evolution.types';
import type { AllocationBasis, ChartGroupingType } from './chart.types';

export type ChartArea =
  | 'portfolio_evolution'
  | 'dashboard_allocation'
  | 'portfolio_allocation';

export interface UserChartPreference {
  id: string;
  userId: string;
  chartArea: ChartArea;
  period: EvolutionPeriod | null;
  viewMode: EvolutionViewMode | null;
  groupingType: ChartGroupingType | 'portfolio' | null;
  basis: AllocationBasis | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedUserChartPreference {
  chartArea: ChartArea;
  period?: EvolutionPeriod;
  viewMode?: EvolutionViewMode;
  groupingType?: ChartGroupingType | 'portfolio';
  basis?: AllocationBasis;
}

export type UserChartPreferencesMap = Partial<
  Record<ChartArea, SerializedUserChartPreference>
>;
