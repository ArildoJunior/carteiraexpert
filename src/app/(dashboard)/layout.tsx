import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '../../modules/identity/server/consent-service';
import { DashboardNavbar } from './DashboardNavbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Validação server-side completa: verifica sessão no banco de dados.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Validação de consentimentos obrigatórios vigentes (LGPD)
  const hasConsent = await hasAcceptedCurrentTerms(user.id);
  if (!hasConsent) redirect('/terms-acceptance');

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <DashboardNavbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
