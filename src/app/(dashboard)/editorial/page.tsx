import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { EditorialDashboardView } from '@/modules/editorial/ui/EditorialDashboardView';

export const metadata: Metadata = {
  title: 'Editorial e Governança de Conteúdo | CarteiraExpert',
  description:
    'Camada editorial interna assistida por IA para produção e revisão de conteúdos educacionais e institucionais com revisão humana obrigatória.',
  openGraph: {
    title: 'Editorial e Governança de Conteúdo | CarteiraExpert',
    description:
      'Camada editorial interna assistida por IA para produção e revisão de conteúdos educacionais e institucionais com revisão humana obrigatória.',
  },
};

export default async function EditorialPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="w-full">
      <EditorialDashboardView />
    </div>
  );
}
