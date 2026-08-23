export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'carteiraexpert_theme';

export interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  positiveText: string;
  positiveChart: string;
  negativeText: string;
  negativeChart: string;
  actionPrimary: string;
  actionPrimaryText: string;
  costColor: string;
  quotedCostColor: string;
  chartGradientStartOpacity: number;
  chartGradientStopOpacity: number;
}

export const THEME_TOKENS: Record<ResolvedTheme, ThemeTokens> = {
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    positiveText: '#047857',
    positiveChart: '#059669',
    negativeText: '#B91C1C',
    negativeChart: '#DC2626',
    actionPrimary: '#C9A86A',
    actionPrimaryText: '#0F172A',
    costColor: '#4F46E5',
    quotedCostColor: '#6366F1',
    chartGradientStartOpacity: 0.15,
    chartGradientStopOpacity: 0.0,
  },
  dark: {
    background: '#0B1120',
    surface: '#1E293B',
    surfaceElevated: '#263449',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    border: '#334155',
    positiveText: '#10B981',
    positiveChart: '#10B981',
    negativeText: '#EF4444',
    negativeChart: '#EF4444',
    actionPrimary: '#4F46E5',
    actionPrimaryText: '#FFFFFF',
    costColor: '#818CF8',
    quotedCostColor: '#A5B4FC',
    chartGradientStartOpacity: 0.10,
    chartGradientStopOpacity: 0.0,
  },
} as const;
