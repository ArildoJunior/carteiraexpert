/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CatalogNavDropdown } from '@/modules/catalog/ui/CatalogNavDropdown';

// Mock do next/link e next/navigation
vi.mock('next/link', () => ({
  default: ({ children, href, id, className, onClick, role }: any) => (
    <a href={href} id={id} className={className} onClick={onClick} role={role}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('CatalogNavDropdown — Testes Unitários de UI (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
  });


  it('deve renderizar o botão do dropdown fechado por padrão', async () => {
    await act(async () => {
      root!.render(<CatalogNavDropdown idPrefix="nav" />);
    });

    const trigger = container!.querySelector('#nav-link-catalog') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain('Catálogo de Ativos');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    const menu = container!.querySelector('#nav-catalog-dropdown-menu');
    expect(menu).toBeNull();
  });

  it('deve abrir o menu ao clicar no botão e listar todas as 5 categorias com links corretos', async () => {
    await act(async () => {
      root!.render(<CatalogNavDropdown idPrefix="nav" />);
    });

    const trigger = container!.querySelector('#nav-link-catalog') as HTMLButtonElement;

    // Clica para abrir
    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = container!.querySelector('#nav-catalog-dropdown-menu');
    expect(menu).not.toBeNull();

    // Valida os 5 links com rotas oficiais
    const linkAtivos = container!.querySelector('#nav-link-ativos') as HTMLAnchorElement;
    const linkAcoes = container!.querySelector('#nav-link-acoes') as HTMLAnchorElement;
    const linkFiis = container!.querySelector('#nav-link-fiis') as HTMLAnchorElement;
    const linkEtfs = container!.querySelector('#nav-link-etfs') as HTMLAnchorElement;
    const linkBdrs = container!.querySelector('#nav-link-bdrs') as HTMLAnchorElement;

    expect(linkAtivos).not.toBeNull();
    expect(linkAtivos.getAttribute('href')).toBe('/ativos');
    expect(linkAtivos.textContent).toContain('Todos os Ativos');

    expect(linkAcoes).not.toBeNull();
    expect(linkAcoes.getAttribute('href')).toBe('/acoes');
    expect(linkAcoes.textContent).toContain('Ações');

    expect(linkFiis).not.toBeNull();
    expect(linkFiis.getAttribute('href')).toBe('/fiis');
    expect(linkFiis.textContent).toContain('FIIs');

    expect(linkEtfs).not.toBeNull();
    expect(linkEtfs.getAttribute('href')).toBe('/etfs');
    expect(linkEtfs.textContent).toContain('ETFs');

    expect(linkBdrs).not.toBeNull();
    expect(linkBdrs.getAttribute('href')).toBe('/bdrs');
    expect(linkBdrs.textContent).toContain('BDRs');
  });

  it('deve fechar o menu ao pressionar a tecla Escape', async () => {
    await act(async () => {
      root!.render(<CatalogNavDropdown idPrefix="nav" />);
    });

    const trigger = container!.querySelector('#nav-link-catalog') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container!.querySelector('#nav-catalog-dropdown-menu')).not.toBeNull();

    // Dispara tecla Escape
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(container!.querySelector('#nav-catalog-dropdown-menu')).toBeNull();
  });

  it('deve fechar o menu ao clicar fora', async () => {
    await act(async () => {
      root!.render(<CatalogNavDropdown idPrefix="nav" />);
    });

    const trigger = container!.querySelector('#nav-link-catalog') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(container!.querySelector('#nav-catalog-dropdown-menu')).not.toBeNull();

    // Dispara clique fora
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container!.querySelector('#nav-catalog-dropdown-menu')).toBeNull();
  });

  it('deve suportar idPrefix customizado (ex: dashboard-nav)', async () => {
    await act(async () => {
      root!.render(<CatalogNavDropdown idPrefix="dashboard-nav" activePath="/acoes" />);
    });

    const trigger = container!.querySelector('#dashboard-nav-link-catalog') as HTMLButtonElement;
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger.click();
    });

    expect(container!.querySelector('#dashboard-nav-link-acoes')).not.toBeNull();
    expect(container!.querySelector('#dashboard-nav-link-ativos')).not.toBeNull();
  });
});
