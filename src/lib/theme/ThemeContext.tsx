'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type ThemePreference,
  type ResolvedTheme,
  type ThemeTokens,
  THEME_STORAGE_KEY,
  THEME_TOKENS,
} from './theme.types';

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  tokens: ThemeTokens;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage indisponível ou restrito
  }
  return 'system';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return getSystemTheme();
}

function getInitialResolvedTheme(defaultTheme: ThemePreference): ResolvedTheme {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
  }
  return resolveTheme(defaultTheme);
}

function getInitialTheme(defaultTheme: ThemePreference): ThemePreference {
  if (typeof window !== 'undefined') {
    return getStoredTheme();
  }
  return defaultTheme;
}

function applyThemeClass(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: ThemePreference;
}) {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    getInitialTheme(defaultTheme)
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolvedTheme(defaultTheme)
  );

  // Sincronização no cliente
  useEffect(() => {
    const initialPreference = getStoredTheme();
    const resolved = resolveTheme(initialPreference);
    setThemeState(initialPreference);
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
  }, []);

  // Monitora alterações na preferência do sistema quando o tema for 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const newResolved: ResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newResolved);
        applyThemeClass(newResolved);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      // Compatibilidade legada
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemeState(newTheme);
    const newResolved = resolveTheme(newTheme);
    setResolvedTheme(newResolved);
    applyThemeClass(newResolved);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignora erro de acesso a localStorage
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemePreference =
      resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  const tokens = useMemo(
    () => THEME_TOKENS[resolvedTheme],
    [resolvedTheme]
  );

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      theme,
      resolvedTheme,
      tokens,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, tokens, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser utilizado dentro de um ThemeProvider.');
  }
  return context;
}
