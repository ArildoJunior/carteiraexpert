'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';
import type { SafeUser } from '@/modules/identity/domain/user.types';

interface AppHeaderProps {
  user: SafeUser;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

function getContextualTitle(pathname: string): { title: string; category?: string } {
  if (pathname === '/dashboard') return { title: 'Dashboard Consolidado', category: 'Gestão Patrimonial' };
  if (pathname === '/portfolios') return { title: 'Minhas Carteiras', category: 'Gestão Patrimonial' };
  if (pathname.startsWith('/portfolios/')) return { title: 'Detalhes da Carteira', category: 'Gestão Patrimonial' };
  if (pathname.startsWith('/history')) return { title: 'Histórico de Transações', category: 'Gestão Patrimonial' };
  if (pathname === '/import') return { title: 'Importação de Dados', category: 'Gestão Patrimonial' };
  if (pathname.startsWith('/import/')) return { title: 'Revisão de Lote de Importação', category: 'Gestão Patrimonial' };
  if (pathname.startsWith('/plans')) return { title: 'Assinatura & Planos', category: 'Conta' };
  if (pathname === '/ativos') return { title: 'Todos os Ativos', category: 'Mercado' };
  if (pathname === '/acoes') return { title: 'Ações Brasileiras (B3)', category: 'Mercado' };
  if (pathname.startsWith('/acoes/')) return { title: 'Ações Brasileiras', category: 'Catálogo de Ativos' };
  if (pathname === '/fiis') return { title: 'Fundos Imobiliários (FIIs)', category: 'Mercado' };
  if (pathname.startsWith('/fiis/')) return { title: 'Fundos Imobiliários', category: 'Catálogo de Ativos' };
  if (pathname === '/etfs') return { title: 'Fundos de Índice (ETFs)', category: 'Mercado' };
  if (pathname.startsWith('/etfs/')) return { title: 'Fundos de Índice', category: 'Catálogo de Ativos' };
  if (pathname === '/bdrs') return { title: 'Certificados BDRs', category: 'Mercado' };
  if (pathname.startsWith('/bdrs/')) return { title: 'Certificados BDRs', category: 'Catálogo de Ativos' };
  return { title: 'CarteiraExpert', category: 'Plataforma' };
}

export function AppHeader({ user, isMobileMenuOpen, onToggleMobileMenu }: AppHeaderProps) {
  const pathname = usePathname();
  const { title, category } = getContextualTitle(pathname);

  return (
    <header
      id="app-header"
      className="sticky top-0 z-20 h-16 border-b border-border-theme bg-surface/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors"
    >
      {/* Left: Mobile Toggle & Contextual Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          id="btn-dashboard-mobile-menu-toggle"
          type="button"
          onClick={onToggleMobileMenu}
          aria-expanded={isMobileMenuOpen}
          aria-controls="dashboard-mobile-menu"
          aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
          className="lg:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary transition-colors"
        >
          {isMobileMenuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        <div className="flex flex-col min-w-0">
          {category && (
            <span className="text-[10px] uppercase font-bold tracking-wider text-text-secondary truncate">
              {category}
            </span>
          )}
          <span className="text-sm sm:text-base font-bold text-text-primary tracking-tight truncate">
            {title}
          </span>
        </div>
      </div>

      {/* Right: Theme Toggle & User identification */}
      <div className="flex items-center gap-3">
        <ThemeToggle id="theme-toggle-btn" />
        <span className="hidden sm:inline-block text-xs font-medium text-text-secondary truncate max-w-[200px]">
          {user.name}
        </span>
      </div>
    </header>
  );
}
