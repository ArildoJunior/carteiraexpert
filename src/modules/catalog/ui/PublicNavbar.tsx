import Link from 'next/link';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { LogoutButton } from '@/modules/identity/ui/LogoutButton';

interface PublicNavbarProps {
  currentUser?: SafeUser | null;
  activePath?: string;
}

export function PublicNavbar({ currentUser, activePath }: PublicNavbarProps) {
  const navLinks = [
    { label: 'Ações', href: '/acoes' },
    { label: 'FIIs', href: '/fiis' },
    { label: 'ETFs', href: '/etfs' },
    { label: 'BDRs', href: '/bdrs' },
    { label: 'Todos os Ativos', href: '/ativos' },
  ];

  return (
    <header className="border-b border-border-theme bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-action-primary flex items-center justify-center">
                <span className="text-action-primary-text font-bold text-sm">CE</span>
              </div>
              <span className="text-text-primary font-semibold text-lg tracking-tight">
                CarteiraExpert
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = activePath === link.href;
                return (
                  <Link
                    key={link.href}
                    id={`nav-link-${link.href.replace('/', '')}`}
                    href={link.href}
                    className={`text-sm font-medium transition-colors px-3 py-1.5 rounded-lg ${
                      isActive
                        ? 'bg-surface-elevated text-action-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />

            {currentUser ? (
              <div className="flex items-center gap-3">
                <Link
                  id="btn-nav-dashboard"
                  href="/dashboard"
                  className="text-sm font-medium px-3.5 py-1.5 rounded-lg bg-surface-elevated border border-border-theme text-text-primary hover:border-action-primary/50 transition-colors"
                >
                  Dashboard
                </Link>
                <span className="text-text-secondary text-sm hidden sm:block">
                  {currentUser.name}
                </span>
                <LogoutButton />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  id="btn-nav-login"
                  href="/login"
                  className="text-sm font-medium px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                >
                  Entrar
                </Link>
                <Link
                  id="btn-nav-register"
                  href="/register"
                  className="text-sm font-medium px-3.5 py-1.5 rounded-lg bg-action-primary text-action-primary-text hover:opacity-90 transition-opacity shadow-xs"
                >
                  Criar Conta
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
