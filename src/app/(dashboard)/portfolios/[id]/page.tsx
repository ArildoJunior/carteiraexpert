import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getPortfolioById } from '@/modules/portfolio/server/portfolio.service';
import { listPortfolioEventsByPortfolio } from '@/modules/portfolio/server/portfolio-event.service';
import { getAssetById } from '@/modules/portfolio/server/asset.service';
import { getSerializedPortfolioPositions } from '@/modules/portfolio/server/position.service';
import { PortfolioDetailView } from '@/modules/portfolio/ui/PortfolioDetailView';
import type { Asset } from '@/modules/portfolio/domain/asset.types';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PortfolioDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PortfolioDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return { title: 'Carteira não encontrada — CarteiraExpert' };
  }

  const user = await getCurrentUser();
  if (!user) return { title: 'Carteira — CarteiraExpert' };

  try {
    const portfolio = await getPortfolioById(id, user);
    return {
      title: `${portfolio.name} — CarteiraExpert`,
      description: portfolio.description || 'Detalhes da carteira patrimonial.',
    };
  } catch {
    return { title: 'Carteira — CarteiraExpert' };
  }
}

export default async function PortfolioDetailPage({
  params,
}: PortfolioDetailPageProps) {
  const { id } = await params;

  if (!id || !UUID_REGEX.test(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let portfolio;
  try {
    portfolio = await getPortfolioById(id, user);
  } catch {
    notFound();
  }

  const [events, positionsSummary] = await Promise.all([
    listPortfolioEventsByPortfolio(id, user),
    getSerializedPortfolioPositions(id, user),
  ]);

  // Mapeia os ativos únicos presentes nos eventos para exibição de ticker e nome
  const uniqueAssetIds = Array.from(new Set(events.map((e) => e.assetId)));
  const assetsMap: Record<string, Asset> = {};

  await Promise.all(
    uniqueAssetIds.map(async (assetId) => {
      try {
        const asset = await getAssetById(assetId, user);
        assetsMap[asset.id] = asset;
      } catch {
        // Ativo não encontrado ou erro de carregamento isolado
      }
    })
  );

  return (
    <div className="space-y-6">
      <PortfolioDetailView
        portfolio={portfolio}
        events={events}
        assetsMap={assetsMap}
        positionsSummary={positionsSummary}
      />
    </div>
  );
}
