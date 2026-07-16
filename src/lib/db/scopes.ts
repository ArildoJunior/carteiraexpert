import { alerts, brokerageAccounts, positions, userPreferences, watchlists } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";

// Garante que o recurso pertence ao usuario. Retorna o recurso ou null.
// Use em TODA query de leitura para evitar vazamento entre usuarios.

export async function getAccountForUser(accountId: string, userId: string) {
  const [account] = await db
    .select()
    .from(brokerageAccounts)
    .where(and(eq(brokerageAccounts.id, accountId), eq(brokerageAccounts.userId, userId)))
    .limit(1);
  return account ?? null;
}

export async function getPositionForUser(positionId: string, userId: string) {
  const [position] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.userId, userId)))
    .limit(1);
  return position ?? null;
}

export async function getWatchlistForUser(watchlistId: string, userId: string) {
  const [watchlist] = await db
    .select()
    .from(watchlists)
    .where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
    .limit(1);
  return watchlist ?? null;
}

export async function getAlertForUser(alertId: string, userId: string) {
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId)))
    .limit(1);
  return alert ?? null;
}

export async function getPreferencesForUser(userId: string) {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return prefs ?? null;
}
