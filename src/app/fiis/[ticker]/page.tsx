import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import {
  resolveCanonicalAsset,
  getPublicAssetPriceHistory,
} from '@/modules/catalog/server/catalog.service';
import {
  getPublicAssetFundamentalsWithIndicators,
  getPublicAssetTheoreticalValuation,
} from '@/modules/market-data';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetDetailView } from '@/modules/catalog/ui/AssetDetailView';

import type { CatalogHistoryPeriod } from '@/modules/catalog/domain/catalog.schema';

export const dynamic = 'force-dynamic';

interface FiiDetailPageProps {
  params: Promise<{ ticker: string }>;
  searchParams?: Promise<{
    period?: CatalogHistoryPeriod;
  }>;
}

export async function generateMetadata({ params }: FiiDetailPageProps): Promise<Metadata> {
  const { ticker } = await params;

  // Resolução canônica centralizada e cacheada por requisição
  const resolved = await resolveCanonicalAsset(ticker);

  // Se o ativo for canonicamente um FIP, redireciona permanentemente (HTTP 308) para /fips/[ticker]
  if (resolved?.canonicalCategory === 'fip') {
    permanentRedirect(`/fips/${encodeURIComponent(resolved.asset.ticker)}`);
  }

  if (!resolved || resolved.canonicalCategory !== 'fii') {
    return {
      title: 'FII Não Encontrado | CarteiraExpert',
    };
  }

  const asset = resolved.asset;
  const priceText = asset.latestPrice ? ` — R$ ${Number(asset.latestPrice).toFixed(2)}` : '';

  return {
    title: `${asset.ticker}${priceText} — Cotação e Histórico de ${asset.name} | CarteiraExpert`,
    description: `Acompanhe a cotação da cota, variação no pregão e gráfico histórico do fundo imobiliário ${asset.ticker} (${asset.name}) na B3.`,
    openGraph: {
      title: `${asset.ticker} — Cotação e Histórico | CarteiraExpert`,
      description: `Cotação e histórico de ${asset.name} (${asset.ticker}) na B3.`,
    },
  };
}

export default async function FiiDetailPage({ params, searchParams }: FiiDetailPageProps) {
  const { ticker } = await params;
  const sParams = (await searchParams) || {};
  const user = await getCurrentUser();

  // Resolução canônica centralizada e cacheada por requisição
  const resolved = await resolveCanonicalAsset(ticker);

  // Se o ativo for canonicamente um FIP, redireciona permanentemente (HTTP 308) para /fips/[ticker]
  if (resolved?.canonicalCategory === 'fip') {
    permanentRedirect(`/fips/${encodeURIComponent(resolved.asset.ticker)}`);
  }

  if (!resolved || resolved.canonicalCategory !== 'fii') {
    notFound();
  }

  const asset = resolved.asset;

  const period: CatalogHistoryPeriod = sParams.period && ['1M', '3M', '6M', '1Y', 'ALL'].includes(sParams.period)
    ? sParams.period
    : '1M';

  const [history, fundamentalsData, valuationData] = await Promise.all([
    getPublicAssetPriceHistory(asset.id, period),
    getPublicAssetFundamentalsWithIndicators(asset.ticker),
    getPublicAssetTheoreticalValuation(asset.ticker),
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
      <PublicNavbar currentUser={user} activePath="/fiis" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetDetailView
          asset={asset}
          history={history}
          initialPeriod={period}
          fundamentalsData={fundamentalsData}
          valuationData={valuationData}
          userPortfolios={userPortfolios}
          isAuthenticated={!!user}
          currentUrl={`/fiis/${asset.ticker}`}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
