import { THEME_STORAGE_KEY } from './theme.types';

/**
 * Script inline injetado no <head> para evitar Flash of Unstyled/Incorrect Theme (FOUC).
 * Executa de forma síncrona antes do primeiro paint da página.
 */
export const themeScriptInline = `
(function() {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var isDark = false;
    if (stored === 'dark') {
      isDark = true;
    } else if (stored === 'light') {
      isDark = false;
    } else {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch (e) {}
})();
`;
