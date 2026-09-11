import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import {
  resolveCanonicalAsset,
  getPublicAssetPriceHistory,
} from '@/modules/catalog/server/catalog.service';
import { getPublicAssetFundamentalsWithIndicators } from '@/modules/market-data';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetDetailView } from '@/modules/catalog/ui/AssetDetailView';

import type { CatalogHistoryPeriod } from '@/modules/catalog/domain/catalog.schema';

export const dynamic = 'force-dynamic';

interface FipDetailPageProps {
  params: Promise<{ ticker: string }>;
  searchParams?: Promise<{
    period?: CatalogHistoryPeriod;
  }>;
}

export async function generateMetadata({ params }: FipDetailPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const resolved = await resolveCanonicalAsset(ticker);

  if (resolved?.canonicalCategory !== 'fip') {
    return {
      title: 'FIP Não Encontrado | CarteiraExpert',
    };
  }

  const asset = resolved.asset;
  const priceText = asset.latestPrice ? ` — R$ ${Number(asset.latestPrice).toFixed(2)}` : '';

  return {
    title: `${asset.ticker}${priceText} — Cotação e Histórico de ${asset.name} | CarteiraExpert`,
    description: `Acompanhe a cotação da cota, variação no pregão e gráfico histórico do fundo de investimento em participações ${asset.ticker} (${asset.name}) na B3.`,
    openGraph: {
      title: `${asset.ticker} — Cotação e Histórico | CarteiraExpert`,
      description: `Cotação e histórico de ${asset.name} (${asset.ticker}) na B3.`,
    },
  };
}

export default async function FipDetailPage({ params, searchParams }: FipDetailPageProps) {
  const { ticker } = await params;
  const sParams = (await searchParams) || {};
  const user = await getCurrentUser();

  const resolved = await resolveCanonicalAsset(ticker);

  if (resolved?.canonicalCategory !== 'fip') {
    notFound();
  }

  const asset = resolved.asset;

  const period: CatalogHistoryPeriod = sParams.period && ['1M', '3M', '6M', '1Y', 'ALL'].includes(sParams.period)
    ? sParams.period
    : '1M';

  const [history, fundamentalsData] = await Promise.all([
    getPublicAssetPriceHistory(asset.id, period),
    getPublicAssetFundamentalsWithIndicators(asset.ticker),
  ]);

  let userPortfolios: Array<{ id: string; name: string; baseCurrency: string; status: string }> = [];
  if (user) {
    const rawPortfolios = await listPortfolios(user);
    userPortfolios = rawPortfolios.map((p) => ({
      id: p.id,
      name: p.name,
      baseCurrency: p.baseCurrency,
      status: p.status,
    }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/fips" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetDetailView
          asset={asset}
          history={history}
          initialPeriod={period}
          fundamentalsData={fundamentalsData}
          userPortfolios={userPortfolios}
          isAuthenticated={!!user}
          currentUrl={`/fips/${asset.ticker}`}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
