import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '@/modules/identity/server/consent-service';
import { AppShell } from '@/modules/portfolio/ui/AppShell';

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
    <AppShell user={user}>
      {children}
    </AppShell>
  );
}
