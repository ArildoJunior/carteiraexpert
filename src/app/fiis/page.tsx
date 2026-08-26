import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getPublicCatalogList } from '@/modules/catalog/server/catalog.service';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetListingView } from '@/modules/catalog/ui/AssetListingView';
import type { CatalogFilterParams } from '@/modules/catalog/domain/catalog.types';

export const metadata: Metadata = {
  title: 'Fundos Imobiliários (FIIs) — Cotações e Histórico | CarteiraExpert',
  description:
    'Consulte cotações, variações diárias e histórico de preços de fundos de investimento imobiliário (FIIs) listados na B3.',
  openGraph: {
    title: 'Fundos Imobiliários (FIIs) — Cotações e Histórico | CarteiraExpert',
    description:
      'Consulte cotações, variações diárias e histórico de preços de fundos imobiliários listados na B3.',
  },
};

interface FiisPageProps {
  searchParams: Promise<{
    query?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function FiisListingPage({ searchParams }: FiisPageProps) {
  const resolvedParams = await searchParams;
  const user = await getCurrentUser();

  const filterParams: CatalogFilterParams = {
    category: 'fii',
    query: resolvedParams.query,
    page: resolvedParams.page ? Number(resolvedParams.page) : 1,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : 20,
    sortBy: (resolvedParams.sortBy as any) || 'ticker',
    sortOrder: (resolvedParams.sortOrder as any) || 'asc',
  };

  const result = await getPublicCatalogList(filterParams);

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/fiis" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetListingView
          initialResult={result}
          selectedCategory="fii"
          pageTitle="Fundos Imobiliários (FIIs)"
          pageDescription="Acompanhe cotações, variações de cotas e dados de fundos imobiliários negociados na B3."
        />
      </main>
      <PublicFooter />
    </div>
  );
}
