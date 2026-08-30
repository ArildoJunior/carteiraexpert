'use server';

import { getPublicAssetPriceHistory } from './catalog.service';
import type { CatalogHistoryPeriod } from '../domain/catalog.schema';
import type { PublicQuoteHistoryPoint } from '../domain/catalog.types';

/**
 * Server Action para buscar o histórico de preços do ativo para um determinado período.
 * Utilizado pelos componentes de cliente para troca interativa de período (1M, 3M, 6M, 1Y, ALL).
 */
export async function getAssetPriceHistoryAction(
  assetIdOrTicker: string,
  period: CatalogHistoryPeriod
): Promise<PublicQuoteHistoryPoint[]> {
  return getPublicAssetPriceHistory(assetIdOrTicker, period);
}
