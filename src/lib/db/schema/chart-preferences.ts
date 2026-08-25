import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

// ─── user_chart_preferences ──────────────────────────────────────────────────
// Armazena as preferências visuais de exibição de gráficos por usuário e área.
// Garante persistência e restauração das escolhas de período, modo de exibição,
// agrupamento e base de cálculo com isolamento estrito por usuário autenticado.
export const userChartPreferences = pgTable(
  'user_chart_preferences',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'portfolio_evolution' | 'dashboard_allocation' | 'portfolio_allocation'
    chartArea: text('chart_area').notNull(),
    // '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL'
    period: text('period'),
    // 'comparison' | 'market_value' | 'cost_basis' | 'pnl'
    viewMode: text('view_mode'),
    // 'asset' | 'asset_type' | 'portfolio' | 'currency'
    groupingType: text('grouping_type'),
    // 'market_value' | 'cost_basis'
    basis: text('basis'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_chart_preferences_user_id').on(table.userId),
    unique('uq_user_chart_preferences_user_area').on(table.userId, table.chartArea),
    check(
      'chk_user_chart_preferences_area',
      sql`${table.chartArea} IN ('portfolio_evolution', 'dashboard_allocation', 'portfolio_allocation')`
    ),
    check(
      'chk_user_chart_preferences_period',
      sql`${table.period} IS NULL OR ${table.period} IN ('1M', '3M', '6M', '1Y', 'YTD', 'ALL')`
    ),
    check(
      'chk_user_chart_preferences_view_mode',
      sql`${table.viewMode} IS NULL OR ${table.viewMode} IN ('comparison', 'market_value', 'cost_basis', 'pnl')`
    ),
    check(
      'chk_user_chart_preferences_grouping_type',
      sql`${table.groupingType} IS NULL OR ${table.groupingType} IN ('asset', 'asset_type', 'portfolio', 'currency')`
    ),
    check(
      'chk_user_chart_preferences_basis',
      sql`${table.basis} IS NULL OR ${table.basis} IN ('market_value', 'cost_basis')`
    ),
  ]
);
