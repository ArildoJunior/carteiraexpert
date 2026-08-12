import { describe, it, expect } from 'vitest';
import { Decimal } from '../../src/lib/decimal';

describe('Decimal Unit Tests (Cálculos Financeiros de Alta Precisão)', () => {
  it('deve usar importação exclusiva do módulo centralizado', () => {
    // Garante que importamos a classe configurada de src/lib/decimal
    expect(Decimal).toBeDefined();
    expect(Decimal.precision).toBe(40);
  });

  it('deve demonstrar a imprecisão do tipo number nativo para contraste explicativo', () => {
    // Este teste demonstra apenas a falha do padrão IEEE 754 de number nativo.
    // O tipo number NUNCA deve ser utilizado para cálculos financeiros no sistema.
    const numberSum = 0.1 + 0.2;
    expect(numberSum).not.toBe(0.3);
    expect(numberSum).toBeCloseTo(0.3, 15);
  });

  it('deve efetuar cálculos com Decimal e manter precisão matemática exata', () => {
    // A API de cálculos financeiros do sistema usa obrigatoriamente strings e Decimal
    const d1 = new Decimal('0.1');
    const d2 = new Decimal('0.2');
    const sum = d1.plus(d2);

    expect(sum.toString()).toBe('0.3');
    expect(sum.equals(new Decimal('0.3'))).toBe(true);
  });

  it('deve serializar e desserializar sem perda de precisão via string', () => {
    const original = new Decimal('123456789012345.123456789012345');
    const serialized = original.toString();
    const restored = new Decimal(serialized);

    expect(restored.equals(original)).toBe(true);
    expect(restored.toString()).toBe('123456789012345.123456789012345');
  });

  it('deve respeitar a precisão configurada de 40 dígitos significativos', () => {
    // 1 / 3 deve gerar 40 casas '3'
    const one = new Decimal('1');
    const three = new Decimal('3');
    const div = one.div(three);
    
    expect(div.toString()).toBe('0.3333333333333333333333333333333333333333');
    expect(div.toString().split('.')[1].length).toBe(40);
  });
});
