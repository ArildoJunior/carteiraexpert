import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '../../modules/identity/server/consent-service';
import { LogoutButton } from '../../modules/identity/ui/LogoutButton';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';

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
      {/* Navbar */}
      <nav className="border-b border-border-theme bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-action-primary flex items-center justify-center">
                  <span className="text-action-primary-text font-bold text-sm">CE</span>
                </div>
                <span className="text-text-primary font-semibold text-lg tracking-tight">
                  CarteiraExpert
                </span>
              </div>

              {/* Nav Links */}
              <div className="hidden md:flex items-center gap-4">
                <a
                  id="nav-link-dashboard"
                  href="/dashboard"
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-elevated"
                >
                  Dashboard
                </a>
                <a
                  id="nav-link-portfolios"
                  href="/portfolios"
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-elevated"
                >
                  Carteiras
                </a>
                <a
                  id="nav-link-history"
                  href="/history"
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-elevated"
                >
                  Histórico
                </a>
                <a
                  id="nav-link-plans"
                  href="/plans"
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-elevated"
                >
                  Planos
                </a>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-text-secondary text-sm hidden sm:block">
                {user.name}
              </span>
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
