import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../modules/identity/server/current-user';
import { hasAcceptedCurrentTerms } from '../../modules/identity/server/consent-service';
import { LogoutButton } from '../../modules/identity/ui/LogoutButton';

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
    <div className="min-h-screen bg-slate-900">
      {/* Navbar */}
      <nav className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">CE</span>
                </div>
                <span className="text-white font-semibold text-lg tracking-tight">
                  CarteiraExpert
                </span>
              </div>

              {/* Nav Links */}
              <div className="hidden md:flex items-center gap-4">
                <a
                  id="nav-link-dashboard"
                  href="/dashboard"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
                >
                  Dashboard
                </a>
                <a
                  id="nav-link-portfolios"
                  href="/portfolios"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
                >
                  Carteiras
                </a>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-slate-400 text-sm hidden sm:block">
                {user.name}
              </span>
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
