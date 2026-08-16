import Decimal from 'decimal.js';

// Configurações globais padrão de infraestrutura para cálculos de alta precisão
Decimal.set({
  precision: 40, // 40 dígitos significativos
  rounding: Decimal.ROUND_HALF_EVEN, // Padrão financeiro (arredondamento bancário)
});

export { Decimal };
export default Decimal;
