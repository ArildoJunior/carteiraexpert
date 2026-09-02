'use client';

import React, { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { MobileDrawer } from './MobileDrawer';
import type { SafeUser } from '@/modules/identity/domain/user.types';

interface AppShellProps {
  user: SafeUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleCloseMobileMenu = React.useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleToggleMobileMenu = React.useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {/* 1. Desktop Persistent Sidebar */}
      <div className="hidden lg:flex fixed inset-y-0 left-0 z-30">
        <AppSidebar user={user} />
      </div>

      {/* 2. Main Content Layout Area */}
      <div className="flex-1 lg:pl-64 xl:pl-72 flex flex-col min-h-screen min-w-0">
        {/* Contextual Header */}
        <AppHeader
          user={user}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={handleToggleMobileMenu}
        />

        {/* Dynamic Route Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>

      {/* 3. Mobile Responsive Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={handleCloseMobileMenu}
        user={user}
      />
    </div>
  );
}
