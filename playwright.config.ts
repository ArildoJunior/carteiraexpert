import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Carrega .env localmente se a variável DATABASE_URL_TEST não estiver no ambiente
if (!process.env.DATABASE_URL_TEST) {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignora erro ao ler .env
  }
}

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    'DATABASE_URL_TEST é obrigatória para a execução dos testes E2E.'
  );
}

// Use o diretório raiz do projeto para caminhos relativos
const PORT = process.env.PORT || 3005;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'), // Onde seus testes E2E estarão
  fullyParallel: true, // Executa testes em paralelo
  forbidOnly: !!process.env.CI, // Proíbe .only em CI
  retries: process.env.CI ? 2 : 0, // Tenta novamente em CI
  workers: 2, // Limita workers concorrentes para evitar contenção de CPU no Argon2id
  timeout: 45 * 1000, // Timeout por teste (45s)
  expect: {
    timeout: 15 * 1000, // Timeout para asserções expect (15s)
  },
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
    command: 'npx next start -p 3005', // Inicia o servidor de produção na porta 3005
    url: BASE_URL,
    reuseExistingServer: false, // Garante que o Playwright sempre inicie um processo novo
    timeout: 120 * 1000, // Tempo limite para o servidor iniciar
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST,
      ALLOWED_ORIGINS: 'http://localhost:3005,http://127.0.0.1:3005',
    },
  },
});