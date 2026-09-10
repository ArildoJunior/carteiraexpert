import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('Sitemap Público — Presença de Rotas Canônicas', () => {
  it('deve incluir /simulador e /carteira-sugerida na lista de rotas estáticas', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    expect(urls).toContain(`${baseUrl}/simulador`);
    expect(urls).toContain(`${baseUrl}/carteira-sugerida`);

    // Valida propriedades da rota /carteira-sugerida
    const cspEntry = entries.find((e) => e.url === `${baseUrl}/carteira-sugerida`);
    expect(cspEntry).toBeDefined();
    expect(cspEntry?.changeFrequency).toBe('daily');
    expect(cspEntry?.priority).toBeGreaterThanOrEqual(0.8);

    // Valida propriedades da rota /simulador
    const simEntry = entries.find((e) => e.url === `${baseUrl}/simulador`);
    expect(simEntry).toBeDefined();
    expect(simEntry?.changeFrequency).toBe('daily');
    expect(simEntry?.priority).toBeGreaterThanOrEqual(0.8);
  });

  it('não deve conter rotas autenticadas ou administrativas no sitemap', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    for (const u of urls) {
      expect(u).not.toContain('/dashboard');
      expect(u).not.toContain('/portfolios');
      expect(u).not.toContain('/fiscal');
      expect(u).not.toContain('/options');
      expect(u).not.toContain('/editorial');
      expect(u).not.toContain('/api/');
    }
  });
});
