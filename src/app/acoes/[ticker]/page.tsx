import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import {
  getPublicAssetDetailByTicker,
  getPublicAssetPriceHistory,
} from '@/modules/catalog/server/catalog.service';
import {
  getB3HistoricalQuotes,
  getPublicAssetFundamentalsWithIndicators,
} from '@/modules/market-data';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';

import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetDetailView } from '@/modules/catalog/ui/AssetDetailView';

import type { CatalogHistoryPeriod } from '@/modules/catalog/domain/catalog.schema';

interface AcaoDetailPageProps {
  params: Promise<{ ticker: string }>;
  searchParams?: Promise<{
    period?: CatalogHistoryPeriod;
    page?: string;
    limit?: string;
    startDate?: string;
    endDate?: string;
    order?: 'asc' | 'desc';
  }>;
}

export async function generateMetadata({ params }: AcaoDetailPageProps): Promise<Metadata> {
  const { ticker } = await params;
  const asset = await getPublicAssetDetailByTicker(ticker, 'stock');

  if (!asset) {
    return {
      title: 'Ativo Não Encontrado | CarteiraExpert',
    };
  }

  const priceText = asset.latestPrice ? ` — R$ ${Number(asset.latestPrice).toFixed(2)}` : '';

  return {
    title: `${asset.ticker}${priceText} — Cotação e Histórico de ${asset.name} | CarteiraExpert`,
    description: `Acompanhe a cotação, variação no pregão e gráfico histórico oficial da ação ${asset.ticker} (${asset.name}) na B3.`,
    openGraph: {
      title: `${asset.ticker} — Cotação e Histórico | CarteiraExpert`,
      description: `Cotação e histórico de ${asset.name} (${asset.ticker}) na B3.`,
    },
  };
}

export default async function AcaoDetailPage({ params, searchParams }: AcaoDetailPageProps) {
  const { ticker } = await params;
  const sParams = (await searchParams) || {};
  const user = await getCurrentUser();

  const asset = await getPublicAssetDetailByTicker(ticker, 'stock');

  if (!asset) {
    notFound();
  }

  const period: CatalogHistoryPeriod = sParams.period && ['1M', '3M', '6M', '1Y', 'ALL'].includes(sParams.period)
    ? sParams.period
    : '1M';
  const page = Math.max(1, Number.parseInt(sParams.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(sParams.limit || '15', 10) || 15));

  const [history, b3HistoricalResult, fundamentalsData] = await Promise.all([
    getPublicAssetPriceHistory(asset.id, period),
    getB3HistoricalQuotes({
      ticker: asset.ticker,
      startDate: sParams.startDate,
      endDate: sParams.endDate,
      order: sParams.order,
      page,
      limit,
    }),
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
      <PublicNavbar currentUser={user} activePath="/acoes" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetDetailView
          asset={asset}
          history={history}
          initialPeriod={period}
          b3HistoricalResult={b3HistoricalResult}
          fundamentalsData={fundamentalsData}
          userPortfolios={userPortfolios}
          isAuthenticated={!!user}
          currentUrl={`/acoes/${asset.ticker}`}
        />
      </main>
      <PublicFooter />
    </div>
  );

}
