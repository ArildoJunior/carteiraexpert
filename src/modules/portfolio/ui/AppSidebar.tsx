'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/lib/theme/ThemeToggle';
import { LogoutButton } from '@/modules/identity/ui/LogoutButton';
import type { SafeUser } from '@/modules/identity/domain/user.types';

export interface NavItem {
  label: string;
  href: string;
  id: string;
  badge?: string;
  badgeClass?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const APP_NAVIGATION_GROUPS: NavGroup[] = [
  {
    title: 'Gestão Patrimonial',
    items: [
      { label: 'Dashboard', href: '/dashboard', id: 'nav-link-dashboard' },
      { label: 'Carteiras', href: '/portfolios', id: 'nav-link-portfolios' },
      { label: 'Histórico', href: '/history', id: 'nav-link-history' },
      { label: 'Importações', href: '/import', id: 'nav-link-import' },
      { label: 'Opções', href: '/options', id: 'nav-link-options' },
      { label: 'Fiscal (IRPF)', href: '/fiscal', id: 'nav-link-fiscal' },
    ],
  },
  {
    title: 'Mercado & Ativos',
    items: [
      { label: 'Todos os Ativos', href: '/ativos', id: 'nav-link-ativos', badge: 'TODOS' },
      { label: 'Ações', href: '/acoes', id: 'nav-link-acoes', badge: 'B3' },
      { label: 'FIIs', href: '/fiis', id: 'nav-link-fiis', badge: 'FII' },
      { label: 'ETFs', href: '/etfs', id: 'nav-link-etfs', badge: 'ETF' },
      { label: 'BDRs', href: '/bdrs', id: 'nav-link-bdrs', badge: 'BDR' },
    ],
  },
  {
    title: 'Assinatura',
    items: [
      { label: 'Planos', href: '/plans', id: 'nav-link-plans' },
    ],
  },
];

interface AppSidebarProps {
  user: SafeUser;
  onNavigate?: () => void;
  isMobile?: boolean;
}

function getUserInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppSidebar({ user, onNavigate, isMobile = false }: AppSidebarProps) {
  const pathname = usePathname();

  const brandId = isMobile ? 'mobile-brand-logo' : 'sidebar-brand-logo';
  const themeToggleId = isMobile ? 'mobile-theme-toggle-btn' : 'theme-toggle-btn';
  const logoutButtonId = isMobile ? 'mobile-logout-button' : 'logout-button';

  return (
    <aside
      className={`flex flex-col h-full bg-surface border-r border-border-theme ${
        isMobile ? 'w-full' : 'w-64 xl:w-72'
      }`}
      aria-label="Navegação Principal"
    >
      {/* Top Brand Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border-theme/80 shrink-0">
        <Link
          id={brandId}
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary rounded-lg group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center shadow-xs text-white font-black text-sm tracking-tighter">
            CE
          </div>
          <div className="flex flex-col">
            <span className="text-text-primary font-extrabold text-base tracking-tight leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              CarteiraExpert
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-text-secondary">
              Gestão Patrimonial
            </span>
          </div>
        </Link>
      </div>

      {/* Nav Items Groups */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {APP_NAVIGATION_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1.5">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-text-secondary/70">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));

                const linkId = isMobile ? `mobile-${item.id}` : item.id;

                return (
                  <Link
                    key={item.href}
                    id={linkId}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                      isActive
                        ? 'bg-surface-elevated text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs border border-border-theme/60'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/60'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-surface-elevated text-text-secondary border-border-theme'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom User Profile & Actions */}
      <div className="p-4 border-t border-border-theme/80 bg-surface-elevated/30 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border-theme text-text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {getUserInitials(user.name)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary truncate">
                {user.name}
              </div>
              <div className="text-[11px] text-text-secondary truncate">
                {user.email}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-theme/50">
          {isMobile ? (
            <>
              <ThemeToggle id={themeToggleId} dropdownPlacement="top" />
              <LogoutButton id={logoutButtonId} />
            </>
          ) : (
            <div className="w-full flex justify-end">
              <LogoutButton id={logoutButtonId} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
