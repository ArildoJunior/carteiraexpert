/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { DashboardNavbar } from '@/app/(dashboard)/DashboardNavbar';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import type { SafeUser } from '@/modules/identity/domain/user.types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/carteira-sugerida',
}));

describe('Navegação da Carteira Sugerida (CSP)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('renderiza o link "Carteira Sugerida" no PublicNavbar com href correto', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider>
          <PublicNavbar />
        </ThemeProvider>
      );
    });

    const link = container?.querySelector('a[href="/carteira-sugerida"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Carteira Sugerida');
  });

  it('renderiza o link "Carteira Sugerida" no DashboardNavbar com href correto', async () => {
    const mockUser: SafeUser = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'investor@example.com',
      name: 'Investidor Teste',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await act(async () => {
      root?.render(
        <ThemeProvider>
          <DashboardNavbar user={mockUser} />
        </ThemeProvider>
      );
    });

    const link = container?.querySelector('a[href="/carteira-sugerida"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Carteira Sugerida');
  });
});
