import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], // Removido tsconfigPaths()
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    exclude: ['node_modules/**', '.next/**', 'dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'dist/',
        'public/',
        '*.config.ts',
        '*.config.mjs',
        '*.d.ts',
        'src/app/**',
      ],
    },
  },
  resolve: {
    // Removido o alias manual, pois o tsconfigPaths nativo cuidará disso
    // Adicionado o suporte nativo para tsconfig.json paths
    tsconfigPaths: true,
  },
});