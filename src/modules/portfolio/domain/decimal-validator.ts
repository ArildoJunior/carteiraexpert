import { Decimal } from '@/lib/decimal';
import { z } from 'zod';

const STRICT_DECIMAL_STRING_REGEX = /^[+-]?\d+(\.\d+)?$/;

export interface DecimalValidatorOptions {
  min?: Decimal;
  minExclusive?: Decimal;
  max?: Decimal;
  maxPrecision: number;
  maxScale: number;
  fieldName: string;
}

/**
 * Validador e normalizador estrito de valores financeiros para Zod.
 *
 * Regras mandatórias:
 * 1. Rejeita o tipo number do JavaScript para evitar imprecisão de ponto flutuante IEEE 754.
 * 2. Rejeita strings vazias, NaN, Infinity e notação científica.
 * 3. Valida limites estritos de precisão (total de dígitos) e escala (casas decimais).
 * 4. Retorna representação canônica em string decimal convencional (sem notação científica)
 *    para persistência determinística no PostgreSQL via NUMERIC.
 */
export function createDecimalValidator(options: DecimalValidatorOptions) {
  return z
    .custom<string | Decimal>(
      (val) => {
        // Rejeita estritamente o tipo 'number' do JavaScript
        if (typeof val === 'number') return false;
        if (typeof val === 'string') return true;
        if (val instanceof Decimal) return true;
        return false;
      },
      {
        message: `${options.fieldName} deve ser fornecido como string numérica ou Decimal. O tipo 'number' do JavaScript é estritamente proibido.`,
      }
    )
    .transform((val, ctx) => {
      let rawStr: string;

      if (typeof val === 'string') {
        rawStr = val.trim();

        if (rawStr === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options.fieldName} não pode ser vazio.`,
          });
          return z.NEVER;
        }

        // Rejeita notação científica explícita
        if (/[eE]/.test(rawStr)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options.fieldName} não pode utilizar notação científica.`,
          });
          return z.NEVER;
        }

        // Valida formato padrão com ponto decimal
        if (!STRICT_DECIMAL_STRING_REGEX.test(rawStr)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options.fieldName} deve estar no formato decimal convencional (ex: "100.50").`,
          });
          return z.NEVER;
        }
      } else {
        // Instância de Decimal
        rawStr = val.toFixed();
        if (/[eE]/.test(rawStr)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${options.fieldName} não pode utilizar notação científica.`,
          });
          return z.NEVER;
        }
      }

      let dec: Decimal;
      try {
        dec = new Decimal(rawStr);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} contém um valor decimal inválido.`,
        });
        return z.NEVER;
      }

      if (dec.isNaN() || !dec.isFinite()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} não pode ser NaN ou Infinito.`,
        });
        return z.NEVER;
      }

      if (options.min && dec.lessThan(options.min)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} deve ser maior ou igual a ${options.min.toFixed()}.`,
        });
        return z.NEVER;
      }

      if (options.minExclusive && dec.lessThanOrEqualTo(options.minExclusive)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} deve ser estritamente maior que ${options.minExclusive.toFixed()}.`,
        });
        return z.NEVER;
      }

      if (options.max && dec.greaterThan(options.max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} deve ser menor ou igual a ${options.max.toFixed()}.`,
        });
        return z.NEVER;
      }

      // Validação de escala (casas decimais)
      const scale = dec.decimalPlaces();
      if (scale > options.maxScale) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} excede o limite de ${options.maxScale} casas decimais (recebido: ${scale}).`,
        });
        return z.NEVER;
      }

      // Validação de precisão total de dígitos significativos
      const precision = dec.precision(true);
      if (precision > options.maxPrecision) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${options.fieldName} excede o limite de precisão de ${options.maxPrecision} dígitos (recebido: ${precision}).`,
        });
        return z.NEVER;
      }

      // Retorna representação decimal canônica fixa sem notação científica
      return dec.toFixed();
    });
}
