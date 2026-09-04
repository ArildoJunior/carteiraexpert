'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { LogoutButton } from '@/modules/identity/ui/LogoutButton';
import { CatalogNavDropdown } from './CatalogNavDropdown';

interface PublicNavbarProps {
  currentUser?: SafeUser | null;
  activePath?: string;
}

export function PublicNavbar({ currentUser, activePath }: PublicNavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;

  const quickLinks = [
    { label: 'Ações', href: '/acoes', id: 'nav-quick-link-acoes' },
    { label: 'FIIs', href: '/fiis', id: 'nav-quick-link-fiis' },
    { label: 'ETFs', href: '/etfs', id: 'nav-quick-link-etfs' },
    { label: 'BDRs', href: '/bdrs', id: 'nav-quick-link-bdrs' },
    { label: 'Simulador', href: '/simulador', id: 'nav-quick-link-simulador' },
  ];

  const mobileCatalogLinks = [
    { label: 'Todos os Ativos', href: '/ativos', id: 'mobile-nav-link-ativos', badge: 'TODOS' },
    { label: 'Ações Brasileiras', href: '/acoes', id: 'mobile-nav-link-acoes', badge: 'B3' },
    { label: 'Fundos Imobiliários', href: '/fiis', id: 'mobile-nav-link-fiis', badge: 'FII' },
    { label: 'Fundos de Índice', href: '/etfs', id: 'mobile-nav-link-etfs', badge: 'ETF' },
    { label: 'BDRs', href: '/bdrs', id: 'mobile-nav-link-bdrs', badge: 'BDR' },
    { label: 'Simulador de Juros', href: '/simulador', id: 'mobile-nav-link-simulador', badge: 'PROJEÇÃO' },
  ];

  return (
    <header className="border-b border-border-theme bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-action-primary flex items-center justify-center">
                <span className="text-action-primary-text font-bold text-sm">CE</span>
              </div>
              <span className="text-text-primary font-semibold text-lg tracking-tight">
                CarteiraExpert
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1.5" aria-label="Navegação Principal">
              {/* Dropdown Principal: Catálogo de Ativos */}
              <CatalogNavDropdown idPrefix="nav" activePath={currentPath} />

              {/* Atalhos Rápidos de Categorias */}
              <div className="h-4 w-[1px] bg-border-theme mx-1" aria-hidden="true" />

              {quickLinks.map((link) => {
                const isActive = currentPath === link.href || currentPath.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    id={link.id}
                    href={link.href}
                    className={`text-sm font-medium transition-colors px-2.5 py-1.5 rounded-lg ${
                      isActive
                        ? 'bg-surface-elevated text-action-primary font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Actions (Desktop) */}
          <div className="hidden md:flex items-center gap-3">
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
                <span className="text-text-secondary text-sm hidden lg:block">
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

          {/* Mobile Menu Button & Theme Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              id="btn-mobile-menu-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border-theme focus:outline-none focus:ring-2 focus:ring-action-primary"
            >
              {isMobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-border-theme bg-surface px-4 pt-3 pb-6 space-y-4 animate-in slide-in-from-top-2 duration-150"
        >
          {/* Seção Catálogo de Ativos Mobile */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted px-2 mb-1.5">
              Catálogo de Ativos
            </div>
            <div className="space-y-1">
              {mobileCatalogLinks.map((link) => {
                const isActive = currentPath === link.href || (link.href !== '/ativos' && currentPath.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    id={link.id}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-elevated text-action-primary font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    <span>{link.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border-theme text-text-muted">
                      {link.badge}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border-theme pt-3">
            {currentUser ? (
              <div className="space-y-2">
                <div className="px-2 text-xs text-text-muted">
                  Conectado como <strong className="text-text-primary">{currentUser.name}</strong>
                </div>
                <Link
                  id="mobile-nav-link-dashboard"
                  href="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full text-center px-4 py-2 rounded-lg bg-surface-elevated border border-border-theme text-text-primary text-sm font-medium"
                >
                  Acessar Dashboard
                </Link>
                <div className="pt-1">
                  <LogoutButton />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  id="mobile-nav-link-login"
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-center px-4 py-2 rounded-lg border border-border-theme text-text-primary text-sm font-medium hover:bg-surface-elevated"
                >
                  Entrar
                </Link>
                <Link
                  id="mobile-nav-link-register"
                  href="/register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-center px-4 py-2 rounded-lg bg-action-primary text-action-primary-text text-sm font-medium hover:opacity-90"
                >
                  Criar Conta
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
