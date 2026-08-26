import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getPublicCatalogList } from '@/modules/catalog/server/catalog.service';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { AssetListingView } from '@/modules/catalog/ui/AssetListingView';
import type { CatalogFilterParams } from '@/modules/catalog/domain/catalog.types';

export const metadata: Metadata = {
  title: 'Ações Brasileiras (B3) — Cotações e Histórico | CarteiraExpert',
  description:
    'Consulte cotações, variações diárias e histórico de preços de ações negociadas na bolsa brasileira (B3).',
  openGraph: {
    title: 'Ações Brasileiras (B3) — Cotações e Histórico | CarteiraExpert',
    description:
      'Consulte cotações, variações diárias e histórico de preços de ações negociadas na bolsa brasileira (B3).',
  },
};

interface AcoesPageProps {
  searchParams: Promise<{
    query?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function AcoesListingPage({ searchParams }: AcoesPageProps) {
  const resolvedParams = await searchParams;
  const user = await getCurrentUser();

  const filterParams: CatalogFilterParams = {
    category: 'stock',
    query: resolvedParams.query,
    page: resolvedParams.page ? Number(resolvedParams.page) : 1,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : 20,
    sortBy: (resolvedParams.sortBy as any) || 'ticker',
    sortOrder: (resolvedParams.sortOrder as any) || 'asc',
  };

  const result = await getPublicCatalogList(filterParams);

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/acoes" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <AssetListingView
          initialResult={result}
          selectedCategory="stock"
          pageTitle="Ações Brasileiras"
          pageDescription="Acompanhe cotações, variações e histórico de negociação das empresas listadas na B3."
        />
      </main>
      <PublicFooter />
    </div>
  );
}
