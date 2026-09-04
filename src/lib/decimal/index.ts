import Decimal from 'decimal.js';

// Configurações globais padrão de infraestrutura para cálculos de alta precisão
Decimal.set({
  precision: 40, // 40 dígitos significativos
  rounding: Decimal.ROUND_HALF_EVEN, // Padrão financeiro (arredondamento bancário)
});

export { Decimal };
export default Decimal;
export * from './validator';

/**
 * Converte de forma segura string canônica ou instância de Decimal em Decimal.
 * Rejeita explicitamente o tipo 'number' do JavaScript.
 */
export function toDecimal(value: string | Decimal): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(value);
}
