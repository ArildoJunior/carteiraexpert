/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  THEME_STORAGE_KEY,
  THEME_TOKENS,
  type ThemePreference,
  type ResolvedTheme,
} from '../../../src/lib/theme/theme.types';
import { themeScriptInline } from '../../../src/lib/theme/theme-script';
import { ThemeProvider, useTheme, ThemeToggle } from '../../../src/lib/theme';

describe('Unitário: Sistema de Tema e Identidade Visual — CarteiraExpert', () => {
  let localStorageStore: Record<string, string> = {};
  let systemPrefersDark = false;
  let mediaQueryListeners: Array<(e: MediaQueryListEvent) => void> = [];
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    localStorageStore = {};
    systemPrefersDark = false;
    mediaQueryListeners = [];
    document.documentElement.className = '';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
    });

    // Mock matchMedia
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? systemPrefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn((listener: (e: MediaQueryListEvent) => void) => {
        mediaQueryListeners.push(listener);
      }),
      removeListener: vi.fn((listener: (e: MediaQueryListEvent) => void) => {
        mediaQueryListeners = mediaQueryListeners.filter((l) => l !== listener);
      }),
      addEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
        mediaQueryListeners.push(listener);
      }),
      removeEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
        mediaQueryListeners = mediaQueryListeners.filter((l) => l !== listener);
      }),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
    document.documentElement.className = '';
  });

  async function render(element: React.ReactElement) {
    await act(async () => {
      root.render(element);
    });
  }

  describe('1. Matriz de Tokens Semânticos e Paleta Aprovada', () => {
    it('deve ter a chave de armazenamento consistente', () => {
      expect(THEME_STORAGE_KEY).toBe('carteiraexpert_theme');
    });

    it('deve definir tokens do tema claro conforme especificações visuais', () => {
      const light = THEME_TOKENS.light;
      expect(light.background).toBe('#F8FAFC');
      expect(light.surface).toBe('#FFFFFF');
      expect(light.surfaceElevated).toBe('#FFFFFF');
      expect(light.textPrimary).toBe('#0F172A');
      expect(light.textSecondary).toBe('#64748B');
      expect(light.border).toBe('#E2E8F0');
      expect(light.positiveText).toBe('#047857');
      expect(light.positiveChart).toBe('#059669');
      expect(light.negativeText).toBe('#B91C1C');
      expect(light.negativeChart).toBe('#DC2626');
      expect(light.actionPrimary).toBe('#C9A86A');
      expect(light.actionPrimaryText).toBe('#0F172A');
      expect(light.costColor).toBe('#4F46E5');
      expect(light.quotedCostColor).toBe('#6366F1');
      expect(light.chartGradientStartOpacity).toBe(0.15);
      expect(light.chartGradientStopOpacity).toBe(0.0);
    });

    it('deve definir tokens do tema escuro conforme especificações visuais', () => {
      const dark = THEME_TOKENS.dark;
      expect(dark.background).toBe('#0B1120');
      expect(dark.surface).toBe('#1E293B');
      expect(dark.surfaceElevated).toBe('#263449');
      expect(dark.textPrimary).toBe('#FFFFFF');
      expect(dark.textSecondary).toBe('#94A3B8');
      expect(dark.border).toBe('#334155');
      expect(dark.positiveText).toBe('#10B981');
      expect(dark.positiveChart).toBe('#10B981');
      expect(dark.negativeText).toBe('#EF4444');
      expect(dark.negativeChart).toBe('#EF4444');
      expect(dark.actionPrimary).toBe('#4F46E5');
      expect(dark.actionPrimaryText).toBe('#FFFFFF');
      expect(dark.costColor).toBe('#818CF8');
      expect(dark.quotedCostColor).toBe('#A5B4FC');
      expect(dark.chartGradientStartOpacity).toBe(0.10);
      expect(dark.chartGradientStopOpacity).toBe(0.0);
    });
  });

  describe('2. Script Anti-FOUC Inline', () => {
    it('deve gerar string de script não vazia contendo a chave de storage e IIFE', () => {
      expect(themeScriptInline).toContain(THEME_STORAGE_KEY);
      expect(themeScriptInline).toContain('prefers-color-scheme: dark');
      expect(themeScriptInline).toContain('classList');
    });

    it('deve aplicar classe dark quando localStorage contiver "dark"', () => {
      localStorageStore[THEME_STORAGE_KEY] = 'dark';
      const fn = new Function(themeScriptInline);
      fn();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('deve remover classe dark quando localStorage contiver "light"', () => {
      document.documentElement.classList.add('dark');
      localStorageStore[THEME_STORAGE_KEY] = 'light';
      const fn = new Function(themeScriptInline);
      fn();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('deve respeitar prefers-color-scheme do sistema quando localStorage for "system" ou vazio', () => {
      systemPrefersDark = true;
      localStorageStore[THEME_STORAGE_KEY] = 'system';
      const fn = new Function(themeScriptInline);
      fn();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('não deve quebrar se localStorage.getItem lançar exceção (ex: iframe sandbox)', () => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => {
          throw new Error('SecurityError: The operation is insecure.');
        }),
      });

      expect(() => {
        const fn = new Function(themeScriptInline);
        fn();
      }).not.toThrow();
    });
  });

  describe('3. Componente Real: ThemeProvider e Hook useTheme', () => {
    function TestConsumer({ onMount }: { onMount?: (val: ReturnType<typeof useTheme>) => void }) {
      const themeContext = useTheme();
      React.useEffect(() => {
        if (onMount) onMount(themeContext);
      }, [themeContext, onMount]);

      return (
        <div id="test-consumer">
          <span id="consumer-theme">{themeContext.theme}</span>
          <span id="consumer-resolved">{themeContext.resolvedTheme}</span>
          <span id="consumer-bg">{themeContext.tokens.background}</span>
          <button
            type="button"
            id="btn-set-dark"
            onClick={() => themeContext.setTheme('dark')}
          >
            Set Dark
          </button>
          <button
            type="button"
            id="btn-set-light"
            onClick={() => themeContext.setTheme('light')}
          >
            Set Light
          </button>
          <button
            type="button"
            id="btn-set-system"
            onClick={() => themeContext.setTheme('system')}
          >
            Set System
          </button>
          <button
            type="button"
            id="btn-toggle"
            onClick={() => themeContext.toggleTheme()}
          >
            Toggle
          </button>
        </div>
      );
    }

    it('deve lançar erro explicativo quando useTheme for usado fora do ThemeProvider', async () => {
      let capturedError: Error | null = null;
      class ErrorBoundary extends React.Component<
        { children: React.ReactNode },
        { hasError: boolean }
      > {
        state = { hasError: false };
        static getDerivedStateFromError(error: Error) {
          capturedError = error;
          return { hasError: true };
        }
        render() {
          return this.state.hasError ? null : this.props.children;
        }
      }

      const BadComponent = () => {
        useTheme();
        return null;
      };

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await render(
        <ErrorBoundary>
          <BadComponent />
        </ErrorBoundary>
      );
      consoleError.mockRestore();

      expect(capturedError).toBeInstanceOf(Error);
      expect((capturedError as unknown as Error).message).toContain(
        'useTheme deve ser utilizado dentro de um ThemeProvider.'
      );
    });

    it('deve sincronizar resolvedTheme imediatamente quando o HTML já possui classe dark (anti-FOUC)', async () => {
      localStorageStore[THEME_STORAGE_KEY] = 'dark';
      document.documentElement.classList.add('dark');
      let capturedContext: ReturnType<typeof useTheme> | undefined;

      await render(
        <ThemeProvider>
          <TestConsumer
            onMount={(ctx) => {
              capturedContext = ctx;
            }}
          />
        </ThemeProvider>
      );

      expect(capturedContext?.resolvedTheme).toBe('dark');
      expect(capturedContext?.tokens.background).toBe('#0B1120');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('deve alternar para dark, aplicar classe no document.documentElement e persistir no localStorage', async () => {
      await render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      const btnDark = container.querySelector('#btn-set-dark') as HTMLButtonElement;
      await act(async () => {
        btnDark.click();
      });

      expect(container.querySelector('#consumer-theme')?.textContent).toBe('dark');
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('deve alternar para light, remover classe no document.documentElement e persistir no localStorage', async () => {
      document.documentElement.classList.add('dark');
      localStorageStore[THEME_STORAGE_KEY] = 'dark';

      await render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      const btnLight = container.querySelector('#btn-set-light') as HTMLButtonElement;
      await act(async () => {
        btnLight.click();
      });

      expect(container.querySelector('#consumer-theme')?.textContent).toBe('light');
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });

    it('deve remover .dark e persistir "system" ao selecionar system com sistema claro e tema anterior escuro', async () => {
      systemPrefersDark = false;
      await render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      const btnDark = container.querySelector('#btn-set-dark') as HTMLButtonElement;
      const btnSystem = container.querySelector('#btn-set-system') as HTMLButtonElement;

      // 1. Muda para escuro
      await act(async () => {
        btnDark.click();
      });
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('dark');

      // 2. Muda para system (com sistema configurado como claro)
      await act(async () => {
        btnSystem.click();
      });

      expect(container.querySelector('#consumer-theme')?.textContent).toBe('system');
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    });

    it('deve adicionar .dark e persistir "system" ao selecionar system com sistema escuro e tema anterior claro', async () => {
      systemPrefersDark = true;
      await render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      const btnLight = container.querySelector('#btn-set-light') as HTMLButtonElement;
      const btnSystem = container.querySelector('#btn-set-system') as HTMLButtonElement;

      // 1. Muda para claro
      await act(async () => {
        btnLight.click();
      });
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');

      // 2. Muda para system (com sistema configurado como escuro)
      await act(async () => {
        btnSystem.click();
      });

      expect(container.querySelector('#consumer-theme')?.textContent).toBe('system');
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    });

    it('deve alternar tema usando toggleTheme', async () => {
      await render(
        <ThemeProvider defaultTheme="light">
          <TestConsumer />
        </ThemeProvider>
      );

      const btnToggle = container.querySelector('#btn-toggle') as HTMLButtonElement;
      await act(async () => {
        btnToggle.click();
      });

      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      await act(async () => {
        btnToggle.click();
      });

      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('deve reagir dinamicamente a mudanças de prefers-color-scheme quando em modo system', async () => {
      await render(
        <ThemeProvider defaultTheme="system">
          <TestConsumer />
        </ThemeProvider>
      );

      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Simula mudança no sistema operacional para dark
      await act(async () => {
        for (const listener of mediaQueryListeners) {
          listener({ matches: true } as MediaQueryListEvent);
        }
      });

      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Simula mudança de volta para light
      await act(async () => {
        for (const listener of mediaQueryListeners) {
          listener({ matches: false } as MediaQueryListEvent);
        }
      });

      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('NÃO deve mudar o tema resolvido em modo manual quando o sistema mudar', async () => {
      await render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );

      const btnLight = container.querySelector('#btn-set-light') as HTMLButtonElement;
      await act(async () => {
        btnLight.click();
      });

      expect(container.querySelector('#consumer-theme')?.textContent).toBe('light');

      // Sistema muda para dark
      await act(async () => {
        for (const listener of mediaQueryListeners) {
          listener({ matches: true } as MediaQueryListEvent);
        }
      });

      // Permanece light
      expect(container.querySelector('#consumer-resolved')?.textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('4. Componente Real: ThemeToggle (Acessibilidade e Interação)', () => {
    it('deve renderizar botão com aria-label descritivo e aria-expanded="false" inicial', async () => {
      await render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      const btn = container.querySelector('#theme-toggle-btn') as HTMLButtonElement;
      expect(btn).toBeDefined();
      expect(btn.getAttribute('aria-label')).toBe(
        'Alternar tema de visualização (claro, escuro ou automático do sistema)'
      );
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[role="menu"]')).toBeNull();
    });

    it('deve abrir o menu ao clicar no botão e atualizar aria-expanded="true"', async () => {
      await render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      const btn = container.querySelector('#theme-toggle-btn') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(btn.getAttribute('aria-expanded')).toBe('true');
      const menu = container.querySelector('[role="menu"]') as HTMLDivElement;
      expect(menu).toBeDefined();
      expect(menu.getAttribute('aria-orientation')).toBe('vertical');

      const optLight = container.querySelector('#theme-option-light');
      const optDark = container.querySelector('#theme-option-dark');
      const optSystem = container.querySelector('#theme-option-system');
      expect(optLight).toBeDefined();
      expect(optDark).toBeDefined();
      expect(optSystem).toBeDefined();
    });

    it('deve fechar o menu e aplicar o tema ao selecionar uma opção', async () => {
      await render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      const btn = container.querySelector('#theme-toggle-btn') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      const optDark = container.querySelector('#theme-option-dark') as HTMLButtonElement;
      await act(async () => {
        optDark.click();
      });

      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('deve fechar o menu ao pressionar a tecla Escape', async () => {
      await render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      const btn = container.querySelector('#theme-toggle-btn') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(container.querySelector('[role="menu"]')).not.toBeNull();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[role="menu"]')).toBeNull();
    });

    it('deve fechar o menu ao clicar fora do componente', async () => {
      await render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );

      const btn = container.querySelector('#theme-toggle-btn') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(container.querySelector('[role="menu"]')).not.toBeNull();

      await act(async () => {
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });

      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[role="menu"]')).toBeNull();
    });
  });
});
