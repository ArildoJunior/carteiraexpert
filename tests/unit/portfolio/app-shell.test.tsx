/**
 * @vitest-environment jsdom
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppShell } from '@/modules/portfolio/ui/AppShell';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import type { SafeUser } from '@/modules/identity/domain/user.types';

// Mock de next/navigation e next/link
let currentPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

interface MockLinkProps {
  children?: React.ReactNode;
  href: string;
  id?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';
}

vi.mock('next/link', () => ({
  default: ({ children, href, id, className, onClick, 'aria-current': ariaCurrent }: MockLinkProps) => (
    <a href={href} id={id} className={className} onClick={onClick} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

// Mock do LogoutButton e ThemeToggle
vi.mock('@/app/(auth)/actions', () => ({
  logoutAction: vi.fn().mockResolvedValue({ success: true }),
}));

const mockUser: SafeUser = {
  id: 'usr-123',
  email: 'usuario@carteiraexpert.com.br',
  name: 'Arildo Junior',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('AppShell — Testes Unitários de Interface e Acessibilidade (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentPathname = '/dashboard';
    document.body.style.overflow = '';
  });

  afterEach(() => {
    if (root && container) {
      const currentRoot = root;
      act(() => {
        currentRoot.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
    document.body.style.overflow = '';
  });

  it('deve renderizar a sidebar desktop com todos os grupos e links reais da plataforma sem IDs duplicados', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <AppShell user={mockUser}>
            <div id="test-content">Conteúdo da Página</div>
          </AppShell>
        </ThemeProvider>
      );
    });

    // Conteúdo filho
    expect(container!.querySelector('#test-content')).not.toBeNull();
    expect(container!.textContent).toContain('Conteúdo da Página');

    // Marca
    expect(container!.textContent).toContain('CarteiraExpert');

    // Grupo 1: Gestão Patrimonial
    expect(container!.textContent).toContain('Gestão Patrimonial');
    expect(container!.querySelector('#nav-link-dashboard')).not.toBeNull();
    expect(container!.querySelector('#nav-link-portfolios')).not.toBeNull();
    expect(container!.querySelector('#nav-link-history')).not.toBeNull();
    expect(container!.querySelector('#nav-link-import')).not.toBeNull();

    // Grupo 2: Mercado & Ativos
    expect(container!.textContent).toContain('Mercado & Ativos');
    expect(container!.querySelector('#nav-link-ativos')).not.toBeNull();
    expect(container!.querySelector('#nav-link-acoes')).not.toBeNull();
    expect(container!.querySelector('#nav-link-fiis')).not.toBeNull();
    expect(container!.querySelector('#nav-link-etfs')).not.toBeNull();
    expect(container!.querySelector('#nav-link-bdrs')).not.toBeNull();

    // Grupo 3: Conta & Assinatura
    expect(container!.textContent).toContain('Assinatura');
    expect(container!.querySelector('#nav-link-plans')).not.toBeNull();

    // Perfil do usuário e botões essenciais na sidebar
    expect(container!.textContent).toContain('Arildo Junior');
    expect(container!.querySelector('#logout-button')).not.toBeNull();
    expect(container!.querySelector('#theme-toggle-btn')).not.toBeNull();

    // Garante que os controles do mobile não estão renderizados no DOM inicial
    expect(container!.querySelector('#mobile-theme-toggle-btn')).toBeNull();
    expect(container!.querySelector('#mobile-logout-button')).toBeNull();
  });

  it('deve destacar e definir aria-current="page" na rota ativa', async () => {
    currentPathname = '/portfolios';

    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <AppShell user={mockUser}>
            <div>Conteúdo</div>
          </AppShell>
        </ThemeProvider>
      );
    });

    const activeLink = container!.querySelector('#nav-link-portfolios') as HTMLAnchorElement;
    expect(activeLink).not.toBeNull();
    expect(activeLink.getAttribute('aria-current')).toBe('page');

    const inactiveLink = container!.querySelector('#nav-link-dashboard') as HTMLAnchorElement;
    expect(inactiveLink).not.toBeNull();
    expect(inactiveLink.getAttribute('aria-current')).toBeNull();
  });

  it('deve gerenciar abertura, fechamento por Escape, bloqueio de rolagem e ausência de IDs duplicados no menu mobile', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <AppShell user={mockUser}>
            <div>Conteúdo</div>
          </AppShell>
        </ThemeProvider>
      );
    });

    const toggleBtn = container!.querySelector('#btn-dashboard-mobile-menu-toggle') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    // Menu mobile não deve estar aberto inicialmente
    expect(container!.querySelector('#dashboard-mobile-menu')).toBeNull();
    expect(document.body.style.overflow).toBe('');

    // 1. Abre o menu mobile
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    const mobileMenu = container!.querySelector('#dashboard-mobile-menu');
    expect(mobileMenu).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    // Links no mobile com IDs diferenciados
    const mobileImportLink = container!.querySelector('#mobile-nav-link-import') as HTMLAnchorElement;
    expect(mobileImportLink).not.toBeNull();
    expect(mobileImportLink.getAttribute('href')).toBe('/import');

    const mobileThemeToggle = container!.querySelector('#mobile-theme-toggle-btn') as HTMLButtonElement;
    expect(mobileThemeToggle).not.toBeNull();

    const mobileLogout = container!.querySelector('#mobile-logout-button') as HTMLButtonElement;
    expect(mobileLogout).not.toBeNull();

    // 2. Fecha pressionando a tecla Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(container!.querySelector('#dashboard-mobile-menu')).toBeNull();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');

    // 3. Abre novamente e fecha clicando no backdrop
    await act(async () => {
      toggleBtn.click();
    });
    expect(container!.querySelector('#dashboard-mobile-menu')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    const backdrop = container!.querySelector('#mobile-drawer-backdrop') as HTMLDivElement;
    await act(async () => {
      backdrop.click();
    });

    expect(container!.querySelector('#dashboard-mobile-menu')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('deve exibir o cabeçalho contextual com o título da seção atual e nome do usuário', async () => {
    currentPathname = '/history';

    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <AppShell user={mockUser}>
            <div>Histórico</div>
          </AppShell>
        </ThemeProvider>
      );
    });

    const header = container!.querySelector('#app-header');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('Histórico');
    expect(header!.textContent).toContain('Arildo Junior');
    expect(header!.querySelector('#theme-toggle-btn')).not.toBeNull();
  });

  it('deve garantir que o ThemeToggle está presente no cabeçalho e sem duplicação de ID no DOM desktop', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <AppShell user={mockUser}>
            <div>Conteúdo</div>
          </AppShell>
        </ThemeProvider>
      );
    });

    const themeToggles = container!.querySelectorAll('#theme-toggle-btn');
    expect(themeToggles.length).toBe(1);
    expect(container!.querySelector('#app-header #theme-toggle-btn')).not.toBeNull();
  });
});
