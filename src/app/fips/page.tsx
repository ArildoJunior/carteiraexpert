import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getPublicCatalogList } from '@/modules/catalog/server/catalog.service';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetListingView } from '@/modules/catalog/ui/AssetListingView';
import type { CatalogFilterParams } from '@/modules/catalog/domain/catalog.types';

export const metadata: Metadata = {
  title: 'Fundos de Participações (FIPs) — Cotações e Histórico | CarteiraExpert',
  description:
    'Consulte cotações, variações diárias e histórico de preços de fundos de investimento em participações (FIPs) listados na B3.',
  openGraph: {
    title: 'Fundos de Participações (FIPs) — Cotações e Histórico | CarteiraExpert',
    description:
      'Consulte cotações, variações diárias e histórico de preços de fundos de participações listados na B3.',
  },
};

interface FipsPageProps {
  searchParams: Promise<{
    query?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function FipsListingPage({ searchParams }: FipsPageProps) {
  const resolvedParams = await searchParams;
  const user = await getCurrentUser();

  const filterParams: CatalogFilterParams = {
    category: 'fip',
    query: resolvedParams.query,
    page: resolvedParams.page ? Number(resolvedParams.page) : 1,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : 20,
    sortBy: (resolvedParams.sortBy as any) || 'ticker',
    sortOrder: (resolvedParams.sortOrder as any) || 'asc',
  };

  const result = await getPublicCatalogList(filterParams);

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/fips" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetListingView
          initialResult={result}
          selectedCategory="fip"
          pageTitle="Fundos de Participações (FIPs)"
          pageDescription="Acompanhe cotações, variações de cotas e dados de fundos de investimento em participações negociados na B3."
        />
      </main>
      <PublicFooter />
    </div>
  );
}
