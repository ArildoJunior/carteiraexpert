import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Use o diretório raiz do projeto para caminhos relativos
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'), // Onde seus testes E2E estarão
  fullyParallel: true, // Executa testes em paralelo
  forbidOnly: !!process.env.CI, // Proíbe .only em CI
  retries: process.env.CI ? 2 : 0, // Tenta novamente em CI
  workers: process.env.CI ? 1 : undefined, // Número de workers em CI
  reporter: 'html', // Relatório HTML
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry', // Coleta trace na primeira tentativa falha
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm dev', // Comando para iniciar o servidor de desenvolvimento
    url: BASE_URL,
    reuseExistingServer: !process.env.CI, // Reutiliza servidor existente fora do CI
    timeout: 120 * 1000, // Tempo limite para o servidor iniciar
  },
});