import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';
import { getPlanQuotaSummary } from '@/modules/plans/server/plan.service';
import { PortfolioList } from '@/modules/portfolio/ui/PortfolioList';

export const metadata: Metadata = {
  title: 'Minhas Carteiras — CarteiraExpert',
  description: 'Gerenciamento de carteiras de investimento e operações manuais.',
};

export default async function PortfoliosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [portfolios, quotaSummary] = await Promise.all([
    listPortfolios(user),
    getPlanQuotaSummary(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PortfolioList portfolios={portfolios} quotaSummary={quotaSummary} />
    </div>
  );
}
