import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { CompoundInterestSimulator } from '@/modules/projections/ui/CompoundInterestSimulator';

export const metadata: Metadata = {
  title: 'Simulador de Juros Compostos e Aportes | CarteiraExpert',
  description:
    'Simulador financeiro determinístico de aportes periódicos, capitalização de juros compostos, correção por inflação e projeção de renda passiva.',
  openGraph: {
    title: 'Simulador de Juros Compostos e Aportes | CarteiraExpert',
    description:
      'Simulador financeiro determinístico de aportes periódicos, capitalização de juros compostos, correção por inflação e projeção de renda passiva.',
  },
};

export default async function SimuladorPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/simulador" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <CompoundInterestSimulator />
      </main>
      <PublicFooter />
    </div>
  );
}
