import { describe, it, expect } from 'vitest';
import { validateAllowedOrigins } from '../../../src/lib/env/allowed-origins';

describe('Startup Guard - Validação de Ambiente para Produção', () => {
  it('impede inicialização se ALLOWED_ORIGINS estiver ausente em produção', () => {
    const check = validateAllowedOrigins(undefined, 'production');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('ALLOWED_ORIGINS é obrigatória');
  });

  it('impede inicialização se ALLOWED_ORIGINS estiver vazia em produção', () => {
    const check = validateAllowedOrigins('   ', 'production');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('ALLOWED_ORIGINS é obrigatória');
  });

  it('impede inicialização se ALLOWED_ORIGINS contiver apenas HTTP em produção', () => {
    const check = validateAllowedOrigins('http://carteiraexpert.com.br', 'production');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('Produção exige obrigatoriamente protocolo HTTPS');
  });

  it('impede inicialização se ALLOWED_ORIGINS contiver apenas origens locais em produção', () => {
    const check = validateAllowedOrigins('https://localhost,https://127.0.0.1', 'production');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('não pode conter exclusivamente endereços locais');
  });

  it('permite inicialização se ALLOWED_ORIGINS contiver domínios oficiais HTTPS', () => {
    const check = validateAllowedOrigins(
      'https://carteiraexpert.com.br,https://app.carteiraexpert.com.br',
      'production'
    );
    expect(check.valid).toBe(true);
    expect(check.origins).toEqual([
      'https://carteiraexpert.com.br',
      'https://app.carteiraexpert.com.br',
    ]);
  });
});
