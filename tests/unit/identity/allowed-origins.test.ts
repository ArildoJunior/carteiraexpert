import { describe, it, expect } from 'vitest';
import { validateAllowedOrigins, parseAllowedOrigins } from '../../../src/lib/env/allowed-origins';

describe('Validador de ALLOWED_ORIGINS', () => {
  describe('Ambiente de PRODUÇÃO (nodeEnv = "production")', () => {
    it('falha se ALLOWED_ORIGINS for undefined', () => {
      const res = validateAllowedOrigins(undefined, 'production');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('obrigatória e não pode estar vazia');
    });

    it('falha se ALLOWED_ORIGINS for string vazia ou apenas espaços', () => {
      const res1 = validateAllowedOrigins('', 'production');
      expect(res1.valid).toBe(false);

      const res2 = validateAllowedOrigins('   ', 'production');
      expect(res2.valid).toBe(false);
    });

    it('aceita uma origem HTTPS válida', () => {
      const res = validateAllowedOrigins('https://carteiraexpert.com.br', 'production');
      expect(res.valid).toBe(true);
      expect(res.origins).toEqual(['https://carteiraexpert.com.br']);
      expect(res.error).toBeUndefined();
    });

    it('aceita múltiplas origens HTTPS válidas com espaços variados', () => {
      const raw = '  https://carteiraexpert.com.br , https://app.carteiraexpert.com.br  ';
      const res = validateAllowedOrigins(raw, 'production');
      expect(res.valid).toBe(true);
      expect(res.origins).toEqual([
        'https://carteiraexpert.com.br',
        'https://app.carteiraexpert.com.br',
      ]);
    });

    it('rejeita origem com protocolo HTTP inseguro em produção', () => {
      const res = validateAllowedOrigins('http://carteiraexpert.com.br', 'production');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Produção exige obrigatoriamente protocolo HTTPS');
    });

    it('rejeita configuração contendo exclusivamente origens locais em produção', () => {
      const res = validateAllowedOrigins('https://localhost', 'production');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('não pode conter exclusivamente endereços locais');
    });

    it('rejeita curingas (*)', () => {
      const res1 = validateAllowedOrigins('*', 'production');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Curingas (*) não são permitidos');

      const res2 = validateAllowedOrigins('https://*.carteiraexpert.com.br', 'production');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Curingas (*) não são permitidos');
    });

    it('rejeita URLs malformadas', () => {
      const res = validateAllowedOrigins('not-a-valid-url', 'production');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Origem malformada');
    });

    it('rejeita origens com caminhos (path)', () => {
      const res = validateAllowedOrigins('https://carteiraexpert.com.br/api', 'production');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('não deve conter caminho (path)');
    });

    it('rejeita origens com query params ou hash', () => {
      const res1 = validateAllowedOrigins('https://carteiraexpert.com.br?ref=1', 'production');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('não deve conter parâmetros de busca');

      const res2 = validateAllowedOrigins('https://carteiraexpert.com.br#anchor', 'production');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('não deve conter âncora');
    });

    it('parseAllowedOrigins lança erro em caso de configuração inválida em produção', () => {
      expect(() => parseAllowedOrigins(undefined, 'production')).toThrow(
        /ALLOWED_ORIGINS é obrigatória e não pode estar vazia/
      );
      expect(() => parseAllowedOrigins('http://inseguro.com', 'production')).toThrow(
        /Produção exige obrigatoriamente protocolo HTTPS/
      );
    });
  });

  describe('Ambiente de DESENVOLVIMENTO (nodeEnv = "development")', () => {
    it('retorna fallback padrão seguro quando variável for omitida ou vazia', () => {
      const res1 = validateAllowedOrigins(undefined, 'development');
      expect(res1.valid).toBe(true);
      expect(res1.origins).toContain('http://localhost:3000');
      expect(res1.origins).toContain('http://localhost:3005');

      const res2 = validateAllowedOrigins('', 'development');
      expect(res2.valid).toBe(true);
      expect(res2.origins).toContain('http://localhost:3000');
    });

    it('permite origens locais personalizadas via HTTP', () => {
      const res = validateAllowedOrigins('http://localhost:4000,http://127.0.0.1:4000', 'development');
      expect(res.valid).toBe(true);
      expect(res.origins).toEqual(['http://localhost:4000', 'http://127.0.0.1:4000']);
    });

    it('permite origens HTTPS em desenvolvimento', () => {
      const res = validateAllowedOrigins('https://dev.local.internal', 'development');
      expect(res.valid).toBe(true);
      expect(res.origins).toEqual(['https://dev.local.internal']);
    });

    it('rejeita curingas mesmo em desenvolvimento', () => {
      const res = validateAllowedOrigins('*', 'development');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Curingas (*) não são permitidos');
    });
  });
});
