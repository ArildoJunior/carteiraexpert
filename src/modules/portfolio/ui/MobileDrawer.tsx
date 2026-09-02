'use client';

import React, { useEffect, useRef } from 'react';
import { AppSidebar } from './AppSidebar';
import type { SafeUser } from '@/modules/identity/domain/user.types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: SafeUser;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileDrawer({ isOpen, onClose, user }: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // 1. Salva o elemento previamente focado para restaurar ao fechar
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // 2. Bloqueia a rolagem do body
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 3. Define o foco inicial no primeiro elemento focável (botão fechar)
    const focusTimer = setTimeout(() => {
      if (drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }
    }, 50);

    // 4. Trap de foco e tratamento da tecla Escape
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;

      // 5. Restaura o foco para o elemento anterior (com fallback para o botão toggle no WebKit/Safari)
      const prevElement =
        previousActiveElementRef.current && previousActiveElementRef.current !== document.body
          ? previousActiveElementRef.current
          : document.getElementById('btn-dashboard-mobile-menu-toggle');

      if (prevElement && typeof prevElement.focus === 'function') {
        setTimeout(() => {
          prevElement.focus();
        }, 30);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      id="dashboard-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de Navegação Mobile"
      className="fixed inset-0 z-50 lg:hidden flex"
    >
      {/* Backdrop */}
      <div
        id="mobile-drawer-backdrop"
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel com Ref utilizado para Trap de Foco */}
      <div
        ref={drawerRef}
        className="relative flex-1 flex flex-col max-w-xs w-full bg-surface shadow-2xl z-10 animate-in slide-in-from-left duration-200"
      >
        {/* Close Button Top Right */}
        <div className="absolute top-3 right-3 z-20">
          <button
            id="btn-close-mobile-drawer"
            type="button"
            onClick={onClose}
            aria-label="Fechar menu de navegação"
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sidebar content */}
        <AppSidebar user={user} onNavigate={onClose} isMobile={true} />
      </div>
    </div>
  );
}
