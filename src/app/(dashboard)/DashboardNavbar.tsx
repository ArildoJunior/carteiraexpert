'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';
import { LogoutButton } from '@/modules/identity/ui/LogoutButton';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { CatalogNavDropdown } from '@/modules/catalog/ui/CatalogNavDropdown';

interface DashboardNavbarProps {
  user: SafeUser;
}

export function DashboardNavbar({ user }: DashboardNavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const mainLinks = [
    { label: 'Dashboard', href: '/dashboard', id: 'nav-link-dashboard' },
    { label: 'Carteiras', href: '/portfolios', id: 'nav-link-portfolios' },
    { label: 'Histórico', href: '/history', id: 'nav-link-history' },
    { label: 'Importações', href: '/import', id: 'nav-link-import' },
    { label: 'Simulador', href: '/simulador', id: 'nav-link-simulador' },
    { label: 'Opções', href: '/options', id: 'nav-link-options' },
    { label: 'Planos', href: '/plans', id: 'nav-link-plans' },
  ];

  const mobileCatalogLinks = [
    { label: 'Todos os Ativos', href: '/ativos', id: 'dashboard-mobile-link-ativos', badge: 'TODOS' },
    { label: 'Ações Brasileiras', href: '/acoes', id: 'dashboard-mobile-link-acoes', badge: 'B3' },
    { label: 'Fundos Imobiliários', href: '/fiis', id: 'dashboard-mobile-link-fiis', badge: 'FII' },
    { label: 'Fundos de Índice', href: '/etfs', id: 'dashboard-mobile-link-etfs', badge: 'ETF' },
    { label: 'BDRs', href: '/bdrs', id: 'dashboard-mobile-link-bdrs', badge: 'BDR' },
    { label: 'Simulador de Juros', href: '/simulador', id: 'dashboard-mobile-link-simulador', badge: 'PROJEÇÃO' },
    { label: 'Opções e Derivativos', href: '/options', id: 'dashboard-mobile-link-options', badge: 'DERIVATIVOS' },
  ];

  return (
    <nav className="border-b border-border-theme bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-action-primary flex items-center justify-center">
                <span className="text-action-primary-text font-bold text-sm">CE</span>
              </div>
              <span className="text-text-primary font-semibold text-lg tracking-tight">
                CarteiraExpert
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1.5" aria-label="Navegação da Aplicação">
              {mainLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    id={link.id}
                    href={link.href}
                    className={`text-sm font-medium transition-colors px-3 py-1.5 rounded-lg ${
                      isActive
                        ? 'bg-surface-elevated text-action-primary font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              <div className="h-4 w-[1px] bg-border-theme mx-1" aria-hidden="true" />

              {/* Catálogo de Ativos na Área Autenticada */}
              <CatalogNavDropdown idPrefix="dashboard-nav" activePath={pathname} />
            </div>
          </div>

          {/* User Profile & Right Actions (Desktop) */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-text-secondary text-sm hidden sm:block">
              {user.name}
            </span>
            <ThemeToggle />
            <LogoutButton />
          </div>

          {/* Mobile Menu Toggle & Theme Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              id="btn-dashboard-mobile-menu-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="dashboard-mobile-menu"
              aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
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

      {/* Mobile Drawer (Dashboard) */}
      {isMobileMenuOpen && (
        <div
          id="dashboard-mobile-menu"
          className="md:hidden border-t border-border-theme bg-surface px-4 pt-3 pb-6 space-y-4 animate-in slide-in-from-top-2 duration-150"
        >
          {/* Links Principais do Dashboard */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted px-2 mb-1.5">
              Gestão Patrimonial
            </div>
            <div className="space-y-1">
              {mainLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    id={`mobile-${link.id}`}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-surface-elevated text-action-primary font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Seção Catálogo de Ativos no Mobile */}
          <div className="border-t border-border-theme pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted px-2 mb-1.5">
              Catálogo de Ativos
            </div>
            <div className="space-y-1">
              {mobileCatalogLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/ativos' && pathname.startsWith(link.href));
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

          {/* Usuário e Logout */}
          <div className="border-t border-border-theme pt-3 space-y-2">
            <div className="px-2 text-xs text-text-muted">
              Conectado como <strong className="text-text-primary">{user.name}</strong> ({user.email})
            </div>
            <div className="pt-1">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
