import { db } from '@/lib/db/client';
import { userChartPreferences } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type {
  ChartArea,
  UserChartPreferencesMap,
  SerializedUserChartPreference,
} from '../domain/chart-preferences.types';
import type { SaveChartPreferenceInput } from '../domain/chart-preferences.schema';
import { randomUUID } from 'node:crypto';

/**
 * Recupera o mapa de todas as preferências de gráficos do usuário autenticado.
 */
export async function getUserChartPreferences(
  user: SafeUser
): Promise<UserChartPreferencesMap> {
  const records = await db
    .select()
    .from(userChartPreferences)
    .where(eq(userChartPreferences.userId, user.id));

  const map: UserChartPreferencesMap = {};

  for (const r of records) {
    const area = r.chartArea as ChartArea;
    map[area] = {
      chartArea: area,
      period: (r.period as any) ?? undefined,
      viewMode: (r.viewMode as any) ?? undefined,
      groupingType: (r.groupingType as any) ?? undefined,
      basis: (r.basis as any) ?? undefined,
    };
  }

  return map;
}

/**
 * Recupera a preferência de uma área específica para o usuário autenticado.
 */
export async function getUserChartPreferenceByArea(
  user: SafeUser,
  chartArea: ChartArea
): Promise<SerializedUserChartPreference | null> {
  const [record] = await db
    .select()
    .from(userChartPreferences)
    .where(
      and(
        eq(userChartPreferences.userId, user.id),
        eq(userChartPreferences.chartArea, chartArea)
      )
    )
    .limit(1);

  if (!record) return null;

  return {
    chartArea: record.chartArea as ChartArea,
    period: (record.period as any) ?? undefined,
    viewMode: (record.viewMode as any) ?? undefined,
    groupingType: (record.groupingType as any) ?? undefined,
    basis: (record.basis as any) ?? undefined,
  };
}

/**
 * Salva ou atualiza a preferência de exibição de gráfico para o usuário autenticado de forma atômica e idempotente.
 */
export async function saveUserChartPreference(
  user: SafeUser,
  input: SaveChartPreferenceInput
): Promise<SerializedUserChartPreference> {
  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.period !== undefined) updatePayload.period = input.period;
  if (input.viewMode !== undefined) updatePayload.viewMode = input.viewMode;
  if (input.groupingType !== undefined) updatePayload.groupingType = input.groupingType;
  if (input.basis !== undefined) updatePayload.basis = input.basis;

  const [saved] = await db
    .insert(userChartPreferences)
    .values({
      id: randomUUID(),
      userId: user.id,
      chartArea: input.chartArea,
      period: input.period ?? null,
      viewMode: input.viewMode ?? null,
      groupingType: input.groupingType ?? null,
      basis: input.basis ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userChartPreferences.userId, userChartPreferences.chartArea],
      set: updatePayload,
    })
    .returning();

  return {
    chartArea: saved.chartArea as ChartArea,
    period: (saved.period as any) ?? undefined,
    viewMode: (saved.viewMode as any) ?? undefined,
    groupingType: (saved.groupingType as any) ?? undefined,
    basis: (saved.basis as any) ?? undefined,
  };
}
