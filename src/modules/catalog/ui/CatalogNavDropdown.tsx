'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface CatalogNavDropdownProps {
  idPrefix?: string;
  activePath?: string;
  buttonClassName?: string;
}

export function CatalogNavDropdown({
  idPrefix = 'nav',
  activePath,
  buttonClassName,
}: CatalogNavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const currentPath = activePath ?? pathname;

  const isCatalogActive =
    currentPath === '/ativos' ||
    currentPath.startsWith('/acoes') ||
    currentPath.startsWith('/fiis') ||
    currentPath.startsWith('/etfs') ||
    currentPath.startsWith('/bdrs');

  const catalogItems = [
    {
      label: 'Todos os Ativos',
      href: '/ativos',
      idSuffix: 'ativos',
      badge: 'TODOS',
      badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
      description: 'Índice completo e busca global de ativos',
    },
    {
      label: 'Ações',
      href: '/acoes',
      idSuffix: 'acoes',
      badge: 'B3',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      description: 'Ações listadas na bolsa brasileira',
    },
    {
      label: 'FIIs',
      href: '/fiis',
      idSuffix: 'fiis',
      badge: 'FII',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      description: 'Fundos de investimento imobiliário',
    },
    {
      label: 'ETFs',
      href: '/etfs',
      idSuffix: 'etfs',
      badge: 'ETF',
      badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      description: 'Fundos de índices nacionais e internacionais',
    },
    {
      label: 'BDRs',
      href: '/bdrs',
      idSuffix: 'bdrs',
      badge: 'BDR',
      badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      description: 'Certificados de empresas internacionais em BRL',
    },
  ];

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        id={`${idPrefix}-link-catalog`}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={
          buttonClassName ??
          `text-sm font-medium transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
            isCatalogActive
              ? 'bg-surface-elevated text-action-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
          }`
        }
      >
        <span>Catálogo de Ativos</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-action-primary' : 'text-text-muted'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          id={`${idPrefix}-catalog-dropdown-menu`}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={`${idPrefix}-link-catalog`}
          className="absolute left-0 mt-2 w-72 rounded-xl border border-border-theme bg-surface shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-1.5 border-b border-border-theme/60 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Categorias do Mercado
          </div>

          <div className="p-1 space-y-0.5">
            {catalogItems.map((item) => {
              const isItemActive = currentPath === item.href || (item.href !== '/ativos' && currentPath.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  id={`${idPrefix}-link-${item.idSuffix}`}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors group ${
                    isItemActive
                      ? 'bg-surface-elevated text-action-primary'
                      : 'text-text-primary hover:bg-surface-elevated'
                  }`}
                >
                  <span
                    className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${item.badgeClass}`}
                  >
                    {item.badge}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-text-primary group-hover:text-action-primary transition-colors flex items-center justify-between">
                      <span>{item.label}</span>
                      <span className="text-text-muted group-hover:text-action-primary text-[10px]">
                        &rarr;
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5 truncate">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
