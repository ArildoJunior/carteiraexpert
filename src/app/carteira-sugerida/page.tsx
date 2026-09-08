import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';
import { CspExplorer } from '@/modules/market-data';

export const metadata: Metadata = {
  title: 'Carteira Sugerida de Preços (CSP) | CarteiraExpert',
  description:
    'Simulador quantitativo e determinístico de carteira sugerida de ativos baseado em filtros contábeis, margem de segurança teórica e controle de concentração.',
  openGraph: {
    title: 'Carteira Sugerida de Preços (CSP) | CarteiraExpert',
    description:
      'Simulador quantitativo e determinístico de carteira sugerida de ativos baseado em filtros contábeis, margem de segurança teórica e controle de concentração.',
  },
};

export default async function CarteiraSugeridaPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/carteira-sugerida" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <CspExplorer />
      </main>
      <PublicFooter />
    </div>
  );
}
